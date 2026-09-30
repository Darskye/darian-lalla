// Small shared helpers: DOM, maths, formatting, palettes and data loading.

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const clamp = (x, a = 0, b = 1) => Math.min(Math.max(x, a), b);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const DIRWORD = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };

export function fmtDate(iso, withYear = true) {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return withYear ? `${d} ${MONTHS[m - 1]} ${y}` : `${d} ${MONTHS[m - 1]}`;
}
export function addDays(iso, n) {
  const t = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
export const fmtN = (x) => Math.round(x).toLocaleString("en-GB");
export const sig2 = (x) => { const p = 10 ** (Math.floor(Math.log10(Math.abs(x) || 1)) - 1); return Math.round(x / p) * p; };
export const signed = (x, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;
export function fmtLL(lon, lat) {
  return `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
}
export function heading(u, v) {
  return COMPASS[Math.round(((Math.atan2(u, v) * 180) / Math.PI + 360) % 360 / 45) % 8];
}
export function escapeHTML(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// ---------------------------------------------------------------- palettes
// Row order matters: shaders pick a palette by row index (see flow.js).
export const PALETTES = {
  heat: ["#2a56b0", "#2f86c8", "#5cb6dc", "#a9dcec", "#eee7d2", "#f8c47c", "#f2904e", "#e4573c", "#c8324a"],
  anomaly: ["#3b6fd0", "#5f98e0", "#9cc2ea", "#c9d3dc", "#8f959e", "#e9b59b", "#f08a5f", "#e2553c", "#c7293b"],
  speed: ["#1c3570", "#1f62a6", "#2e97c8", "#63c6da", "#b8e9ec", "#ffffff"],
  spin: ["#3f86e0", "#6aa8e6", "#9fc4e8", "#8d929c", "#efb49a", "#ec7c5e", "#dc4638"],
  air: ["#6b4fd8", "#3f73e6", "#2fa4d6", "#4fc7b0", "#b9df8a", "#f4d06a", "#f59c4c", "#e4583b", "#b8243f"],
  wind: ["#27407a", "#2f6db0", "#45a3cf", "#8fd3dc", "#e6f2f0", "#f7d58c", "#f39a5c", "#e25d6f", "#c04aa0"],
  jet: ["#173a5c", "#1d6f8f", "#27a8a6", "#7fd6a5", "#e8e59a", "#fbc36a", "#fff3dc"],
  error: ["#12101c", "#3d1f5c", "#7b2a8a", "#bd3b7f", "#ee6a5a", "#fbb45c", "#fff2c2"],
};
export const PAL_ROWS = ["heat", "anomaly", "speed", "spin", "air", "wind", "jet", "error"];

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export function ramp(stops, n = 256) {
  const c = stops.map(hexRgb);
  const out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * (c.length - 1);
    const k = Math.min(Math.floor(x), c.length - 2);
    const f = x - k;
    for (let j = 0; j < 3; j++) out[i * 4 + j] = Math.round(c[k][j] + (c[k + 1][j] - c[k][j]) * f);
    out[i * 4 + 3] = 255;
  }
  return out;
}
export function rampCss(name, t) {
  const r = ramp(PALETTES[name], 64);
  const i = Math.round(clamp(t) * 63) * 4;
  return `rgb(${r[i]} ${r[i + 1]} ${r[i + 2]})`;
}

// ---------------------------------------------------------------- loading
// Data files are base64 text of gzipped bytes (so any static host serves them).
export async function fetchBytes(url, expected, onProgress = () => {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  let bytes;
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (expected) onProgress(Math.min(got / expected, 1));
    }
    bytes = new Uint8Array(got);
    let o = 0;
    for (const c of chunks) { bytes.set(c, o); o += c.length; }
  } else {
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  if (url.endsWith(".txt")) {
    const s = atob(new TextDecoder().decode(bytes).trim());
    bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return bytes;
}
export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

// int8 square-root curve used by the Python packers: x = sign(q) * (q/127)^2 * vmax
export function sqrtTable(vmax) {
  const t = new Float32Array(256);
  for (let b = 0; b < 256; b++) {
    const q = b < 128 ? b : b - 256;
    t[b] = Math.sign(q) * (q / 127) ** 2 * vmax;
  }
  return t;
}
