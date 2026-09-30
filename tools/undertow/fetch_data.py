"""Fetch real ocean data for the Undertow piece and pack it for the browser.

Two public NOAA CoastWatch datasets, both on the same 0.25 degree grid:
  - nesdisSSH1day: surface currents (ugos, vgos, m/s) derived from satellite
    altimetry. Satellites measure the height of the sea surface; the slope of
    that surface gives the current (geostrophic balance).
  - ncdcOisst21NrtAgg_LonPM180: daily sea-surface temperature (NOAA OISST v2.1).

For each scene (a box of ocean) we download N days, fill small gaps, squeeze
every value into one byte, gzip it, base64 it (so any static host will serve
it as plain text) and write:
  public/lab/undertow/data/<scene>.txt   (base64 of gzipped bytes, see pack())
  public/lab/undertow/data/scenes.json   (grid, dates and scaling per scene)

Usage:  python tools/undertow/fetch_data.py [--days 60] [--end 2026-09-28]
Needs:  numpy, scipy, netCDF4  (pip install numpy scipy netCDF4)
"""

import argparse
import base64
import datetime as dt
import gzip
import json
import pathlib
import urllib.request

import netCDF4
import numpy as np
from scipy import ndimage

ERDDAP = "https://coastwatch.pfeg.noaa.gov/erddap/griddap"
OUT = pathlib.Path(__file__).resolve().parents[2] / "public" / "lab" / "undertow" / "data"
CACHE = pathlib.Path(__file__).resolve().parent / ".cache"

SCENES = [
    {
        "id": "gulf-stream",
        "name": "Gulf Stream",
        "where": "North Atlantic · off Cape Hatteras",
        "blurb": "Warm water from the Caribbean races up the US coast, leaves it at Cape Hatteras and breaks into meanders and rings the size of small countries.",
        "lon": (-82, -40),
        "lat": (22, 48),
        "focus": (-66, 37),
    },
    {
        "id": "agulhas",
        "name": "Agulhas Retroflection",
        "where": "Indian / Atlantic · off South Africa",
        "blurb": "The Agulhas Current overshoots the tip of Africa, turns back on itself and sheds warm rings that drift into the Atlantic.",
        "lon": (8, 42),
        "lat": (-46, -26),
        "focus": (22, -38),
    },
    {
        "id": "kuroshio",
        "name": "Kuroshio Extension",
        "where": "North Pacific · east of Japan",
        "blurb": "Japan's Black Current leaves the coast near Tokyo and snakes east as a jet, one of the most energetic places in the ocean.",
        "lon": (124, 166),
        "lat": (22, 46),
        "focus": (146, 35),
    },
    {
        "id": "malvinas",
        "name": "Brazil–Malvinas Confluence",
        "where": "South Atlantic · off Argentina",
        "blurb": "Warm Brazil Current water collides head-on with the cold Malvinas Current, and the two twist into some of the sharpest fronts on Earth.",
        "lon": (-66, -34),
        "lat": (-52, -28),
        "focus": (-52, -40),
    },
]


def download(url, name):
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / name
    if not path.exists():
        print("  GET", url[:140], "...")
        with urllib.request.urlopen(url, timeout=600) as r:
            path.write_bytes(r.read())
    return path


def box(lat, lon):
    return f"[({lat[0]}):1:({lat[1]})][({lon[0]}):1:({lon[1]})]"


def fetch_scene(sc, start, end):
    b = box(sc["lat"], sc["lon"])
    t = f"[({start}):1:({end})]"
    cur = download(f"{ERDDAP}/nesdisSSH1day.nc?ugos{t}{b},vgos{t}{b}", f"{sc['id']}_cur_{start}_{end}.nc")
    t12 = f"[({start}T12:00:00Z):1:({end}T12:00:00Z)][(0.0)]"
    sst = download(f"{ERDDAP}/ncdcOisst21NrtAgg_LonPM180.nc?sst{t12}{b}", f"{sc['id']}_sst_{start}_{end}.nc")

    with netCDF4.Dataset(cur) as c, netCDF4.Dataset(sst) as s:
        lat = np.asarray(c["latitude"][:], dtype=np.float64)
        lon = np.asarray(c["longitude"][:], dtype=np.float64)
        assert np.allclose(lat, s["latitude"][:]) and np.allclose(lon, s["longitude"][:]), "grids differ"
        cdays = [d.date().isoformat() for d in netCDF4.num2date(c["time"][:], c["time"].units, only_use_cftime_datetimes=False)]
        sdays = [d.date().isoformat() for d in netCDF4.num2date(s["time"][:], s["time"].units, only_use_cftime_datetimes=False)]
        u = np.ma.filled(c["ugos"][:].astype(np.float64), np.nan)
        v = np.ma.filled(c["vgos"][:].astype(np.float64), np.nan)
        T = np.ma.filled(s["sst"][:, 0].astype(np.float64), np.nan)

    days = sorted(set(cdays) & set(sdays))
    ci = [cdays.index(d) for d in days]
    si = [sdays.index(d) for d in days]
    u, v, T = u[ci], v[ci], T[si]
    if lat[0] > lat[-1]:  # keep row 0 = south
        lat, u, v, T = lat[::-1], u[:, ::-1], v[:, ::-1], T[:, ::-1]
    return days, lat, lon, u, v, T


def fill_gaps(u, v, T, ocean):
    """Currents are missing near coasts (altimetry can't see shallow shelves).
    Extend them from the nearest measured cell, fading out over ~3 cells, so
    particles slow down gently instead of hitting a wall. Temperature over land
    takes the nearest ocean value so colors don't smear dark at the coast."""
    for k in range(u.shape[0]):
        known = np.isfinite(u[k]) & np.isfinite(v[k])
        dist, (iy, ix) = ndimage.distance_transform_edt(~known, return_indices=True)
        fade = np.exp(-dist / 3.0)
        u[k] = np.where(known, u[k], u[k][iy, ix] * fade)
        v[k] = np.where(known, v[k], v[k][iy, ix] * fade)
        u[k][~ocean] = 0
        v[k][~ocean] = 0
        tk = np.isfinite(T[k])
        _, (iy, ix) = ndimage.distance_transform_edt(~tk, return_indices=True)
        T[k] = T[k][iy, ix]
    return u, v, T


def normal_for(sc, days):
    """1991-2020 average temperature for each display day (from fetch_history.py), or None."""
    path = CACHE / f"sstnorm_{sc['id']}.npz"
    if not path.exists():
        return None
    d = np.load(path)
    keys = list(d["mmdd"])
    return np.stack([d["normal"][keys.index(day[5:])] for day in days])


def pack(u, v, T, ocean, vmax, tmin, tmax, anom=None):
    """Bytes: for each day [u int8 H*W][v int8 H*W][sst uint8 H*W]([anomaly int8 H*W, 0.1 degC]),
    then mask uint8 H*W.
    Currents use a square-root curve so slow water keeps its detail:
        q = sign(x) * sqrt(|x| / vmax) * 127   ->   x = sign(q) * (q/127)^2 * vmax"""
    def enc(x):
        x = np.clip(x, -vmax, vmax)
        return np.round(np.sign(x) * np.sqrt(np.abs(x) / vmax) * 127).astype(np.int8)

    t8 = np.round(np.clip((T - tmin) / (tmax - tmin), 0, 1) * 255).astype(np.uint8)
    parts = []
    for k in range(u.shape[0]):
        parts += [enc(u[k]).tobytes(), enc(v[k]).tobytes(), t8[k].tobytes()]
        if anom is not None:
            parts.append(np.round(np.clip(np.nan_to_num(anom[k]) * 10, -127, 127)).astype(np.int8).tobytes())
    parts.append((ocean.astype(np.uint8) * 255).tobytes())
    return gzip.compress(b"".join(parts), compresslevel=9, mtime=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--end", default="2026-09-28")
    a = ap.parse_args()
    end = dt.date.fromisoformat(a.end)
    start = (end - dt.timedelta(days=a.days - 1)).isoformat()
    OUT.mkdir(parents=True, exist_ok=True)

    manifest = {
        "generated": dt.date.today().isoformat(),
        "sources": [
            {"name": "NOAA CoastWatch · Sea Surface Height Anomalies and Geostrophic Currents from Altimetry (nesdisSSH1day)",
             "url": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisSSH1day.html"},
            {"name": "NOAA OISST v2.1 · Daily Optimum Interpolation Sea Surface Temperature",
             "url": "https://coastwatch.pfeg.noaa.gov/erddap/griddap/ncdcOisst21NrtAgg_LonPM180.html"},
        ],
        "scenes": [],
    }
    for sc in SCENES:
        print(sc["name"])
        days, lat, lon, u, v, T = fetch_scene(sc, start, end.isoformat())
        ocean = np.isfinite(T).any(axis=0)
        u, v, T = fill_gaps(u, v, T, ocean)
        speed = np.hypot(u, v)[:, ocean]
        vmax = float(np.ceil(np.percentile(speed, 99.95) * 10) / 10)
        tmin = float(np.floor(np.min(T[:, ocean])))
        tmax = float(np.ceil(np.max(T[:, ocean])))
        normal = normal_for(sc, days)
        anom = None if normal is None else np.where(ocean, T - normal, 0)
        blob = base64.b64encode(pack(u, v, T, ocean, vmax, tmin, tmax, anom))
        (OUT / f"{sc['id']}.txt").write_bytes(blob)
        H, W = ocean.shape
        manifest["scenes"].append({
            "id": sc["id"], "name": sc["name"], "where": sc["where"], "blurb": sc["blurb"],
            "file": f"data/{sc['id']}.txt", "bytes": len(blob),
            "W": W, "H": H,
            "lon0": float(lon[0]), "lat0": float(lat[0]),
            "dlon": float(lon[1] - lon[0]), "dlat": float(lat[1] - lat[0]),
            "focus": sc["focus"], "dates": days,
            "vmax": vmax, "tmin": tmin, "tmax": tmax,
            "planes": 3 if anom is None else 4, "anomScale": 0.1,
            "stats": {
                # 99.9th percentile, not the max: single cells in lagoons and
                # inland seas can read 6+ m/s, which is altimetry noise.
                "topSpeed": round(float(np.percentile(speed, 99.9)), 2),
                "meanSpeed": round(float(speed.mean()), 3),
                "oceanCells": int(ocean.sum()),
            },
        })
        print(f"  {W}x{H} cells, {len(days)} days, vmax {vmax} m/s, sst {tmin}..{tmax} C, {len(blob)/1e6:.2f} MB")
    (OUT / "scenes.json").write_text(json.dumps(manifest, indent=1))


if __name__ == "__main__":
    main()
