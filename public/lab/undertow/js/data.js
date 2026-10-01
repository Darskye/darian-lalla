// Loaders for the packed data files written by tools/undertow/*.py.

import { clamp, fetchBytes, fetchJSON, sqrtTable } from "./util.js";

export async function loadManifests() {
  const [scenes, insights, forecast, wind] = await Promise.all([
    fetchJSON("data/scenes.json"),
    fetchJSON("data/insights.json").catch(() => null),
    fetchJSON("data/forecast.json").catch(() => null),
    fetchJSON("data/wind.json").catch(() => null),
  ]);
  return { scenes, insights, forecast, wind };
}

export function oceanGeo(sc) {
  return {
    W: sc.W, H: sc.H, global: false,
    lonEdge: sc.lon0 - sc.dlon / 2, latEdge: sc.lat0 - sc.dlat / 2,
    lonSpan: sc.W * sc.dlon, latSpan: sc.H * sc.dlat,
  };
}

// ---------------------------------------------------------------- ocean
// Per day: u, v (int8 sqrt curve), temperature (uint8 over tmin..tmax), optional anomaly
// (int8, 0.1 degC); then one land/sea mask.
export async function loadOcean(sc, onProgress) {
  const bytes = await fetchBytes(sc.file, sc.bytes, onProgress);
  const n = sc.W * sc.H, N = sc.dates.length, P = sc.planes || 3;
  if (bytes.length !== N * P * n + n) throw new Error("unexpected ocean data size");
  const deq = sqrtTable(sc.vmax);
  const i8 = new Int8Array(bytes.buffer, bytes.byteOffset, bytes.length);
  const u = new Float32Array(N * n), v = new Float32Array(N * n), sst = new Float32Array(N * n);
  const anom = P > 3 ? new Float32Array(N * n) : null;
  const tr = (sc.tmax - sc.tmin) / 255;
  for (let k = 0; k < N; k++) {
    const b = k * P * n, o = k * n;
    for (let j = 0; j < n; j++) {
      u[o + j] = deq[bytes[b + j]];
      v[o + j] = deq[bytes[b + n + j]];
      sst[o + j] = sc.tmin + bytes[b + 2 * n + j] * tr;
      if (anom) anom[o + j] = i8[b + 3 * n + j] * (sc.anomScale || 0.1);
    }
  }
  return { sc, n, N, W: sc.W, H: sc.H, u, v, sst, anom, mask: bytes.slice(N * P * n) };
}

export const ANOM_RANGE = 5; // degC mapped to the ends of the anomaly palette

/** RGBA float field for the GPU: u, v, scalar (0..1), mask. frames: list of day indices. */
export function oceanField(o, scalar = "sst", frames = null, uv = null) {
  const idx = frames || [...Array(o.N).keys()];
  const { n, sc } = o;
  const data = new Float32Array(idx.length * n * 4);
  const span = sc.tmax - sc.tmin;
  idx.forEach((k, f) => {
    const src = k * n;
    for (let j = 0; j < n; j++) {
      const q = (f * n + j) * 4;
      data[q] = uv ? uv.u[f * n + j] : o.u[src + j];
      data[q + 1] = uv ? uv.v[f * n + j] : o.v[src + j];
      data[q + 2] = scalar === "anom" && o.anom
        ? clamp((o.anom[src + j] + ANOM_RANGE) / (2 * ANOM_RANGE))
        : (o.sst[src + j] - sc.tmin) / span;
      data[q + 3] = o.mask[j] / 255;
    }
  });
  return data;
}

/** Bilinear sample of a per-day plane at domain uv and fractional day t. */
export function samplePlane(plane, o, ux, uy, t) {
  const { W, H, n, N } = o;
  const x = clamp(ux * W - 0.5, 0, W - 1.001), y = clamp(uy * H - 0.5, 0, H - 1.001);
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const d0 = clamp(Math.floor(t), 0, N - 1), d1 = Math.min(d0 + 1, N - 1), fm = t - d0;
  let s = 0;
  for (const [k, wk] of [[d0, 1 - fm], [d1, fm]]) {
    const b = k * n;
    s += wk * ((1 - fx) * (1 - fy) * plane[b + j * W + i] + fx * (1 - fy) * plane[b + j * W + i + 1]
      + (1 - fx) * fy * plane[b + (j + 1) * W + i] + fx * fy * plane[b + (j + 1) * W + i + 1]);
  }
  return s;
}
export function maskAt(o, ux, uy) {
  const i = clamp(Math.round(ux * o.W - 0.5), 0, o.W - 1), j = clamp(Math.round(uy * o.H - 0.5), 0, o.H - 1);
  return o.mask[j * o.W + i] > 127;
}

// ---------------------------------------------------------------- forecast
// For each run: LEADS days x [u, v] (int8 sqrt curve, same vmax as the ocean scene).
export async function loadForecast(entry, sc, onProgress) {
  const bytes = await fetchBytes(entry.file, entry.bytes, onProgress);
  const n = entry.W * entry.H, L = entry.leads;
  const deq = sqrtTable(sc.vmax);
  return entry.runs.map((run, r) => {
    const u = new Float32Array(L * n), v = new Float32Array(L * n);
    for (let k = 0; k < L; k++) {
      const b = (r * L + k) * 2 * n;
      for (let j = 0; j < n; j++) {
        u[k * n + j] = deq[bytes[b + j]];
        v[k * n + j] = deq[bytes[b + n + j]];
      }
    }
    return { ...run, u, v };
  });
}

// ---------------------------------------------------------------- wind
export function windGeo(g, W, H) {
  return { W, H, global: true, lonEdge: g.lon0 - g.d / 2, latEdge: g.lat0 - g.d / 2, lonSpan: W * g.d, latSpan: H * g.d };
}
export async function loadWind(w, onProgress) {
  const keys = ["surface", "jet", "air", "rain", "pressure", "land"];
  const total = keys.reduce((s, k) => s + w.files[k].bytes, 0);
  const done = {};
  const report = () => onProgress(keys.reduce((s, k) => s + (done[k] || 0) * w.files[k].bytes, 0) / total);
  const got = await Promise.all(keys.map((k) => fetchBytes(w.files[k].file, w.files[k].bytes, (f) => { done[k] = f; report(); })));
  const [surf, jet, air, rain, pres, land] = got;
  const S = w.hours.length;
  const g = w.grid, g1 = w.grid1;
  const n = g.W * g.H, n1 = g1.W * g1.H;
  const d10 = sqrtTable(w.scales.v10), d250 = sqrtTable(w.scales.v250);
  const out = {
    S, n, n1, W: g.W, H: g.H, W1: g1.W, H1: g1.H,
    u: new Float32Array(S * n), v: new Float32Array(S * n), air: new Float32Array(S * n),
    ju: new Float32Array(S * n1), jv: new Float32Array(S * n1),
    rain, pres, land,
  };
  const { tmin, tmax } = w.scales;
  for (let s = 0; s < S; s++) {
    for (let j = 0; j < n; j++) {
      out.u[s * n + j] = d10[surf[(2 * s) * n + j]];
      out.v[s * n + j] = d10[surf[(2 * s + 1) * n + j]];
      out.air[s * n + j] = tmin + (air[s * n + j] / 255) * (tmax - tmin);
    }
    for (let j = 0; j < n1; j++) {
      out.ju[s * n1 + j] = d250[jet[(2 * s) * n1 + j]];
      out.jv[s * n1 + j] = d250[jet[(2 * s + 1) * n1 + j]];
    }
  }
  return out;
}
export function windField(wd, scales, layer) {
  const jet = layer === "jet";
  const n = jet ? wd.n1 : wd.n, S = wd.S;
  const data = new Float32Array(S * n * 4);
  const { tmin, tmax } = scales;
  for (let q = 0; q < S * n; q++) {
    data[q * 4] = jet ? wd.ju[q] : wd.u[q];
    data[q * 4 + 1] = jet ? wd.jv[q] : wd.v[q];
    data[q * 4 + 2] = jet ? 0.5 : (wd.air[q] - tmin) / (tmax - tmin);
    data[q * 4 + 3] = 1;
  }
  return data;
}
export const rainMmh = (b, max) => Math.expm1((b / 255) * Math.log1p(max));
