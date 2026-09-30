"""Fetch global weather from NOAA's GFS model for the Undertow wind room.

For one model run we take the analysis and forecasts every 6 hours out to 72 h:
  surface wind (10 m), jet-stream wind (250 hPa, ~10 km up), air temperature (2 m),
  rain rate, sea-level pressure, and the land mask.
Each field is squeezed to one byte per value, gzipped and base64'd like the ocean data.
Storms (pressure lows), the fastest surface wind and the jet core are located for callouts.

Usage: python tools/undertow/fetch_wind.py [--run 2026-09-30T12]
Needs: numpy, scipy, pygrib
"""

import argparse
import base64
import datetime as dt
import gzip
import json
import pathlib
import urllib.parse
import urllib.request

import numpy as np
import pygrib
from scipy import ndimage

OUT = pathlib.Path(__file__).resolve().parents[2] / "public" / "lab" / "undertow" / "data"
CACHE = pathlib.Path(__file__).resolve().parent / ".cache"
NOMADS = "https://nomads.ncep.noaa.gov"
HOURS = list(range(0, 73, 6))


def latest_run():
    now = dt.datetime.now(dt.timezone.utc)
    for back in range(0, 48, 6):
        t = now - dt.timedelta(hours=back)
        run = t.replace(hour=t.hour // 6 * 6, minute=0, second=0, microsecond=0)
        url = f"{NOMADS}/pub/data/nccf/com/gfs/prod/gfs.{run:%Y%m%d}/{run:%H}/atmos/gfs.t{run:%H}z.pgrb2full.0p50.f072.idx"
        try:
            urllib.request.urlopen(url, timeout=30).close()
            return run
        except Exception:
            continue
    raise RuntimeError("no recent GFS run found")


def grab(run, fh):
    path = CACHE / f"gfs_{run:%Y%m%d%H}_f{fh:03d}.grb2"
    if path.exists():
        return path
    q = {
        "dir": f"/gfs.{run:%Y%m%d}/{run:%H}/atmos",
        "file": f"gfs.t{run:%H}z.pgrb2full.0p50.f{fh:03d}",
        "var_UGRD": "on", "var_VGRD": "on", "var_TMP": "on", "var_PRATE": "on", "var_PRMSL": "on", "var_LAND": "on",
        "lev_10_m_above_ground": "on", "lev_250_mb": "on", "lev_2_m_above_ground": "on",
        "lev_surface": "on", "lev_mean_sea_level": "on",
    }
    url = f"{NOMADS}/cgi-bin/filter_gfs_0p50.pl?" + urllib.parse.urlencode(q)
    for k in range(4):
        try:
            with urllib.request.urlopen(url, timeout=300) as r:
                path.write_bytes(r.read())
            return path
        except Exception as e:
            print("  retry", fh, e)
            import time
            time.sleep(2 ** (k + 1))
    raise RuntimeError(f"failed f{fh:03d}")


def fields(path):
    """Return dict of 2D arrays, rows south->north, columns -180..180 (0.5 degree)."""
    out = {}
    with pygrib.open(str(path)) as g:
        for m in g:
            key = {
                ("UGRD", 10): "u10", ("VGRD", 10): "v10", ("UGRD", 250): "u250", ("VGRD", 250): "v250",
                ("TMP", 2): "t2m", ("PRATE", 0): "prate", ("PRMSL", 0): "mslp", ("LAND", 0): "land",
            }.get((m.shortName.upper() if m.shortName != "prmsl" else "PRMSL", m.level))
            if key is None:
                key = {"10u": "u10", "10v": "v10", "2t": "t2m", "prmsl": "mslp", "lsm": "land", "prate": "prate"}.get(m.shortName)
                if key is None and m.shortName in ("u", "v") and m.level == 250:
                    key = m.shortName + "250"
            if key is None or key in out:
                continue
            a = np.asarray(m.values, dtype=np.float64)
            lats = m.latlons()[0][:, 0]
            if lats[0] > lats[-1]:
                a = a[::-1]
            out[key] = np.roll(a, a.shape[1] // 2, axis=1)  # 0..359.5 -> -180..179.5
    return out


def sq8(x, vmax):
    x = np.clip(x, -vmax, vmax)
    return np.round(np.sign(x) * np.sqrt(np.abs(x) / vmax) * 127).astype(np.int8).tobytes()


def u8(x, lo, hi):
    return np.round(np.clip((x - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8).tobytes()


def coarsen(a):  # 0.5 -> 1 degree
    H, W = a.shape
    return a[: H - H % 2].reshape(H // 2, 2, W // 2, 2).mean(axis=(1, 3))


def write(name, parts):
    blob = base64.b64encode(gzip.compress(b"".join(parts), compresslevel=9, mtime=0))
    (OUT / name).write_bytes(blob)
    return len(blob)


def lows(mslp, lat, lon, limit=6):
    """Pressure minima deeper than 1000 hPa, at least ~12 degrees apart."""
    p = mslp / 100
    mn = ndimage.minimum_filter(p, size=25, mode="wrap")
    ys, xs = np.where((p == mn) & (p < 1000) & (np.abs(lat)[:, None] < 80))
    order = np.argsort(p[ys, xs])[:limit]
    return [{"lon": float(lon[xs[i]]), "lat": float(lat[ys[i]]), "hPa": round(float(p[ys[i], xs[i]]), 1)} for i in order]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", help="model run, e.g. 2026-09-30T12 (default: latest)")
    a = ap.parse_args()
    run = dt.datetime.strptime(a.run, "%Y-%m-%dT%H").replace(tzinfo=dt.timezone.utc) if a.run else latest_run()
    print("GFS run", run.isoformat())
    CACHE.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)

    steps = []
    for fh in HOURS:
        f = fields(grab(run, fh))
        if "prate" not in f:  # the analysis has no rain rate; use the first 3 h average
            f["prate"] = fields(grab(run, 3))["prate"]
        steps.append(f)
        print(f"  f{fh:03d}", sorted(f))

    H, W = steps[0]["u10"].shape
    lat = -90 + np.arange(H) * 0.5
    lon = -180 + np.arange(W) * 0.5
    land = steps[0]["land"] > 0.5
    lat1, lon1 = coarsen(lat[:, None] * np.ones((1, W)))[:, 0], coarsen(np.ones((H, 1)) * lon[None, :])[0]

    sp10 = np.stack([np.hypot(s["u10"], s["v10"]) for s in steps])
    sp250 = np.stack([np.hypot(s["u250"], s["v250"]) for s in steps])
    v10 = float(np.ceil(np.percentile(sp10, 99.95)))
    v250 = float(np.ceil(np.percentile(sp250, 99.95) / 5) * 5)
    tmin, tmax = -60.0, 50.0
    rain_max = 50.0  # mm/h, log scale

    surf, jet, air, rain, pres = [], [], [], [], []
    feats = []
    for s, fh in zip(steps, HOURS):
        surf += [sq8(s["u10"], v10), sq8(s["v10"], v10)]
        jet += [sq8(coarsen(s["u250"]), v250), sq8(coarsen(s["v250"]), v250)]
        air.append(u8(s["t2m"] - 273.15, tmin, tmax))
        mmh = np.maximum(s["prate"], 0) * 3600
        rain.append(u8(np.log1p(mmh), 0, np.log1p(rain_max)))
        pres.append(u8(coarsen(s["mslp"]) / 100, 940, 1050))
        sp = np.hypot(s["u10"], s["v10"])
        j, i = np.unravel_index(np.argmax(sp), sp.shape)
        spj = coarsen(np.hypot(s["u250"], s["v250"]))
        jj, ji = np.unravel_index(np.argmax(spj), spj.shape)
        rj, ri = np.unravel_index(np.argmax(mmh), mmh.shape)
        feats.append({
            "hour": fh,
            "lows": lows(s["mslp"], lat, lon),
            "gust": {"lon": float(lon[i]), "lat": float(lat[j]), "ms": round(float(sp[j, i]), 1)},
            "jet": {"lon": float(lon1[ji]), "lat": float(lat1[jj]), "ms": round(float(spj[jj, ji]), 1)},
            "rain": {"lon": float(lon[ri]), "lat": float(lat[rj]), "mmh": round(float(mmh[rj, ri]), 1)},
            "hot": round(float(s["t2m"].max() - 273.15), 1),
            "cold": round(float(s["t2m"].min() - 273.15), 1),
            "meanWind": round(float(sp[~land].mean()), 2),
        })

    files = {
        "surface": write("wind_surface.txt", surf),
        "jet": write("wind_jet.txt", jet),
        "air": write("wind_air.txt", air),
        "rain": write("wind_rain.txt", rain),
        "pressure": write("wind_pressure.txt", pres),
        "land": write("wind_land.txt", [land.astype(np.uint8).tobytes() * 1]),
    }
    manifest = {
        "run": run.strftime("%Y-%m-%dT%HZ"),
        "hours": HOURS,
        "grid": {"W": W, "H": H, "lon0": -180, "lat0": -90, "d": 0.5},
        "grid1": {"W": W // 2, "H": H // 2, "lon0": float(lon1[0]), "lat0": float(lat1[0]), "d": 1.0},
        "scales": {"v10": v10, "v250": v250, "tmin": tmin, "tmax": tmax, "rainMax": rain_max, "pMin": 940, "pMax": 1050},
        "files": {k: {"file": f"data/wind_{k}.txt", "bytes": b} for k, b in files.items()},
        "features": feats,
        "source": {"name": "NOAA NCEP Global Forecast System (GFS) 0.5°", "url": "https://www.nco.ncep.noaa.gov/pmb/products/gfs/"},
    }
    (OUT / "wind.json").write_text(json.dumps(manifest, indent=1))
    print({k: f"{b / 1e6:.2f} MB" for k, b in files.items()}, "v10", v10, "v250", v250)


if __name__ == "__main__":
    main()
