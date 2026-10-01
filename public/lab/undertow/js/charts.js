// Small hand-built SVG charts for the insight panels. Every mark comes from one scale,
// colours come from CSS tokens (see undertow.css), and lines draw in when shown.

import { rampCss, signed, clamp } from "./util.js";

const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const niceStep = (span, n = 4) => {
  const raw = span / n, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
};

/** 45-year sea temperature: warming stripes + yearly anomalies + trend. */
export function trendChart(host, trend) {
  host.innerHTML = "";
  if (!trend) { host.textContent = "Long record not available."; return; }
  const W = 340, H = 196, L = 34, R = 14, T = 26, B = 22;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img",
    "aria-label": `Sea temperature 1982 to ${trend.years.at(-1)}: ${signed(trend.perDecade, 2)} °C per decade` }, host);
  const ys = trend.years, a = trend.anomaly;
  const lo = Math.min(...a, trend.fit[0]) - 0.1, hi = Math.max(...a, trend.fit[1]) + 0.1;
  const x = (yr) => L + ((yr - ys[0]) / (ys.at(-1) - ys[0])) * (W - L - R);
  const y = (v) => T + 12 + (1 - (v - lo) / (hi - lo)) * (H - T - B - 12);

  // warming stripes: one sliver per month since the record began
  const st = trend.stripes, sw = (W - L - R) / st.length;
  const g = el("g", { class: "stripes" }, svg);
  const sMax = Math.max(...st.map(Math.abs), 1);
  st.forEach((v, i) => el("rect", { x: (L + i * sw).toFixed(2), y: T - 16, width: (sw + 0.35).toFixed(2), height: 10, fill: rampCss("anomaly", 0.5 + (0.5 * v) / sMax) }, g));
  el("text", { x: L, y: T - 20, class: "t-small" }, svg).textContent = "Every month since Sep 1981, blue cooler · red warmer";

  // grid + axis
  const step = niceStep(hi - lo, 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: Math.abs(v) < 1e-9 ? "zero" : "grid" }, svg);
    el("text", { x: L - 6, y: y(v) + 3, class: "t-axis", "text-anchor": "end" }, svg).textContent = Math.abs(v) < 1e-9 ? "0" : signed(v, step < 0.5 ? 1 : 0);
  }
  for (const yr of [1990, 2000, 2010, 2020]) el("text", { x: x(yr), y: H - 6, class: "t-axis", "text-anchor": "middle" }, svg).textContent = yr;
  el("text", { x: L + 4, y: y(0) - 5, class: "t-small" }, svg).textContent = `1991–2020 average · ${trend.normal.toFixed(1)} °C`;

  // yearly anomaly bars from the zero line
  const bw = ((W - L - R) / ys.length) * 0.62;
  const bars = el("g", { class: "bars" }, svg);
  a.forEach((v, i) => el("rect", {
    x: (x(ys[i]) - bw / 2).toFixed(2), y: Math.min(y(v), y(0)).toFixed(2), width: bw.toFixed(2),
    height: Math.abs(y(v) - y(0)).toFixed(2), fill: rampCss("anomaly", 0.5 + clamp(v / 1.2, -0.5, 0.5)),
    style: `--i:${i}`,
  }, bars));
  // trend line
  el("line", { x1: x(ys[0]), y1: y(trend.fit[0]), x2: x(ys.at(-1)), y2: y(trend.fit[1]), class: "fit draw", pathLength: 1 }, svg);
  // label the latest year
  const last = a.at(-1), lx = x(ys.at(-1)), ly = y(last);
  el("circle", { cx: lx, cy: ly, r: 3.2, class: "last" }, svg);
  const tag = trend.warmest === ys.at(-1) ? "warmest on record" : `warmest was ${trend.warmest}`;
  el("text", { x: lx - 6, y: ly - 8, class: "t-mark", "text-anchor": "end" }, svg).textContent = `${ys.at(-1)} so far ${signed(last, 2)} °C · ${tag}`;
}

/** Forecast error by lead day: the model against "tomorrow looks like today". */
export function skillChart(host, err, avg) {
  host.innerHTML = "";
  const W = 340, H = 150, L = 38, R = 14, T = 14, B = 22;
  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, class: "chart", role: "img", "aria-label": "Forecast error by days ahead" }, host);
  const n = err.model.length;
  const all = [...err.model, ...err.persistence, ...(avg ? [...avg.model, ...avg.persistence] : [])];
  const hi = Math.max(...all) * 1.1;
  const x = (k) => L + (k / (n - 1)) * (W - L - R);
  const y = (v) => T + (1 - v / hi) * (H - T - B);
  const step = niceStep(hi, 4);
  for (let v = 0; v <= hi; v += step) {
    el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "zero" : "grid" }, svg);
    el("text", { x: L - 6, y: y(v) + 3, class: "t-axis", "text-anchor": "end" }, svg).textContent = v.toFixed(2);
  }
  el("text", { x: L, y: T - 3, class: "t-small" }, svg).textContent = "Typical error, m/s";
  for (const k of [0, 6, 13]) if (k < n) el("text", { x: x(k), y: H - 8, class: "t-axis", "text-anchor": "middle" }, svg).textContent = `day ${k + 1}`;
  const path = (vals) => vals.map((v, k) => `${k ? "L" : "M"}${x(k).toFixed(1)},${y(v).toFixed(1)}`).join("");
  if (avg) {
    el("path", { d: path(avg.persistence), class: "avg-p" }, svg);
    el("path", { d: path(avg.model), class: "avg-m" }, svg);
  }
  const area = path(err.persistence) + err.model.map((v, k) => `L${x(n - 1 - k).toFixed(1)},${y(err.model[n - 1 - k]).toFixed(1)}`).join("") + "Z";
  el("path", { d: area, class: "gain" }, svg);
  el("path", { d: path(err.persistence), class: "persist draw", pathLength: 1 }, svg);
  el("path", { d: path(err.model), class: "model draw", pathLength: 1 }, svg);
  const cursor = el("g", { class: "cursor" }, svg);
  const cl = el("line", { y1: T, y2: H - B, class: "cur-line" }, cursor);
  const cm = el("circle", { r: 3.5, class: "cur-m" }, cursor);
  const cp = el("circle", { r: 3.5, class: "cur-p" }, cursor);
  return {
    setLead(k) {
      const on = k >= 1 && k <= n;
      cursor.style.opacity = on ? 1 : 0;
      if (!on) return;
      const i = Math.round(k) - 1, X = x(i);
      cl.setAttribute("x1", X); cl.setAttribute("x2", X);
      cm.setAttribute("cx", X); cm.setAttribute("cy", y(err.model[i]));
      cp.setAttribute("cx", X); cp.setAttribute("cy", y(err.persistence[i]));
    },
  };
}

/** Eddy census: how many coherent eddies spin each way. */
export function censusBar(host, e) {
  const c = e.cyclonic, a = e.anticyclonic, t = c + a || 1;
  host.innerHTML = `<div class="census-bar" role="img" aria-label="${c} cyclonic and ${a} anticyclonic eddies">`
    + `<i class="cy" style="flex:${c}"></i><i class="an" style="flex:${a}"></i></div>`
    + `<div class="census-keys"><span><i class="cy"></i>${c} cyclonic · ${Math.round((100 * c) / t)}%</span>`
    + `<span><i class="an"></i>${a} anticyclonic · ${Math.round((100 * a) / t)}%</span></div>`;
}
