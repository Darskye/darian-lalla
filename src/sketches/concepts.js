// Concept plates: imagined environmental-AI systems, drawn as live data art.

import { cmap, cmapCss } from "../lib/colormaps.js";
import { MONO } from "../lib/glyphs.js";
import { clamp, easeInOut, hash2, lerp, noise1, rng, smooth } from "../lib/math.js";
import { chrome, label } from "./draw.js";

const g1 = (x, m, s) => Math.exp(-(((x - m) / s) ** 2));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* C01 — Undertow: ocean heat transport as a flow field ---------------------------- */
export const undertow = {
  bg: "#030814",
  resize(s, w, h) {
    const r = rng(21);
    s.w = w;
    s.h = h;
    s.N = clamp(Math.round((w * h) / 300), 700, 2600);
    s.p = new Float32Array(s.N * 4);
    for (let i = 0; i < s.N; i++) this.spawn(s, i, r, true);
    s.r = r;
    s.trail = null;
    s.bins = Array.from({ length: 10 }, (_, i) => cmapCss("thermal", 0.05 + (i / 9) * 0.9));
  },
  climate(s, y) {
    return clamp(1 - y / s.h); // warm south (bottom), cold north (top)
  },
  spawn(s, i, r, anywhere) {
    const x = r() * s.w;
    const y = r() * s.h;
    s.p[i * 4] = x;
    s.p[i * 4 + 1] = y;
    s.p[i * 4 + 2] = anywhere ? r() * 6 : 0;
    s.p[i * 4 + 3] = clamp(this.climate(s, y) + (r() - 0.5) * 0.15);
  },
  field(s, x, y, t, mo) {
    const { w, h } = s;
    let u = 0;
    let v = 0;
    const vort = (cx, cy, R, k) => {
      const dx = x - cx;
      const dy = y - cy;
      const f = k * Math.exp(-(dx * dx + dy * dy) / (2 * R * R));
      u += -dy * f;
      v += dx * f;
    };
    vort(w * 0.58, h * 0.66, h * 0.3, 0.9 + 0.2 * Math.sin(t * 0.2)); // subtropical gyre
    vort(w * 0.52, h * 0.22, h * 0.22, -1.1); // subpolar gyre
    vort(w * (0.78 + 0.05 * Math.sin(t * 0.13)), h * 0.42, h * 0.08, 2.4); // shed eddies
    vort(w * (0.36 + 0.04 * Math.cos(t * 0.11)), h * 0.5, h * 0.07, -2.6);
    // western boundary current and its meandering eastward jet
    v -= 95 * g1(x, w * 0.11, w * 0.045) * (0.8 + 0.2 * Math.sin(t * 0.3 + y * 0.01));
    const jetY = h * 0.44 + h * 0.05 * Math.sin(x * 0.006 + t * 0.35);
    u += 85 * g1(y, jetY, h * 0.045) * smooth(clamp((x - w * 0.08) / (w * 0.12)));
    u += 14 * Math.sin(y * 0.021 + t * 0.4) + 10 * noise1(x * 0.004 + t * 0.1);
    if (mo.on > 0.5) {
      const dx = x - mo.x;
      const dy = y - mo.y;
      const f = 3.2 * Math.exp(-(dx * dx + dy * dy) / (2 * 70 * 70));
      u += -dy * f;
      v += dx * f;
    }
    return [u, v];
  },
  draw(ctx, w, h, t, env, s) {
    const q = ctx.getTransform().a || 1;
    if (!s.trail || s.trail.width !== Math.round(w * q)) {
      s.trail = document.createElement("canvas");
      s.trail.width = Math.round(w * q);
      s.trail.height = Math.round(h * q);
      s.tctx = s.trail.getContext("2d");
      s.tctx.scale(q, q);
      s.tctx.fillStyle = this.bg;
      s.tctx.fillRect(0, 0, w, h);
      s.lastT = t;
    }
    const dt = clamp(t - (s.lastT ?? t), 0, 0.05);
    s.lastT = t;
    const tc = s.tctx;
    tc.fillStyle = "rgba(3,8,20,0.07)";
    tc.fillRect(0, 0, w, h);
    const paths = s.bins.map(() => new Path2D());
    const mo = env.mouse;
    for (let i = 0; i < s.N; i++) {
      const k = i * 4;
      let x = s.p[k];
      let y = s.p[k + 1];
      const [u, v] = this.field(s, x, y, t, mo);
      const nx = x + u * dt;
      const ny = y + v * dt;
      s.p[k + 3] += (this.climate(s, ny) - s.p[k + 3]) * dt * 0.04;
      paths[Math.min(9, Math.floor(s.p[k + 3] * 10))].moveTo(x, y);
      paths[Math.min(9, Math.floor(s.p[k + 3] * 10))].lineTo(nx, ny);
      s.p[k] = nx;
      s.p[k + 1] = ny;
      s.p[k + 2] += dt;
      if (s.p[k + 2] > 7 + (i % 5) || nx < -5 || ny < -5 || nx > w + 5 || ny > h + 5) this.spawn(s, i, s.r, false);
    }
    tc.lineWidth = 1.1;
    paths.forEach((p, i) => {
      tc.strokeStyle = s.bins[i];
      tc.stroke(p);
    });
    ctx.drawImage(s.trail, 0, 0, w, h);

    // graticule + labels
    const ls = Math.max(7, Math.min(9, w / 70));
    ctx.strokeStyle = "rgba(245,245,240,0.07)";
    ctx.lineWidth = 1;
    ["60°N", "45°N", "30°N", "15°N"].forEach((lab, i) => {
      const y = Math.round(h * (0.16 + i * 0.22)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
      label(ctx, lab, 14, y + 4, { size: ls, alpha: 0.4 });
    });
    for (let i = 1; i < 8; i++) {
      const x = Math.round((w * i) / 8) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    // colour bar
    const bw = Math.min(220, w * 0.28);
    const bx = w - 14 - bw;
    const by = h - 22;
    for (let i = 0; i < bw; i++) {
      ctx.fillStyle = cmapCss("thermal", i / bw);
      ctx.fillRect(bx + i, by, 1, 5);
    }
    label(ctx, "SST  4°C", bx, by - 14, { size: ls, alpha: 0.55 });
    label(ctx, "28°C", bx + bw, by - 14, { size: ls, alpha: 0.55, align: "right" });
    label(ctx, "SURROGATE vs SOLVER  RMSE 0.21°C", 14, h - 22, { size: ls, alpha: 0.55 });
    chrome(ctx, w, h, "FIG.C1 — OCEAN HEAT TRANSPORT", "NEURAL OPERATOR · Δt 6 h");
  },
};

/* C02 — Dawn Chorus: 24 h of rainforest audio as a polar spectrogram -------------- */
const BANDS = [
  // [hour, hourWidth, freq(0..1), freqWidth, gain, group]
  [6.0, 0.8, 0.42, 0.2, 1.0, "PASSERIFORMES"],
  [5.5, 0.4, 0.64, 0.08, 0.7, "TROCHILIDAE"],
  [18.6, 0.7, 0.36, 0.18, 0.75, "PSITTACIDAE"],
  [13.0, 2.4, 0.52, 0.035, 0.8, "CICADIDAE"],
];
function chorusEnergy(hour, f, j, i) {
  const night = 0.5 + 0.5 * Math.cos((hour / 24) * Math.PI * 2);
  let e = 0;
  for (const [hc, hw, fc, fw, g] of BANDS) {
    const dh = Math.min(Math.abs(hour - hc), 24 - Math.abs(hour - hc));
    e += g * Math.exp(-((dh / hw) ** 2)) * g1(f, fc, fw);
  }
  e += night * g1(f, 0.74, 0.028) * 0.85; // crickets
  e += night * g1(f, 0.13, 0.045) * 0.7 * (0.55 + 0.45 * Math.sin(hour * 11)); // frogs
  e += g1(hour, 15.4, 0.35) * 0.32 * (1 - f * 0.5); // afternoon rain
  e += 0.07 * hash2(i, j) + 0.05 * (1 - f);
  return clamp(e);
}
export const dawnChorus = {
  bg: "#050507",
  resize(s, w, h) {
    s.cx = w / 2;
    s.cy = h * 0.52;
    const m = Math.min(w, h * 0.94);
    s.R0 = m * 0.14;
    s.R1 = m * 0.43;
    const q = 2;
    s.heat = document.createElement("canvas");
    s.heat.width = Math.round(w * q);
    s.heat.height = Math.round(h * q);
    const c = s.heat.getContext("2d");
    c.scale(q, q);
    const NT = 144;
    const NF = 46;
    for (let i = 0; i < NT; i++) {
      const a0 = (i / NT) * Math.PI * 2 - Math.PI / 2;
      const a1 = ((i + 1) / NT) * Math.PI * 2 - Math.PI / 2 + 0.004;
      for (let j = 0; j < NF; j++) {
        const f = j / (NF - 1);
        const e = chorusEnergy((i / NT) * 24, f, j, i);
        const r0 = lerp(s.R0, s.R1, j / NF);
        const r1 = lerp(s.R0, s.R1, (j + 1) / NF) - 0.6;
        c.fillStyle = cmapCss("viridis", Math.pow(e, 0.85));
        c.globalAlpha = 0.25 + 0.75 * Math.pow(e, 0.6);
        c.beginPath();
        c.arc(s.cx, s.cy, r1, a0, a1);
        c.arc(s.cx, s.cy, r0, a1, a0, true);
        c.closePath();
        c.fill();
      }
    }
    c.globalAlpha = 1;
    // detections: sampled where the chorus is loud
    const r = rng(8);
    s.calls = [];
    while (s.calls.length < 140) {
      const hour = r() * 24;
      const f = r();
      const e = chorusEnergy(hour, f, 0, 0);
      if (r() < e * e) {
        let group = f < 0.2 ? "ANURA" : f > 0.7 ? "ORTHOPTERA" : "AVES";
        for (const [hc, hw, fc, fw, , g] of BANDS) if (Math.abs(hour - hc) < hw * 1.3 && Math.abs(f - fc) < fw * 1.3) group = g;
        s.calls.push({ hour, f, group });
      }
    }
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(s.heat, 0, 0, w, h);
    const { cx, cy, R0, R1 } = s;
    const ls = Math.max(7, Math.min(9, w / 60));
    const hourNow = (t * 1.0) % 24;
    const ang = (hourNow / 24) * Math.PI * 2 - Math.PI / 2;

    // radar sweep
    if (ctx.createConicGradient) {
      const g = ctx.createConicGradient(ang - 0.9, cx, cy);
      g.addColorStop(0, "rgba(245,245,240,0)");
      g.addColorStop(0.143, "rgba(245,245,240,0.16)");
      g.addColorStop(0.1432, "rgba(245,245,240,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, R1 + 6, 0, Math.PI * 2);
      ctx.arc(cx, cy, R0, 0, Math.PI * 2, true);
      ctx.fill("evenodd");
    }
    ctx.strokeStyle = "rgba(245,245,240,0.85)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * R0, cy + Math.sin(ang) * R0);
    ctx.lineTo(cx + Math.cos(ang) * (R1 + 10), cy + Math.sin(ang) * (R1 + 10));
    ctx.stroke();

    // detections light up as the playhead passes
    let recent = null;
    for (const c of s.calls) {
      let since = hourNow - c.hour;
      if (since < 0) since += 24;
      if (since > 3) continue;
      const a = (c.hour / 24) * Math.PI * 2 - Math.PI / 2;
      const rr = lerp(R0, R1, c.f);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      const k = 1 - since / 3;
      ctx.fillStyle = `rgba(255,240,200,${0.9 * k})`;
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (since < 0.25) {
        ctx.strokeStyle = `rgba(255,240,200,${1 - since / 0.25})`;
        ctx.beginPath();
        ctx.arc(x, y, 3 + since * 40, 0, Math.PI * 2);
        ctx.stroke();
        recent = { c, x, y };
      }
    }
    if (recent) label(ctx, recent.c.group, recent.x + 8, recent.y - 4, { size: ls, alpha: 0.9, color: "255,240,200" });

    // axes
    ctx.strokeStyle = "rgba(245,245,240,0.12)";
    ctx.lineWidth = 1;
    [R0, R1].forEach((rad) => {
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.stroke();
    });
    for (let hh = 0; hh < 24; hh += 3) {
      const a = (hh / 24) * Math.PI * 2 - Math.PI / 2;
      label(ctx, String(hh).padStart(2, "0"), cx + Math.cos(a) * (R1 + 22), cy + Math.sin(a) * (R1 + 22) - ls / 2, { size: ls, alpha: 0.5, align: "center" });
    }
    ["0", "3k", "6k", "9k", "12k Hz"].forEach((lab, i) => {
      const rr = lerp(R0, R1, i / 4);
      label(ctx, lab, cx + 5, cy - rr - ls - 1, { size: ls - 1, alpha: 0.45 });
    });

    // centre readout
    const hh = Math.floor(hourNow);
    const mm = Math.floor((hourNow - hh) * 60);
    ctx.font = `500 ${Math.max(14, R0 * 0.34)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(245,245,240,0.95)";
    ctx.fillText(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, cx, cy - R0 * 0.12);
    const aci = Math.round(1400 + 900 * chorusEnergy(hourNow, 0.45, 1, 1) + 60 * Math.sin(t * 3));
    label(ctx, `ACI ${aci.toLocaleString("en-US")}`, cx, cy + R0 * 0.2, { size: ls, alpha: 0.6, align: "center" });

    // hover probe
    const mo = env.mouse;
    if (mo.on > 0.5) {
      const dx = mo.x - cx;
      const dy = mo.y - cy;
      const rr = Math.hypot(dx, dy);
      if (rr > R0 && rr < R1) {
        let a = Math.atan2(dy, dx) + Math.PI / 2;
        if (a < 0) a += Math.PI * 2;
        const hour = (a / (Math.PI * 2)) * 24;
        const f = (rr - R0) / (R1 - R0);
        const e = chorusEnergy(hour, f, 0, 0);
        const h2 = Math.floor(hour);
        label(ctx, `${String(h2).padStart(2, "0")}:${String(Math.floor((hour - h2) * 60)).padStart(2, "0")} · ${(f * 12).toFixed(1)} kHz · ${(20 * Math.log10(Math.max(e, 0.01))).toFixed(1)} dB`, 14, 32, { size: ls + 0.5, alpha: 0.95, color: "253,231,37" });
      }
    }
    label(ctx, "BIODIVERSITY FINGERPRINT · 37 SPECIES GROUPS", 14, h - 24, { size: ls, alpha: 0.5 });
    chrome(ctx, w, h, "FIG.C2 — 24 H OF RAINFOREST, LISTENED TO", w > 420 ? "POLAR SPECTROGRAM" : "");
  },
};

/* C03 — Thermal Memory: 175 years as a climate spiral + warming stripes ----------- */
const Y0 = 1850;
const Y1 = 2025;
function anomaly(y, m) {
  const yr = y + m / 12;
  const trend = 0.0021 * (yr - Y0) + 1.5 / (1 + Math.exp(-(yr - 2000) / 16));
  const enso = 0.12 * Math.sin((2 * Math.PI * yr) / 3.7 + 1) + 0.06 * Math.sin((2 * Math.PI * yr) / 5.3);
  return trend + enso + 0.09 * (hash2(y, m) - 0.5) - 0.03;
}
export const thermalMemory = {
  bg: "#060608",
  resize(s, w, h) {
    s.data = [];
    for (let y = Y0; y <= Y1; y++) {
      const row = [];
      for (let m = 0; m < 12; m++) row.push(anomaly(y, m));
      s.data.push(row);
    }
    s.annual = s.data.map((row) => row.reduce((a, v) => a + v, 0) / 12);
    s.cx = w / 2;
    s.cy = h * 0.44;
    s.Rm = Math.min(w, h) * 0.36;
    s.stripes = { x: 14, y: h * 0.85, w: w - 28, h: h * 0.08 };
  },
  radius(s, v) {
    return s.Rm * (0.22 + 0.78 * clamp((v + 0.6) / 2.4));
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    const period = 20;
    const lt = t % period;
    const grow = easeInOut(clamp(lt / 13));
    const fade = lt > period - 1.5 ? 1 - (lt - (period - 1.5)) / 1.5 : 1;
    const nYears = Y1 - Y0 + 1;
    const shown = grow * nYears * 12;
    const { cx, cy } = s;
    const ls = Math.max(7, Math.min(9, w / 60));

    // reference rings
    [
      [0, "0°C", "245,245,240", 0.25],
      [1, "+1.0°C", "245,245,240", 0.35],
      [1.5, "+1.5°C", "240,80,60", 0.8],
    ].forEach(([v, lab, col, a]) => {
      const rr = this.radius(s, v);
      ctx.strokeStyle = `rgba(${col},${a * 0.6})`;
      ctx.setLineDash(v === 1.5 ? [4, 4] : [1, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, lab, cx + 4, cy - rr - ls - 2, { size: ls, alpha: a, color: col });
    });
    "JFMAMJJASOND".split("").forEach((mLab, m) => {
      const a = (m / 12) * Math.PI * 2 - Math.PI / 2;
      const rr = s.Rm * 1.08;
      label(ctx, mLab, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr - ls / 2, { size: ls, alpha: 0.4, align: "center" });
    });

    // the spiral, one year per colour
    ctx.lineWidth = 1.2;
    let lastPt = null;
    let idx = 0;
    for (let yi = 0; yi < nYears && idx < shown; yi++) {
      ctx.strokeStyle = rgba(cmap("inferno", 0.18 + 0.8 * (yi / (nYears - 1))), (0.35 + 0.65 * (yi / nYears)) * fade);
      ctx.beginPath();
      for (let m = 0; m < 12 && idx < shown; m++, idx++) {
        const v1 = s.data[yi][m];
        const v0 = lastPt ? lastPt[4] : v1;
        if (!lastPt) ctx.moveTo(cx + Math.cos(-Math.PI / 2) * this.radius(s, v1), cy + Math.sin(-Math.PI / 2) * this.radius(s, v1));
        else ctx.moveTo(lastPt[0], lastPt[1]);
        let x = 0;
        let y = 0;
        for (let k = 1; k <= 4; k++) {
          const f = k / 4;
          const a = ((m - 1 + f) / 12) * Math.PI * 2 - Math.PI / 2;
          const rr = this.radius(s, lerp(v0, v1, smooth(f)));
          x = cx + Math.cos(a) * rr;
          y = cy + Math.sin(a) * rr;
          ctx.lineTo(x, y);
        }
        lastPt = [x, y, yi, m, v1];
      }
      ctx.stroke();
    }
    if (lastPt) {
      ctx.fillStyle = `rgba(255,236,190,${fade})`;
      ctx.beginPath();
      ctx.arc(lastPt[0], lastPt[1], 3, 0, Math.PI * 2);
      ctx.fill();
      const yr = Y0 + lastPt[2];
      ctx.font = `500 ${Math.max(16, s.Rm * 0.16)}px ${MONO}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = `rgba(245,245,240,${0.95 * fade})`;
      ctx.fillText(String(yr), cx, cy - 4);
      const v = s.annual[lastPt[2]];
      label(ctx, `${v >= 0 ? "+" : ""}${v.toFixed(2)}°C`, cx, cy + s.Rm * 0.1, { size: ls + 1, alpha: 0.75 * fade, align: "center", color: v > 1 ? "245,120,80" : "245,245,240" });
    }

    // warming stripes, revealed with the spiral
    const st = s.stripes;
    const sw = st.w / nYears;
    const upto = Math.floor(shown / 12);
    for (let yi = 0; yi < nYears; yi++) {
      const c = cmap("rdbu", clamp((s.annual[yi] + 0.5) / 2.1));
      ctx.fillStyle = rgba(c, yi <= upto ? fade : 0.06);
      ctx.fillRect(st.x + yi * sw, st.y, sw + 0.6, st.h);
    }
    label(ctx, String(Y0), st.x, st.y + st.h + 6, { size: ls, alpha: 0.45 });
    label(ctx, String(Y1), st.x + st.w, st.y + st.h + 6, { size: ls, alpha: 0.45, align: "right" });
    const mo = env.mouse;
    if (mo.on > 0.5 && mo.y > st.y - 6 && mo.y < st.y + st.h + 6) {
      const yi = clamp(Math.floor((mo.x - st.x) / sw), 0, nYears - 1);
      ctx.fillStyle = "rgba(245,245,240,0.9)";
      ctx.fillRect(st.x + yi * sw, st.y - 4, Math.max(1, sw), st.h + 8);
      label(ctx, `${Y0 + yi} · ${s.annual[yi] >= 0 ? "+" : ""}${s.annual[yi].toFixed(2)}°C`, clamp(st.x + yi * sw, 70, w - 70), st.y - 18, { size: ls + 0.5, alpha: 0.95, align: "center" });
    }
    chrome(ctx, w, h, "FIG.C3 — 175 YEARS, ONE SPIRAL", w > 420 ? "ANOMALY vs 1850–1900" : "");
  },
};

/* C04 — Watershed: a river basin as a graph -------------------------------------- */
const LAND = [
  ["FARMLAND", [247, 165, 70]],
  ["FOREST", [72, 190, 120]],
  ["URBAN", [170, 170, 185]],
];
export const watershed = {
  bg: "#06080a",
  noLens: true,
  resize(s, w, h) {
    const r = rng(9);
    const nodes = [];
    const add = (x, y, parent) => {
      const n = { x, y, parent, kids: [], id: nodes.length };
      nodes.push(n);
      if (parent) parent.kids.push(n);
      return n;
    };
    const outlet = add(w * 0.5, h * 0.9, null);
    const grow = (node, ang, len, depth) => {
      if (depth > 6 || len < 10) return;
      const pts = [];
      let x = node.x;
      let y = node.y;
      let a = ang;
      let cur = node;
      for (let k = 0; k < 3; k++) {
        a += (r() - 0.5) * 0.5;
        const nx = x + Math.cos(a) * (len / 3);
        const ny = y + Math.sin(a) * (len / 3);
        if (nx < 22 || nx > w - 22 || ny < h * 0.14 || ny > h - 22) return; // stop at the basin edge
        x = nx;
        y = ny;
        cur = add(x, y, cur);
        pts.push(cur);
      }
      const branches = depth < 2 ? 2 : r() < 0.2 ? 3 : r() < 0.88 ? 2 : 1;
      for (let b = 0; b < branches; b++) {
        const spread = branches === 1 ? 0 : lerp(-0.62, 0.62, b / (branches - 1)) + (r() - 0.5) * 0.3;
        grow(cur, a + spread, len * (0.7 + r() * 0.16), depth + 1);
      }
    };
    grow(outlet, -Math.PI / 2, h * 0.2, 0);
    // flow = number of upstream sources; distance to the outlet along the channel
    const leaves = nodes.filter((n) => !n.kids.length);
    leaves.forEach((l, i) => {
      l.leaf = i;
      l.land = l.x < w * 0.38 ? 0 : l.x > w * 0.66 ? (r() < 0.6 ? 2 : 0) : r() < 0.7 ? 1 : 0;
      l.phase = r() * 6;
    });
    const dist = (n) => (n.parent ? Math.hypot(n.x - n.parent.x, n.y - n.parent.y) : 0);
    for (const n of nodes) n.down = n.parent ? n.parent.down + dist(n) : 0;
    for (const n of [...nodes].reverse()) {
      n.src = n.kids.length ? n.kids.flatMap((k) => k.src) : [n];
      n.flow = n.src.length;
    }
    for (const n of nodes) n.lags = n.src.map((l) => (l.down - n.down) * 0.0045);
    s.nodes = nodes;
    s.leaves = leaves;
    s.outlet = outlet;
    s.hist = [];
    s.histAcc = 0;
    s.pulses = [];
    s.r = r;
    s.bins = Array.from({ length: 10 }, (_, i) => cmapCss("turbo", 0.22 + (i / 9) * 0.72));

    // topographic contours (marching squares over a smooth elevation field)
    const q = 2;
    s.topo = document.createElement("canvas");
    s.topo.width = Math.round(w * q);
    s.topo.height = Math.round(h * q);
    const c = s.topo.getContext("2d");
    c.scale(q, q);
    c.strokeStyle = "rgba(245,245,240,0.07)";
    c.lineWidth = 1;
    const GX = 64;
    const GY = Math.round((64 * h) / w);
    const elev = (x, y) =>
      (1 - y / h) * 1.1 + 0.18 * Math.sin(x * 0.011 + 1) * Math.cos(y * 0.009) + 0.12 * Math.sin((x + y) * 0.017) - 0.25 * g1(x, w * 0.5, w * 0.22) * (y / h);
    const E = [];
    for (let j = 0; j <= GY; j++) for (let i = 0; i <= GX; i++) E.push(elev((i / GX) * w, (j / GY) * h));
    for (let lvl = 0.05; lvl < 1.3; lvl += 0.075) {
      c.beginPath();
      for (let j = 0; j < GY; j++) {
        for (let i = 0; i < GX; i++) {
          const v = [E[j * (GX + 1) + i], E[j * (GX + 1) + i + 1], E[(j + 1) * (GX + 1) + i + 1], E[(j + 1) * (GX + 1) + i]];
          const X = [(i / GX) * w, ((i + 1) / GX) * w];
          const Yy = [(j / GY) * h, ((j + 1) / GY) * h];
          const corners = [[X[0], Yy[0]], [X[1], Yy[0]], [X[1], Yy[1]], [X[0], Yy[1]]];
          const cross = [];
          for (let e = 0; e < 4; e++) {
            const a = v[e];
            const b = v[(e + 1) % 4];
            if ((a < lvl) !== (b < lvl)) {
              const f = (lvl - a) / (b - a);
              const p0 = corners[e];
              const p1 = corners[(e + 1) % 4];
              cross.push([lerp(p0[0], p1[0], f), lerp(p0[1], p1[1], f)]);
            }
          }
          if (cross.length >= 2) {
            c.moveTo(cross[0][0], cross[0][1]);
            c.lineTo(cross[1][0], cross[1][1]);
          }
        }
      }
      c.stroke();
    }
  },
  source(l, t) {
    const storm = Math.pow(Math.max(0, Math.sin(t * 0.33 + l.phase * 0.35)), 8);
    const base = [2.4, 0.35, 1.2][l.land];
    const amp = [2.6, 0.3, 1.1][l.land];
    return base + amp * storm + 0.15 * Math.sin(t * 1.3 + l.phase);
  },
  value(n, t) {
    let v = 0;
    for (let k = 0; k < n.src.length; k++) v += this.source(n.src[k], t - n.lags[k]);
    return v / n.flow;
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(s.topo, 0, 0, w, h);
    const ls = Math.max(7, Math.min(9, w / 60));
    const mo = env.mouse;
    let hover = null;
    if (mo.on > 0.5) {
      let best = 26;
      for (const n of s.nodes) {
        const d = Math.hypot(n.x - mo.x, n.y - mo.y);
        if (d < best) {
          best = d;
          hover = n;
        }
      }
    }
    const inCatch = hover ? new Set() : null;
    if (hover) {
      const stack = [hover];
      while (stack.length) {
        const n = stack.pop();
        inCatch.add(n);
        stack.push(...n.kids);
      }
    }
    // channels, width by flow, colour by modelled nitrate
    ctx.lineCap = "round";
    for (const n of s.nodes) {
      if (!n.parent) continue;
      const v = this.value(n, t);
      n.v = v;
      const bi = Math.min(9, Math.max(0, Math.floor((v / 4.6) * 10)));
      ctx.strokeStyle = inCatch && !inCatch.has(n) ? "rgba(245,245,240,0.12)" : s.bins[bi];
      ctx.lineWidth = 0.7 + 0.55 * Math.sqrt(n.flow);
      ctx.beginPath();
      ctx.moveTo(n.parent.x, n.parent.y);
      ctx.lineTo(n.x, n.y);
      ctx.stroke();
    }
    // tracer pulses travelling downstream
    if (s.pulses.length < 120 && s.r() < 0.5) {
      const l = s.leaves[Math.floor(s.r() * s.leaves.length)];
      s.pulses.push({ n: l, f: 0 });
    }
    s.pulses = s.pulses.filter((p) => {
      p.f += 0.08;
      while (p.f >= 1 && p.n.parent) {
        p.f -= 1;
        p.n = p.n.parent;
      }
      if (!p.n.parent) return false;
      const x = lerp(p.n.x, p.n.parent.x, p.f);
      const y = lerp(p.n.y, p.n.parent.y, p.f);
      ctx.fillStyle = "rgba(255,250,235,0.85)";
      ctx.fillRect(x - 1, y - 1, 2, 2);
      return true;
    });
    // sources coloured by land use
    for (const l of s.leaves) {
      ctx.fillStyle = rgba(LAND[l.land][1], 0.9);
      ctx.fillRect(l.x - 2.5, l.y - 2.5, 5, 5);
    }
    // gauge at the outlet with a sparkline + forecast
    const o = s.outlet;
    const kid = o.kids[0];
    const vOut = kid ? this.value(kid, t) : 0;
    s.histAcc += 1;
    if (s.histAcc % 3 === 0) {
      s.hist.push(vOut);
      if (s.hist.length > 90) s.hist.shift();
    }
    ctx.strokeStyle = "rgba(245,245,240,0.9)";
    ctx.beginPath();
    ctx.arc(o.x, o.y, 6, 0, Math.PI * 2);
    ctx.stroke();
    const pw = Math.min(190, w * 0.36);
    const px = w - 14 - pw;
    const py = h - 70;
    label(ctx, `GAUGE 01 · NO₃ ${vOut.toFixed(2)} mg/L`, px, py - 16, { size: ls + 0.5, alpha: 0.9 });
    ctx.strokeStyle = "rgba(245,245,240,0.15)";
    ctx.strokeRect(px + 0.5, py + 0.5, pw, 44);
    const H = s.hist;
    if (H.length > 2) {
      const sx = (pw * 0.72) / 90;
      const yv = (v) => py + 40 - clamp(v / 5) * 36;
      ctx.strokeStyle = "rgba(245,245,240,0.85)";
      ctx.beginPath();
      H.forEach((v, i) => (i ? ctx.lineTo(px + i * sx, yv(v)) : ctx.moveTo(px, yv(v))));
      ctx.stroke();
      const x0 = px + (H.length - 1) * sx;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "rgba(247,165,70,0.9)";
      ctx.beginPath();
      ctx.moveTo(x0, yv(H[H.length - 1]));
      const lead = kid ? kid : o;
      for (let k = 1; k <= 12; k++) ctx.lineTo(x0 + k * ((pw * 0.26) / 12), yv(this.value(lead, t + k * 0.35)));
      ctx.stroke();
      ctx.setLineDash([]);
      label(ctx, "+48 h", px + pw - 4, py + 4, { size: ls - 1, alpha: 0.6, align: "right", color: "247,165,70" });
    }
    // legend
    LAND.forEach(([name, col], i) => {
      ctx.fillStyle = rgba(col, 0.9);
      ctx.fillRect(14, 36 + i * 14, 6, 6);
      label(ctx, name, 26, 34 + i * 14, { size: ls, alpha: 0.6 });
    });
    if (hover) {
      label(ctx, `CATCHMENT · ${hover.flow} SOURCES · NO₃ ${(hover.v ?? this.value(hover, t)).toFixed(2)} mg/L`, 14, h - 24, { size: ls + 0.5, alpha: 0.95 });
    } else {
      label(ctx, "MESSAGE PASSING · 1 HOP = 15 MIN", 14, h - 24, { size: ls, alpha: 0.5 });
    }
    chrome(ctx, w, h, "FIG.C4 — WATERSHED AS A GRAPH", w > 420 ? "GNN · NITRATE FORECAST" : "");
  },
};
