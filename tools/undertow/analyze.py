"""Find the stories in the Undertow data and write public/lab/undertow/data/insights.json.

Per region:
  eddies     Coherent eddies found each day with the Okubo-Weiss test (spin beats strain),
             tracked from day to day: size, spin speed, warm or cold core, drift.
  heatwave   Each day's largest patch of water > 2 degC above its 1991-2020 average.
  fastest    Each day's fastest measured surface current.
  trend      45 years of area-mean sea temperature: yearly Jan-Sep means, the warming
             rate, and monthly anomalies for a warming-stripes band.
  places     A few named features for fixed callouts.

Usage: python tools/undertow/analyze.py
"""

import json
import pathlib
import sys

import numpy as np
from scipy import ndimage

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_data import SCENES, fetch_scene  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
CACHE = HERE / ".cache"
OUT = HERE.parents[1] / "public" / "lab" / "undertow" / "data"
R_EARTH = 6371e3
OMEGA = 7.2921e-5

PLACES = {
    "gulf-stream": [
        {"lon": -75.5, "lat": 35.25, "title": "Cape Hatteras", "text": "The Gulf Stream leaves the coast here and heads out to sea as a meandering jet."},
        {"lon": -79.8, "lat": 25.8, "title": "Florida Straits", "text": "The current squeezes between Florida and the Bahamas before running north."},
    ],
    "agulhas": [
        {"lon": 30.5, "lat": -31.5, "title": "Agulhas Current", "text": "Warm Indian Ocean water runs south-west along the coast of South Africa."},
        {"lon": 19.5, "lat": -39.5, "title": "Retroflection", "text": "The current turns back east on itself. Rings pinch off here and drift into the Atlantic."},
    ],
    "kuroshio": [
        {"lon": 140.8, "lat": 35.0, "title": "Leaving Japan", "text": "The Kuroshio leaves the coast near Tokyo and becomes a free eastward jet."},
        {"lon": 152.0, "lat": 35.5, "title": "Kuroshio Extension", "text": "The jet meanders east for thousands of kilometres, shedding eddies to both sides."},
    ],
    "malvinas": [
        {"lon": -54.0, "lat": -38.5, "title": "The Confluence", "text": "Warm Brazil Current water meets the cold Malvinas (Falklands) Current head-on."},
        {"lon": -56.8, "lat": -35.3, "title": "Río de la Plata", "text": "One of the world's largest estuaries spills fresh river water onto the shelf."},
    ],
}

COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def grid_metrics(lat, lon):
    dy = R_EARTH * np.radians(lat[1] - lat[0])
    dx = R_EARTH * np.cos(np.radians(lat))[:, None] * np.radians(lon[1] - lon[0]) * np.ones((1, len(lon)))
    return dx, dy


def okubo_weiss(u, v, dx, dy):
    dudx = np.gradient(u, axis=1) / dx
    dvdx = np.gradient(v, axis=1) / dx
    dudy = np.gradient(u, axis=0) / dy
    dvdy = np.gradient(v, axis=0) / dy
    w = dvdx - dudy
    sn = dudx - dvdy
    ss = dvdx + dudy
    return sn ** 2 + ss ** 2 - w ** 2, w


def detect(u, v, T, ocean, lat, lon, dx, dy):
    uu = np.nan_to_num(u)
    vv = np.nan_to_num(v)
    W, w = okubo_weiss(uu, vv, dx, dy)
    valid = ocean & np.isfinite(u)
    thr = -0.2 * np.std(W[valid])
    labels, n = ndimage.label((W < thr) & valid, structure=np.ones((3, 3)))
    f = 2 * OMEGA * np.sin(np.radians(lat))[:, None] * np.ones((1, len(lon)))
    area = dx * dy
    speed = np.hypot(uu, vv)
    LAT, LON = np.meshgrid(lat, lon, indexing="ij")
    out = []
    for k in range(1, n + 1):
        m = labels == k
        cells = m.sum()
        if cells < 8:
            continue
        ro = w[m] / f[m]
        if abs(np.mean(np.sign(ro))) < 0.8:          # mixed spin: not one coherent eddy
            continue
        wt = np.abs(w[m])
        clat = float((LAT[m] * wt).sum() / wt.sum())
        clon = float((LON[m] * wt).sum() / wt.sum())
        # Size = radius of the ring of fastest swirling water (speed-based radius):
        # look out from the centre along 16 rays and find where speed peaks.
        core_r = np.sqrt(m.sum() / np.pi)                             # cells
        cy = (clat - lat[0]) / (lat[1] - lat[0])
        cx = (clon - lon[0]) / (lon[1] - lon[0])
        radii = np.arange(0.5, 3.0 * core_r + 2, 0.25)
        ang = np.linspace(0, 2 * np.pi, 16, endpoint=False)
        ry = cy + np.sin(ang)[:, None] * radii[None]
        rx = cx + np.cos(ang)[:, None] * radii[None]
        prof = ndimage.map_coordinates(speed, [ry, rx], order=1, mode="nearest")
        imax = prof.argmax(axis=1)
        r_cells = float(np.median(radii[imax]))
        swirl = float(np.median(prof[np.arange(16), imax]))
        km_per_cell = np.sqrt(area[int(round(cy)), int(round(cx))]) / 1000
        r_km = r_cells * km_per_cell
        ring = ndimage.binary_dilation(m, iterations=2)
        outer = ndimage.binary_dilation(m, iterations=5) & ~ring & np.isfinite(T)
        core = float(np.nanmean(T[m]) - np.nanmean(T[outer])) if outer.any() else 0.0
        out.append({"lon": clon, "lat": clat, "r": r_km, "swirl": swirl, "ro": float(np.mean(ro)),
                    "cyclonic": bool(np.mean(ro) > 0), "core": core})
    return out


def km_between(a, b):
    y = np.radians(b["lat"] - a["lat"]) * R_EARTH
    x = np.radians(b["lon"] - a["lon"]) * R_EARTH * np.cos(np.radians((a["lat"] + b["lat"]) / 2))
    return float(np.hypot(x, y) / 1000), x, y


def track(days_eddies, day_ordinals):
    tracks = []
    live = []
    for d, eddies in enumerate(days_eddies):
        used = set()
        nxt = []
        for tr in live:
            last = tr["pts"][-1]
            gap = day_ordinals[d] - day_ordinals[last["d"]]
            best, bi = None, None
            for i, e in enumerate(eddies):
                if i in used or e["cyclonic"] != tr["cyclonic"]:
                    continue
                dist = km_between(last, e)[0]
                lim = max(60.0, 0.8 * last["r"]) * gap
                if dist < lim and (best is None or dist < best):
                    best, bi = dist, i
            if bi is not None:
                used.add(bi)
                tr["pts"].append({**eddies[bi], "d": d})
                nxt.append(tr)
            elif gap < 2:
                nxt.append(tr)                       # allow one missing day
        for i, e in enumerate(eddies):
            if i not in used:
                t = {"id": len(tracks), "cyclonic": e["cyclonic"], "pts": [{**e, "d": d}]}
                tracks.append(t)
                nxt.append(t)
        live = nxt
    return tracks


def summarize(tr, day_ordinals):
    p = tr["pts"]
    days = day_ordinals[p[-1]["d"]] - day_ordinals[p[0]["d"]] + 1
    dist, x, y = km_between(p[0], p[-1])
    heading = COMPASS[int(round((np.degrees(np.arctan2(x, y)) + 360) % 360 / 45)) % 8]
    return {
        "id": tr["id"], "cyclonic": tr["cyclonic"], "days": int(days),
        "r": round(float(np.mean([q["r"] for q in p])), 1),
        "swirl": round(float(np.max([q["swirl"] for q in p])), 2),
        "core": round(float(np.mean([q["core"] for q in p])), 2),
        "drift": round(dist / max(days - 1, 1), 1), "heading": heading,
        "score": float(days * np.mean([q["r"] for q in p]) * np.max([q["swirl"] for q in p])),
    }


def heatwaves(anom, ocean, lat, lon, dx, dy):
    area = dx * dy
    res = []
    for a in anom:
        m = (a > 2.0) & ocean
        labels, n = ndimage.label(m)
        if n == 0:
            res.append(None)
            continue
        sizes = ndimage.sum(area, labels, range(1, n + 1))
        k = int(np.argmax(sizes)) + 1
        mm = labels == k
        if mm.sum() < 12:
            res.append(None)
            continue
        LAT, LON = np.meshgrid(lat, lon, indexing="ij")
        w = a[mm]
        res.append({"lon": round(float((LON[mm] * w).sum() / w.sum()), 2), "lat": round(float((LAT[mm] * w).sum() / w.sum()), 2),
                    "km2": int(sizes[k - 1] / 1e6), "peak": round(float(a[mm].max()), 1), "mean": round(float(w.mean()), 1)})
    return res


def trend(sid):
    """Yearly and monthly anomalies from daily area means. NOAA's archive keeps only
    every other day in parts of the 1990s, so each day is first compared with the
    1991-2020 average for its own calendar day; averaging those anomalies is not
    biased by which days are missing."""
    path = CACHE / f"sstlong_{sid}.npz"
    if not path.exists():
        return None
    d = np.load(path)
    mean = d["mean"].astype(np.float64)
    dates = d["dates"]
    years = np.array([int(s[:4]) for s in dates])
    months = np.array([int(s[5:7]) for s in dates])
    doy = np.minimum((dates.astype("datetime64[D]") - dates.astype("datetime64[Y]").astype("datetime64[D]")).astype(int), 364)
    base = (years >= 1991) & (years <= 2020)
    clim = np.array([mean[base & (doy == k)].mean() for k in range(365)])
    clim = np.convolve(np.r_[clim[-15:], clim, clim[:15]], np.ones(31) / 31, mode="same")[15:-15]   # smooth seasonal cycle
    anom = mean - clim[doy]
    ytd_mask = np.array([s[5:] <= "09-28" for s in dates])
    normal_ytd = float(clim[: 270].mean())                         # Jan 1 .. Sep 28
    ys = list(range(1982, int(years.max()) + 1))
    ya = [float(anom[(years == y) & ytd_mask].mean()) for y in ys]
    slope, icpt = np.polyfit(ys, ya, 1)
    keys = sorted(set(zip(years, months)))
    stripes = [round(float(anom[(years == y) & (months == m)].mean()), 2) for y, m in keys]
    return {
        "years": ys, "anomaly": [round(x, 2) for x in ya], "normal": round(normal_ytd, 2),
        "perDecade": round(float(slope * 10), 2),
        "fit": [round(float(icpt + slope * ys[0]), 2), round(float(icpt + slope * ys[-1]), 2)],
        "warmest": int(ys[int(np.argmax(ya))]), "coolest": int(ys[int(np.argmin(ya))]),
        "stripes": stripes, "stripesStart": f"{keys[0][0]}-{keys[0][1]:02d}",
        "note": "Jan 1 to Sep 28 of each year, compared with the 1991-2020 average",
    }


def main():
    scenes = json.load(open(OUT / "scenes.json"))["scenes"]
    result = {}
    for sc, meta in zip(SCENES, scenes):
        days, lat, lon, u, v, T = fetch_scene(sc, meta["dates"][0], meta["dates"][-1])
        assert days == meta["dates"], "window mismatch: re-run fetch_data.py first"
        ocean = np.isfinite(T).any(axis=0)
        dx, dy = grid_metrics(lat, lon)
        import datetime as dt
        ords = [dt.date.fromisoformat(s).toordinal() for s in days]
        per_day = [detect(u[k], v[k], T[k], ocean, lat, lon, dx, dy) for k in range(len(days))]
        tracks = track(per_day, ords)
        keep = [t for t in tracks if len(t["pts"]) >= 5]
        summ = sorted((summarize(t, ords) for t in keep), key=lambda s: -s["score"])
        rank = {s["id"]: i for i, s in enumerate(summ)}
        daily = [[] for _ in days]
        for t in keep:
            for p in t["pts"]:
                daily[p["d"]].append([rank[t["id"]], round(p["lon"], 2), round(p["lat"], 2), round(p["r"], 1), round(p["swirl"], 2)])
        for dlist in daily:
            dlist.sort()
        spd = np.hypot(u, v)
        fastest = []
        for k in range(len(days)):
            s = np.where(np.isfinite(spd[k]) & ocean, spd[k], 0)
            s[s > meta["vmax"] * 1.2] = 0                           # ignore coastal spikes (see fetch_data)
            j, i = np.unravel_index(np.argmax(s), s.shape)
            fastest.append({"lon": round(float(lon[i]), 2), "lat": round(float(lat[j]), 2), "ms": round(float(s[j, i]), 2)})
        normal_path = CACHE / f"sstnorm_{sc['id']}.npz"
        hw, anom_mean = None, None
        if normal_path.exists():
            nd = np.load(normal_path)
            keys = list(nd["mmdd"])
            normal = np.stack([nd["normal"][keys.index(day[5:])] for day in days])
            anom = T - normal
            hw = heatwaves(np.nan_to_num(anom, nan=-99), ocean, lat, lon, dx, dy)
            anom_mean = round(float(np.nanmean(anom[:, ocean])), 2)
        cyc = sum(1 for s in summ if s["cyclonic"])
        result[sc["id"]] = {
            "places": PLACES[sc["id"]],
            "eddies": {"tracks": [{k: v for k, v in s.items() if k != "score"} for s in summ], "daily": daily,
                       "count": len(summ), "cyclonic": cyc, "anticyclonic": len(summ) - cyc},
            "fastest": fastest, "heatwave": hw, "windowAnomaly": anom_mean, "trend": trend(sc["id"]),
        }
        top = summ[0] if summ else None
        print(sc["id"], "eddy tracks", len(summ), f"({cyc} cyclonic)", "top", top)
    (OUT / "insights.json").write_text(json.dumps(result, separators=(",", ":")))
    print("insights.json", round((OUT / "insights.json").stat().st_size / 1e3), "KB")


if __name__ == "__main__":
    main()
