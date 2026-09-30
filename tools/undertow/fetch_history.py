"""Download the long records behind the Undertow exhibit (kept in .cache, not committed).

  hist_<id>.npz     daily surface currents 2017-02-13 .. end (nesdisSSH1day), float16.
                    Training data for the neural operator.
  sstlong_<id>.npz  daily area-mean sea-surface temperature 1981-09-01 .. end (OISST,
                    sampled every 1 degree). Feeds the 45-year warming chart.
  sstnorm_<id>.npz  1991-2020 average temperature for each day of the display window
                    at full 0.25 degree resolution (the WMO climate normal). Feeds the
                    anomaly / marine heatwave view.

Usage: python tools/undertow/fetch_history.py [--end 2026-09-28]
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import pathlib
import sys
import urllib.request

import netCDF4
import numpy as np

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_data import ERDDAP, SCENES  # noqa: E402

CACHE = pathlib.Path(__file__).resolve().parent / ".cache"
OISST_FINAL = "ncdcOisst21Agg_LonPM180"
OISST_NRT = "ncdcOisst21NrtAgg_LonPM180"


def get(url, path, tries=4):
    if path.exists():
        return path
    for k in range(tries):
        try:
            with urllib.request.urlopen(url, timeout=900) as r:
                tmp = path.with_suffix(".part")
                tmp.write_bytes(r.read())
                tmp.rename(path)
                return path
        except Exception as e:  # network hiccup: back off and retry
            print(f"  retry {k + 1} {path.name}: {e}")
            import time
            time.sleep(2 ** (k + 1))
    raise RuntimeError(f"failed {url}")


def box(sc, stride=1):
    return f"[({sc['lat'][0]}):{stride}:({sc['lat'][1]})][({sc['lon'][0]}):{stride}:({sc['lon'][1]})]"


def dates_of(var_time):
    return [d.date().isoformat() for d in netCDF4.num2date(var_time[:], var_time.units, only_use_cftime_datetimes=False)]


def currents(sc, end):
    chunks = []
    for year in range(2017, end.year + 1):
        a = "2017-02-13" if year == 2017 else f"{year}-01-01"
        b = end.isoformat() if year == end.year else f"{year}-12-31"
        t = f"[({a}):1:({b})]"
        url = f"{ERDDAP}/nesdisSSH1day.nc?ugos{t}{box(sc)},vgos{t}{box(sc)}"
        chunks.append((url, CACHE / f"cur_{sc['id']}_{year}.nc"))
    with cf.ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda c: get(*c), chunks))
    us, vs, days = [], [], []
    for _, p in chunks:
        with netCDF4.Dataset(p) as d:
            lat = np.asarray(d["latitude"][:])
            u = np.ma.filled(d["ugos"][:].astype(np.float32), np.nan)
            v = np.ma.filled(d["vgos"][:].astype(np.float32), np.nan)
            if lat[0] > lat[-1]:
                u, v = u[:, ::-1], v[:, ::-1]
            us.append(u)
            vs.append(v)
            days += dates_of(d["time"])
    u, v = np.concatenate(us), np.concatenate(vs)
    np.savez_compressed(CACHE / f"hist_{sc['id']}.npz", u=u.astype(np.float16), v=v.astype(np.float16), dates=np.array(days))
    print(f"  currents {sc['id']}: {u.shape}, {days[0]} .. {days[-1]}")


def sst_long(sc, end):
    spans = [(f"{y}-01-01", f"{y + 9}-12-31") for y in range(1981, end.year + 1, 10)]
    spans[0] = ("1981-09-01", spans[0][1])
    jobs = []
    for a, b in spans:
        b = min(dt.date.fromisoformat(b), dt.date(2026, 9, 15)).isoformat()
        url = f"{ERDDAP}/{OISST_FINAL}.nc?sst[({a}T12:00:00Z):1:({b}T12:00:00Z)][(0.0)]{box(sc, 4)}"
        jobs.append((url, CACHE / f"sstlong_{sc['id']}_{a[:4]}.nc"))
    url = f"{ERDDAP}/{OISST_NRT}.nc?sst[(2026-09-16T12:00:00Z):1:({end.isoformat()}T12:00:00Z)][(0.0)]{box(sc, 4)}"
    jobs.append((url, CACHE / f"sstlong_{sc['id']}_nrt_{end.isoformat()}.nc"))
    with cf.ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda j: get(*j), jobs))
    means, days = [], []
    for _, p in jobs:
        with netCDF4.Dataset(p) as d:
            lat = np.asarray(d["latitude"][:], dtype=np.float64)
            T = np.ma.filled(d["sst"][:, 0].astype(np.float64), np.nan)
            w = np.cos(np.radians(lat))[None, :, None] * np.isfinite(T)
            means.append(np.nansum(T * w, axis=(1, 2)) / w.sum(axis=(1, 2)))
            days += dates_of(d["time"])
    np.savez_compressed(CACHE / f"sstlong_{sc['id']}.npz", mean=np.concatenate(means).astype(np.float32), dates=np.array(days))
    print(f"  sst mean {sc['id']}: {len(days)} days, {days[0]} .. {days[-1]}")


def sst_normal(sc, start, end):
    """1991-2020 mean for each calendar day of the display window."""
    jobs = []
    for y in range(1991, 2021):
        a = start.replace(year=y).isoformat()
        b = end.replace(year=y).isoformat()
        url = f"{ERDDAP}/{OISST_FINAL}.nc?sst[({a}T12:00:00Z):1:({b}T12:00:00Z)][(0.0)]{box(sc)}"
        jobs.append((url, CACHE / f"sstnorm_{sc['id']}_{y}_{start:%m%d}_{end:%m%d}.nc"))
    with cf.ThreadPoolExecutor(3) as ex:
        list(ex.map(lambda j: get(*j), jobs))
    # NOAA's archive skips days in some 1990s years, so average by calendar day.
    days = [(start + dt.timedelta(days=k)).strftime("%m-%d") for k in range((end - start).days + 1)]
    total, count = None, np.zeros(len(days))
    for _, p in jobs:
        with netCDF4.Dataset(p) as d:
            lat = np.asarray(d["latitude"][:])
            T = np.ma.filled(d["sst"][:, 0].astype(np.float64), np.nan)
            if lat[0] > lat[-1]:
                T = T[:, ::-1]
            md = [x[5:] for x in dates_of(d["time"])]
        if total is None:
            total = np.zeros((len(days),) + T.shape[1:])
        for k, key in enumerate(md):
            if key in days:
                total[days.index(key)] += T[k]
                count[days.index(key)] += 1
    total /= count[:, None, None]
    md = days
    np.savez_compressed(CACHE / f"sstnorm_{sc['id']}.npz", normal=total.astype(np.float32), mmdd=np.array(md), years=count.astype(int))
    print(f"  sst normal {sc['id']}: {total.shape}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--end", default="2026-09-28")
    ap.add_argument("--days", type=int, default=60)
    ap.add_argument("--skip-currents", action="store_true")
    a = ap.parse_args()
    end = dt.date.fromisoformat(a.end)
    start = end - dt.timedelta(days=a.days - 1)
    CACHE.mkdir(parents=True, exist_ok=True)
    for sc in SCENES:
        print(sc["name"])
        if not a.skip_currents:
            currents(sc, end)
        sst_long(sc, end)
        sst_normal(sc, start, end)


if __name__ == "__main__":
    main()
