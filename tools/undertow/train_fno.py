"""Train Undertow's neural operator: a Fourier Neural Operator (FNO) that forecasts
tomorrow's surface currents from the last three days of satellite current maps.

  input   u, v for days t-2, t-1, t  +  ocean mask  +  sin(latitude)      (8 channels)
  output  the change in u, v from day t to day t+1                        (2 channels)
Longer forecasts feed each prediction back in (an "autoregressive rollout").

Split by time so the test is honest: train 2019 .. 2024 (the archive is blank before
spring 2019), validate 2025, test 2026.
The benchmark is persistence ("tomorrow looks like today"), which is hard to beat for
slow ocean eddies.

Usage:
  python tools/undertow/train_fno.py train  [--minutes 50]
  python tools/undertow/train_fno.py eval
  python tools/undertow/train_fno.py export
"""

import argparse
import base64
import datetime as dt
import gzip
import json
import math
import os
import pathlib
import sys
import time

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_data import SCENES  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / ".cache"
OUT = HERE.parents[1] / "public" / "lab" / "undertow" / "data"
CKPT = CACHE / "fno.pt"
SCALE = 0.5            # m/s; velocities are divided by this
HIST = 3               # days of history in the input
CROP = 80              # training tile, cells (20 degrees)
LEADS = 14             # forecast horizon for evaluation and export
torch.set_num_threads(int(os.environ.get("THREADS", 4)))
torch.manual_seed(0)
np.random.seed(0)


# ---------------------------------------------------------------- data
def load_region(sc):
    d = np.load(CACHE / f"hist_{sc['id']}.npz")
    u = d["u"].astype(np.float32)
    v = d["v"].astype(np.float32)
    dates = [dt.date.fromisoformat(s) for s in d["dates"]]
    valid = np.isfinite(u) & np.isfinite(v)
    # The archive is blank before spring 2019: keep only days that carry a full map.
    per_day = valid.mean((1, 2))
    good = per_day > 0.5 * per_day.max()
    ocean = valid[good].mean(0) > 0.9                # cells measured on >90% of good days
    x = np.stack([np.where(valid, u, 0), np.where(valid, v, 0)], 1) / SCALE
    x *= ocean[None, None]
    T, _, H, W = x.shape
    lat = sc["lat"][0] + 0.125 + np.arange(H) * 0.25
    sinlat = np.repeat(np.sin(np.radians(lat))[:, None], W, 1).astype(np.float32)
    ordinal = np.array([t.toordinal() for t in dates])
    return {"id": sc["id"], "x": torch.from_numpy(x), "ocean": torch.from_numpy(ocean.astype(np.float32)), "good": good,
            "sinlat": torch.from_numpy(sinlat), "dates": dates, "ord": ordinal, "H": H, "W": W}


def starts(r, first, last, horizon):
    """Indices t where days t-HIST+1 .. t+horizon exist and are consecutive."""
    o = r["ord"]
    ok = []
    for t in range(HIST - 1, len(o) - horizon):
        if (first <= r["dates"][t] <= last and o[t + horizon] - o[t - HIST + 1] == HIST - 1 + horizon
                and r["good"][t - HIST + 1 : t + horizon + 1].all()):
            ok.append(t)
    return np.array(ok)


def inputs(r, hist, ys=slice(None), xs=slice(None)):
    """hist: tensor (B, HIST, 2, h, w) -> model input (B, 8, h, w)."""
    B = hist.shape[0]
    ocean = r["ocean"][ys, xs].expand(B, 1, *hist.shape[-2:])
    sinlat = r["sinlat"][ys, xs].expand(B, 1, *hist.shape[-2:])
    return torch.cat([hist.flatten(1, 2), ocean, sinlat], 1)


# ---------------------------------------------------------------- model
class SpectralConv(nn.Module):
    def __init__(self, cin, cout, modes):
        super().__init__()
        self.m = modes
        s = 1 / (cin * cout)
        self.w_pos = nn.Parameter(s * torch.randn(cin, cout, modes, modes, dtype=torch.cfloat))
        self.w_neg = nn.Parameter(s * torch.randn(cin, cout, modes, modes, dtype=torch.cfloat))

    def forward(self, x):
        B, C, H, W = x.shape
        m = self.m
        xf = torch.fft.rfft2(x)
        out = torch.zeros(B, self.w_pos.shape[1], H, W // 2 + 1, dtype=torch.cfloat)
        out[:, :, :m, :m] = torch.einsum("bixy,ioxy->boxy", xf[:, :, :m, :m], self.w_pos)
        out[:, :, -m:, :m] = torch.einsum("bixy,ioxy->boxy", xf[:, :, -m:, :m], self.w_neg)
        return torch.fft.irfft2(out, s=(H, W))


class FNO(nn.Module):
    def __init__(self, cin=2 * HIST + 2, width=32, modes=12, layers=4, pad=8):
        super().__init__()
        self.pad = pad
        self.lift = nn.Conv2d(cin, width, 1)
        self.spec = nn.ModuleList(SpectralConv(width, width, modes) for _ in range(layers))
        self.mix = nn.ModuleList(nn.Conv2d(width, width, 1) for _ in range(layers))
        self.proj = nn.Sequential(nn.Conv2d(width, 64, 1), nn.GELU(), nn.Conv2d(64, 2, 1))

    def forward(self, x):
        p = self.pad
        h = F.pad(self.lift(x), [p, p, p, p])
        for i, (s, m) in enumerate(zip(self.spec, self.mix)):
            h = s(h) + m(h)
            if i < len(self.spec) - 1:
                h = F.gelu(h)
        return self.proj(h[..., p:-p, p:-p])


def step(model, r, hist, ys=slice(None), xs=slice(None)):
    """One day ahead: returns next (B, 2, h, w)."""
    delta = model(inputs(r, hist, ys, xs))
    return (hist[:, -1] + delta) * r["ocean"][ys, xs]


# ---------------------------------------------------------------- tiled full-domain forecast
def window(n):
    w = np.sin(np.pi * (np.arange(n) + 0.5) / n) ** 2 + 1e-3
    return torch.from_numpy(np.outer(w, w).astype(np.float32))


def tiles(n, size, stride=40):
    if n <= size:
        return [0]
    s = list(range(0, n - size, stride)) + [n - size]
    return sorted(set(s))


@torch.no_grad()
def forecast(model, r, t, leads=LEADS):
    """Roll out `leads` days from index t over the whole region, blending overlapping tiles."""
    H, W = r["H"], r["W"]
    hist = r["x"][t - HIST + 1 : t + 1].unsqueeze(0).clone()          # (1, HIST, 2, H, W)
    wy, wx = min(CROP, H), min(CROP, W)
    win = window(CROP)[:wy, :wx] if (wy, wx) != (CROP, CROP) else window(CROP)
    outs = []
    for _ in range(leads):
        acc = torch.zeros(1, 2, H, W)
        wsum = torch.zeros(1, 1, H, W)
        for y0 in tiles(H, wy):
            for x0 in tiles(W, wx):
                ys, xs = slice(y0, y0 + wy), slice(x0, x0 + wx)
                nxt = step(model, r, hist[..., ys, xs], ys, xs)
                acc[..., ys, xs] += nxt * win
                wsum[..., ys, xs] += win
        nxt = acc / wsum
        outs.append(nxt[0])
        hist = torch.cat([hist[:, 1:], nxt.unsqueeze(1)], 1)
    return torch.stack(outs)                                         # (leads, 2, H, W)


def rmse(a, b, ocean):
    d = ((a - b) ** 2).sum(-3) * ocean                                # sum over u, v
    return math.sqrt(float(d.sum() / ocean.sum())) * SCALE          # m/s


# ---------------------------------------------------------------- train
def train(minutes, resume=False):
    regions = [load_region(sc) for sc in SCENES]
    for r in regions:
        r["train"] = starts(r, dt.date(2017, 1, 1), dt.date(2024, 12, 31), 3)
        r["val"] = starts(r, dt.date(2025, 1, 1), dt.date(2025, 12, 31), 7)
        print(r["id"], r["H"], r["W"], "train", len(r["train"]), "val", len(r["val"]))
    weights = np.array([len(r["train"]) * r["ocean"].sum().item() for r in regions])
    weights = weights / weights.sum()

    model = FNO()
    if resume and CKPT.exists():
        model.load_state_dict(torch.load(CKPT))
        print("resumed from", CKPT)
    print("parameters", sum(p.numel() * (2 if p.is_complex() else 1) for p in model.parameters()))
    opt = torch.optim.AdamW(model.parameters(), lr=1e-3, weight_decay=1e-4)
    B = 16
    t0 = time.time()
    budget = minutes * 60
    it = 0
    best = validate(model, regions, n=24, leads=7)[0] if resume and CKPT.exists() else float("inf")
    history = []
    lr0 = 5e-4 if resume else 1e-3

    def batch(roll):
        r = regions[np.random.choice(len(regions), p=weights)]
        ts = np.random.choice(r["train"], B)
        y0 = np.random.randint(0, r["H"] - CROP + 1)
        x0 = np.random.randint(0, r["W"] - CROP + 1)
        ys, xs = slice(y0, y0 + CROP), slice(x0, x0 + CROP)
        seq = torch.stack([r["x"][t - HIST + 1 : t + 1 + roll, :, ys, xs] for t in ts])   # B, HIST+roll, 2, h, w
        return r, seq, ys, xs

    while time.time() - t0 < budget:
        frac = (time.time() - t0) / budget
        cut = (0.2, 0.55) if resume else (0.45, 0.7)
        roll = 1 if frac < cut[0] else (2 if frac < cut[1] else 3)        # curriculum: longer rollouts later
        for g in opt.param_groups:
            g["lr"] = lr0 * 0.5 * (1 + math.cos(math.pi * frac)) + 2e-5
        r, seq, ys, xs = batch(roll)
        hist = seq[:, :HIST]
        ocean = r["ocean"][ys, xs]
        loss = 0.0
        for k in range(roll):
            nxt = step(model, r, hist, ys, xs)
            loss = loss + (((nxt - seq[:, HIST + k]) ** 2).sum(1) * ocean).sum() / (ocean.sum() * B)
            hist = torch.cat([hist[:, 1:], nxt.unsqueeze(1)], 1)
        loss = loss / roll
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        it += 1
        if it % 200 == 0:
            m, p = validate(model, regions, n=24, leads=7)
            history.append({"it": it, "min": round((time.time() - t0) / 60, 1), "loss": float(loss.detach()), "val7": m, "persist7": p})
            print(f"it {it} {history[-1]['min']}m roll {roll} loss {float(loss.detach()):.4f} | val 7-day rmse model {m:.4f} persistence {p:.4f} m/s", flush=True)
            if m < best:
                best = m
                torch.save(model.state_dict(), CKPT)
    json.dump(history, open(CACHE / "train_history.json", "w"), indent=1)
    print("best val 7-day rmse", best)


@torch.no_grad()
def validate(model, regions, n=24, leads=7):
    rng = np.random.default_rng(1)
    tot_m = tot_p = 0.0
    for r in regions:
        for t in rng.choice(r["val"], n // len(regions), replace=False):
            f = forecast(model, r, t, leads)
            truth = r["x"][t + leads]
            tot_m += rmse(f[-1], truth, r["ocean"]) ** 2
            tot_p += rmse(r["x"][t], truth, r["ocean"]) ** 2
    k = (n // len(regions)) * len(regions)
    return math.sqrt(tot_m / k), math.sqrt(tot_p / k)


# ---------------------------------------------------------------- evaluate on 2026
@torch.no_grad()
def evaluate():
    model = FNO()
    model.load_state_dict(torch.load(os.environ.get("CKPT", CKPT)))
    model.eval()
    res = {"leads": list(range(1, LEADS + 1)), "regions": {}}
    for sc in SCENES:
        r = load_region(sc)
        test = starts(r, dt.date(2026, 1, 1), dt.date(2026, 12, 31), LEADS)
        test = test[:: int(os.environ.get("EVAL_STRIDE", 3))]            # every third start day by default
        m = np.zeros(LEADS)
        p = np.zeros(LEADS)
        for t in test:
            f = forecast(model, r, t)
            for k in range(LEADS):
                truth = r["x"][t + 1 + k]
                m[k] += rmse(f[k], truth, r["ocean"]) ** 2
                p[k] += rmse(r["x"][t], truth, r["ocean"]) ** 2
        m, p = np.sqrt(m / len(test)), np.sqrt(p / len(test))
        res["regions"][sc["id"]] = {"n": len(test), "model": m.round(4).tolist(), "persistence": p.round(4).tolist(),
                                    "skill": (1 - m / p).round(3).tolist()}
        print(sc["id"], "starts", len(test))
        print("  lead   model  persist  skill")
        for k in (0, 2, 6, 9, 13):
            print(f"  {k + 1:>4}  {m[k]:.4f}  {p[k]:.4f}  {1 - m[k] / p[k]:+.3f}")
    json.dump(res, open(CACHE / "eval_2026.json", "w"), indent=1)


# ---------------------------------------------------------------- export for the exhibit
@torch.no_grad()
def export():
    """Forecasts for the display window: hindcasts that can be checked against what
    happened, plus a real forecast from the newest day into the future."""
    model = FNO()
    model.load_state_dict(torch.load(os.environ.get("CKPT", CKPT)))
    model.eval()
    ev = json.load(open(CACHE / "eval_2026.json"))
    scenes = json.load(open(OUT / "scenes.json"))["scenes"]
    manifest = {"model": {
        "kind": "Fourier neural operator", "history_days": HIST, "crop_cells": CROP,
        "params": sum(p.numel() * (2 if p.is_complex() else 1) for p in model.parameters()),
        "train": "2019 to 2024-12-31", "validate": "2025", "test": "2026-01-01 onward",
        "eval": ev,
    }, "regions": {}}
    manifest["model"]["maps"] = 0
    for sc, meta in zip(SCENES, scenes):
        r = load_region(sc)
        manifest["model"]["maps"] += int(r["good"].sum())
        idx = {d.isoformat(): i for i, d in enumerate(r["dates"])}
        last = len(r["dates"]) - 1
        runs = []
        for start in ["2026-08-17", "2026-08-31", "2026-09-14"]:
            runs.append((start, idx[start], True))
        runs.append((r["dates"][last].isoformat(), last, False))
        parts, meta_runs = [], []
        vmax = meta["vmax"]
        for start, t, verify in runs:
            f = forecast(model, r, t).numpy() * SCALE                # m/s, (LEADS, 2, H, W)
            t0 = time.time()
            for k in range(LEADS):
                for c in range(2):
                    x = np.clip(f[k, c], -vmax, vmax)
                    parts.append(np.round(np.sign(x) * np.sqrt(np.abs(x) / vmax) * 127).astype(np.int8).tobytes())
            err = None
            if verify:
                truth = r["x"][t + 1 : t + 1 + LEADS].numpy() * SCALE
                pers = r["x"][t].numpy() * SCALE
                oc = r["ocean"].numpy() > 0
                err = {
                    "model": [round(float(np.sqrt(((f[k] - truth[k]) ** 2).sum(0)[oc].mean())), 4) for k in range(LEADS)],
                    "persistence": [round(float(np.sqrt(((pers - truth[k]) ** 2).sum(0)[oc].mean())), 4) for k in range(LEADS)],
                }
            meta_runs.append({"start": start, "verify": verify, "error": err})
        blob = base64.b64encode(gzip.compress(b"".join(parts), compresslevel=9, mtime=0))
        (OUT / f"forecast_{sc['id']}.txt").write_bytes(blob)
        manifest["regions"][sc["id"]] = {"file": f"data/forecast_{sc['id']}.txt", "bytes": len(blob), "runs": meta_runs,
                                          "W": r["W"], "H": r["H"], "leads": LEADS}
        print(sc["id"], f"{len(blob) / 1e6:.2f} MB")
    manifest["model"]["timing"] = timing(model)
    json.dump(manifest, open(OUT / "forecast.json", "w"), indent=1)


@torch.no_grad()
def timing(model):
    r = load_region(SCENES[0])
    t = len(r["dates"]) - 1
    t0 = time.perf_counter()
    forecast(model, r, t, LEADS)
    return {"seconds_14_days_cpu": round(time.perf_counter() - t0, 2)}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["train", "eval", "export"])
    ap.add_argument("--minutes", type=float, default=50)
    ap.add_argument("--resume", action="store_true")
    a = ap.parse_args()
    {"train": lambda: train(a.minutes, a.resume), "eval": evaluate, "export": export}[a.cmd]()
