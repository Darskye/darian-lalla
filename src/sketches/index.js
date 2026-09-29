// Generative plates, one per project. Each draws in CSS pixels onto its own
// dark "paper"; the Plate renderer turns them into text/pixels on demand.

import { cmap, cmapCss } from "../lib/colormaps.js";
import { MONO, SANS } from "../lib/glyphs.js";
import { chrome, gauss, label } from "./draw.js";
import { clamp, easeInOut, hash2, lerp, rng, smooth } from "../lib/math.js";

/* D001 — records flowing into a unit chart ------------------------------------------ */
const HAZ = ["FLAM", "PRES", "EXPL", "ACUT", "CARC", "CORR"];
export const recordsToReport = {
  bg: "#0b0c0e",
  resize(s, w, h) {
    const r = rng(11);
    const u = Math.max(3, Math.round(Math.min(w, h) / 95));
    const step = u + Math.max(1, Math.round(u * 0.4));
    const barCols = 4;
    const barW = barCols * step;
    const left = w * 0.47;
    const right = w * 0.93;
    const base = h * 0.84;
    const gapX = (right - left - barW * HAZ.length) / (HAZ.length - 1);
    const maxRows = Math.floor((base - h * 0.2) / step);
    const fr = [0.95, 0.55, 0.3, 0.78, 0.46, 0.64];
    const p = [];
    const cx = w * 0.22;
    const cy = h * 0.5;
    const R = Math.min(w * 0.18, h * 0.3);
    HAZ.forEach((_, c) => {
      const n = Math.round(fr[c] * maxRows) * barCols;
      for (let k = 0; k < n; k++) {
        const a = r() * Math.PI * 2;
        const rad = Math.abs(gauss(r)) * R * 0.55;
        p.push({
          c,
          a,
          rad,
          spin: 0.4 + r() * 0.8,
          tx: left + c * (barW + gapX) + (k % barCols) * step,
          ty: base - (Math.floor(k / barCols) + 1) * step,
          delay: r() * 0.55 + (k / n) * 0.3,
        });
      }
    });
    Object.assign(s, { p, u, step, left, right, base, barW, gapX, cx, cy, R });
    s.cols = HAZ.map((_, c) => cmapCss("viridis", 0.18 + (c / (HAZ.length - 1)) * 0.8));
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    const period = 12;
    const lt = t % period;
    const flow = easeInOut(clamp((lt - 1.2) / 7));
    const fade = lt > period - 1.2 ? 1 - (lt - (period - 1.2)) / 1.2 : Math.min(1, lt / 0.6);

    ctx.strokeStyle = "rgba(245,245,240,0.08)";
    ctx.lineWidth = 1;
    for (let y = s.base; y > h * 0.18; y -= s.step * 5) {
      ctx.beginPath();
      ctx.moveTo(s.left - 10, Math.round(y) + 0.5);
      ctx.lineTo(s.right + 6, Math.round(y) + 0.5);
      ctx.stroke();
    }
    const m = env.mouse;
    for (const q of s.p) {
      const k = smooth(clamp((flow - q.delay * 0.55) / 0.45));
      const ang = q.a + t * 0.25 * q.spin;
      let x0 = s.cx + Math.cos(ang) * q.rad;
      let y0 = s.cy + Math.sin(ang) * q.rad * 0.85;
      if (m.on > 0) {
        const dx = x0 - m.x;
        const dy = y0 - m.y;
        const d = Math.hypot(dx, dy) + 1;
        const push = (m.on * 900) / (d * d + 400);
        x0 += dx * push;
        y0 += dy * push;
      }
      const mx = lerp(x0, q.tx, 0.5);
      const my = Math.min(y0, q.ty) - h * 0.18;
      const x = (1 - k) * (1 - k) * x0 + 2 * (1 - k) * k * mx + k * k * q.tx;
      const y = (1 - k) * (1 - k) * y0 + 2 * (1 - k) * k * my + k * k * q.ty;
      const sz = lerp(s.u * 0.75, s.u, k);
      ctx.globalAlpha = fade * (0.55 + 0.45 * k);
      ctx.fillStyle = s.cols[q.c];
      ctx.fillRect(x, y, sz, sz);
    }
    ctx.globalAlpha = 1;
    const ls = Math.max(7, Math.min(9, w / 60));
    HAZ.forEach((hz, c) => label(ctx, hz, s.left + c * (s.barW + s.gapX), s.base + 8, { size: ls, alpha: 0.5 }));
    label(ctx, "RECORDS", s.cx, s.base + 8, { size: ls, alpha: 0.5, align: "center" });
    chrome(ctx, w, h, "FIG.01 — RECORDS → REPORT", "Σ BY HAZARD CLASS");
  },
};

/* D002 — unstructured document → structured table ---------------------------------- */
const FIELDS = ["CAS", "NAME", "GHS", "PPE", "LIMIT"];
export const docToSchema = {
  bg: "#0c0b0e",
  resize(s, w, h) {
    const r = rng(7);
    const px = w * 0.07;
    const py = h * 0.13;
    const pw = w * 0.38;
    const ph = h * 0.74;
    const lh = Math.max(8, ph / 30);
    const words = [];
    for (let y = py + lh; y < py + ph - lh; y += lh) {
      const head = r() < 0.12;
      let x = px + 10;
      const end = px + pw - 10 - (head ? pw * 0.4 : r() * pw * 0.15);
      while (x < end) {
        const ww = Math.min(end - x, pw * (0.04 + r() * (head ? 0.18 : 0.1)));
        if (ww > 3) words.push({ x, y, w: ww, h: head ? lh * 0.55 : lh * 0.38, head });
        x += ww + Math.max(3, lh * 0.35);
      }
    }
    const body = words.filter((q) => !q.head);
    const rows = 7;
    const picks = [];
    const used = new Set();
    for (let i = 0; i < rows * FIELDS.length; i++) {
      let j;
      do j = Math.floor(r() * body.length);
      while (used.has(j) && used.size < body.length);
      used.add(j);
      picks.push(body[j]);
    }
    picks.sort((a, b) => a.y - b.y || a.x - b.x);
    const tx = w * 0.53;
    const ty = h * 0.24;
    const tw = w * 0.41;
    const cwid = tw / FIELDS.length;
    const chgt = Math.min(h * 0.075, (h * 0.62) / rows);
    const ents = picks.map((q, i) => ({
      q,
      col: i % FIELDS.length,
      row: Math.floor(i / FIELDS.length),
    }));
    Object.assign(s, { px, py, pw, ph, words, ents, tx, ty, tw, cwid, chgt, rows });
    s.cols = FIELDS.map((_, i) => cmap("turbo", 0.12 + i * 0.19));
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    const period = 11;
    const lt = t % period;
    const scan = s.py + s.ph * easeInOut(clamp((lt - 0.6) / 7.5));
    const fade = lt > period - 1 ? 1 - (lt - (period - 1)) : 1;

    ctx.fillStyle = "rgba(245,245,240,0.035)";
    ctx.fillRect(s.px, s.py, s.pw, s.ph);
    ctx.strokeStyle = "rgba(245,245,240,0.12)";
    ctx.strokeRect(s.px + 0.5, s.py + 0.5, s.pw, s.ph);
    for (const q of s.words) {
      ctx.fillStyle = q.head ? "rgba(245,245,240,0.32)" : "rgba(245,245,240,0.14)";
      ctx.fillRect(q.x, q.y, q.w, q.h);
    }
    const g = ctx.createLinearGradient(0, scan - 40, 0, scan);
    g.addColorStop(0, "rgba(27,207,212,0)");
    g.addColorStop(1, "rgba(27,207,212,0.22)");
    ctx.fillStyle = g;
    ctx.fillRect(s.px, scan - 40, s.pw, 40);
    ctx.fillStyle = "rgba(120,255,240,0.9)";
    ctx.fillRect(s.px - 6, scan, s.pw + 12, 1.5);

    ctx.strokeStyle = "rgba(245,245,240,0.1)";
    for (let i = 0; i <= s.rows; i++) {
      const y = Math.round(s.ty + i * s.chgt) + 0.5;
      ctx.beginPath();
      ctx.moveTo(s.tx, y);
      ctx.lineTo(s.tx + s.tw, y);
      ctx.stroke();
    }
    for (let i = 0; i <= FIELDS.length; i++) {
      const x = Math.round(s.tx + i * s.cwid) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, s.ty);
      ctx.lineTo(x, s.ty + s.rows * s.chgt);
      ctx.stroke();
    }
    const ls = Math.max(7, Math.min(9, w / 60));
    FIELDS.forEach((f, i) => label(ctx, f, s.tx + i * s.cwid + 4, s.ty - ls - 8, { size: ls, alpha: 0.6 }));

    for (const e of s.ents) {
      const [R, G, B] = s.cols[e.col];
      const p = easeInOut(clamp((scan - e.q.y) / (s.ph * 0.14)));
      const cx = s.tx + e.col * s.cwid + 4;
      const cy = s.ty + e.row * s.chgt + s.chgt * 0.3;
      const cwid = s.cwid - 8;
      const chh = s.chgt * 0.4;
      if (p <= 0) {
        ctx.fillStyle = `rgba(${R},${G},${B},0.35)`;
        ctx.fillRect(e.q.x, e.q.y, e.q.w, e.q.h);
        continue;
      }
      ctx.strokeStyle = `rgba(${R},${G},${B},0.5)`;
      ctx.strokeRect(e.q.x + 0.5, e.q.y + 0.5, e.q.w, e.q.h);
      const arc = Math.sin(p * Math.PI) * -h * 0.06;
      const x = lerp(e.q.x, cx, p);
      const y = lerp(e.q.y, cy, p) + arc;
      ctx.globalAlpha = fade;
      ctx.fillStyle = `rgb(${R},${G},${B})`;
      ctx.fillRect(x, y, lerp(e.q.w, cwid * (0.45 + 0.5 * hash2(e.row, e.col)), p), lerp(e.q.h, chh, p));
      ctx.globalAlpha = 1;
    }
    chrome(ctx, w, h, "FIG.02 — DOCUMENT → SCHEMA", "SDS · 16 SECTIONS");
  },
};

/* D003 — causal self-attention heatmap -------------------------------------------- */
const TOKENS = ["which", "sites", "store", "chlorine", "above", "the", "TPQ", "?", "draft", "a", "tier", "ii", "summary", "and", "cite", "the", "sds", "section", "."];
const LINKS = [
  [
    [6, 3], [4, 3], [10, 8], [11, 10], [12, 8], [16, 3], [17, 16], [14, 12], [2, 1],
  ],
  [
    [3, 1], [6, 4], [12, 11], [16, 14], [17, 14], [8, 0], [13, 8], [18, 12],
  ],
  [
    [7, 0], [18, 8], [9, 8], [15, 5], [5, 1], [16, 6], [11, 6], [3, 2],
  ],
];
export const attention = {
  bg: "#09080b",
  resize(s, w, h) {
    const N = TOKENS.length;
    const ls = Math.max(7, Math.min(9.5, w / 58));
    const left = Math.max(44, ls * 7.2);
    const top = h * 0.12;
    const bottom = ls * 6.5 + 12;
    const size = Math.min(w - left - 16, h - top - bottom);
    Object.assign(s, { N, ls, left, top, size, cell: size / N, m: new Float32Array(N * N) });
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    const { N, cell, left, top, m } = s;
    const head = Math.floor(t / 4.5) % LINKS.length;
    const blend = smooth(clamp(((t % 4.5) - 3.7) / 0.8));
    const links = [LINKS[head], LINKS[(head + 1) % LINKS.length]];
    for (let i = 0; i < N; i++) {
      let mx = 0;
      for (let j = 0; j <= i; j++) {
        let sc = 1.4 * Math.exp(-((i - j) ** 2) / 5) + 0.25 * Math.sin(t * 0.7 + i * 0.9) * Math.cos(t * 0.5 + j * 0.7);
        for (let k = 0; k < 2; k++) {
          const wgt = k ? blend : 1 - blend;
          for (const [a, b] of links[k]) if (a === i && b === j) sc += 2.4 * wgt;
        }
        const v = Math.exp(sc);
        m[i * N + j] = v;
        if (v > mx) mx = v;
      }
      for (let j = 0; j <= i; j++) m[i * N + j] /= mx;
    }
    const mo = env.mouse;
    const hi = mo.on > 0.5 ? Math.floor((mo.y - top) / cell) : -1;
    const hj = mo.on > 0.5 ? Math.floor((mo.x - left) / cell) : -1;
    const gap = cell > 10 ? 1 : 0.5;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const x = left + j * cell;
        const y = top + i * cell;
        if (j > i) {
          ctx.fillStyle = "#121116";
        } else {
          ctx.fillStyle = cmapCss("magma", 0.06 + 0.94 * Math.pow(m[i * N + j], 0.8));
        }
        ctx.fillRect(x, y, cell - gap, cell - gap);
      }
    }
    if (hi >= 0 && hi < N && hj >= 0 && hj < N) {
      ctx.strokeStyle = "rgba(245,245,240,0.7)";
      ctx.strokeRect(left + 0.5, top + hi * cell + 0.5, s.size - 1, cell - 1);
      ctx.strokeRect(left + hj * cell + 0.5, top + 0.5, cell - 1, s.size - 1);
      const v = hj <= hi ? m[hi * N + hj] : 0;
      label(ctx, `q=${TOKENS[hi]}  k=${TOKENS[hj]}  a=${v.toFixed(2)}`, left, top + s.size + s.ls * 6 + 4, { size: s.ls, alpha: 0.9 });
    }
    TOKENS.forEach((tk, i) => {
      label(ctx, tk, left - 6, top + i * cell + cell / 2 - s.ls / 2, { size: s.ls, alpha: i === hi ? 1 : 0.5, align: "right" });
      ctx.save();
      ctx.translate(left + i * cell + cell / 2 - s.ls / 2, top + s.size + 6);
      ctx.rotate(Math.PI / 2);
      label(ctx, tk, 0, 0, { size: s.ls, alpha: i === hj ? 1 : 0.5 });
      ctx.restore();
    });
    chrome(ctx, w, h, "FIG.03 — SELF-ATTENTION", `LAYER 06 · HEAD 0${head + 1}`);
  },
};

/* D005 — Keplerian orbits --------------------------------------------------------- */
const PLANETS = [
  ["MERCURY", 0.39, 0.2056, 0.2, 1.6],
  ["VENUS", 0.72, 0.0068, 1.1, 2.4],
  ["EARTH", 1.0, 0.0167, 2.3, 2.5],
  ["MARS", 1.52, 0.0934, 4.0, 2],
  ["JUPITER", 5.2, 0.0489, 0.7, 5],
  ["SATURN", 9.54, 0.0565, 5.1, 4.2],
  ["URANUS", 19.2, 0.046, 3.3, 3.2],
  ["NEPTUNE", 30.1, 0.009, 1.9, 3.1],
];
const kepler = (M, e) => {
  let E = M;
  for (let i = 0; i < 5; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  return E;
};
export const orbits = {
  bg: "#07070a",
  resize(s, w, h) {
    const r = rng(5);
    s.stars = Array.from({ length: Math.round((w * h) / 2600) }, () => [r() * w, r() * h, r()]);
    s.belt = Array.from({ length: 420 }, () => [2.2 + r() * 1.1, r() * Math.PI * 2, r() * 0.08]);
    s.scale = Math.min(w * 0.46, h * 0.95) / Math.pow(31, 0.52);
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    for (const [x, y, b] of s.stars) {
      ctx.fillStyle = `rgba(245,245,240,${0.1 + b * 0.35 * (0.6 + 0.4 * Math.sin(t * 2 + b * 30))})`;
      ctx.fillRect(x, y, 1, 1);
    }
    const mo = env.mouse;
    const inc = clamp(0.38 + (mo.on ? (mo.y / h - 0.5) * 0.4 : 0), 0.15, 0.75);
    const spin = t * 0.03 + (mo.on ? (mo.x / w - 0.5) * 0.6 : 0);
    const cx = w * 0.5;
    const cy = h * 0.54;
    const rs = (au) => s.scale * Math.pow(au, 0.52);
    const proj = (au, ang) => {
      const rr = rs(au);
      const a = ang + spin;
      return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * inc];
    };
    const pos = (a, e, M) => {
      const E = kepler(M, e);
      const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
      return [a * (1 - e * Math.cos(E)), nu];
    };

    ctx.lineWidth = 1;
    for (const [, a, e] of PLANETS) {
      ctx.strokeStyle = "rgba(245,245,240,0.11)";
      ctx.beginPath();
      for (let k = 0; k <= 96; k++) {
        const [rr, nu] = pos(a, e, (k / 96) * Math.PI * 2);
        const [x, y] = proj(rr, nu);
        k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    }
    for (const [a, ph, d] of s.belt) {
      const M = ph + (t * 1.1) / Math.pow(a, 1.5);
      const [x, y] = proj(a + d, M);
      ctx.fillStyle = "rgba(210,190,160,0.35)";
      ctx.fillRect(x, y, 1, 1);
    }
    const sun = ctx.createRadialGradient(cx, cy, 0, cx, cy, s.scale * 0.5);
    sun.addColorStop(0, "rgba(252,255,164,1)");
    sun.addColorStop(0.12, "rgba(249,140,10,0.9)");
    sun.addColorStop(0.4, "rgba(186,54,85,0.25)");
    sun.addColorStop(1, "rgba(0,0,4,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(cx - s.scale * 0.5, cy - s.scale * 0.5, s.scale, s.scale);

    const ls = Math.max(7, Math.min(8.5, w / 70));
    PLANETS.forEach(([name, a, e, M0, size], i) => {
      const n = (t * 1.1) / Math.pow(a, 1.5);
      const col = cmap("inferno", 0.35 + (i / PLANETS.length) * 0.6);
      for (let k = 0; k < 14; k++) {
        const [rr, nu] = pos(a, e, M0 + n - k * 0.035);
        const [x, y] = proj(rr, nu);
        ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.5 * (1 - k / 14)})`;
        ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
      const [rr, nu] = pos(a, e, M0 + n);
      const [x, y] = proj(rr, nu);
      ctx.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
      ctx.beginPath();
      ctx.arc(x, y, size * Math.max(0.7, w / 900), 0, Math.PI * 2);
      ctx.fill();
      if (w > 420) label(ctx, name, x + 7, y - 4, { size: ls, alpha: 0.45 });
    });
    chrome(ctx, w, h, "FIG.05 — KEPLER, SOLVED LIVE", "a^0.52 RADIAL SCALE");
  },
};

/* D006 — artificial life in genome space ----------------------------------------- */
// Organisms carry a 7-gene genome. A fixed random projection (our stand-in for PCA)
// places each genome in 2D. Energy comes from a drifting resource hotspot minus local
// crowding; reproduction mutates the genome, so lineages visibly drift, split and die.
const GENES = 7;
const LINEAGES = 6;
const LIN_NAMES = "ABCDEF";
const CAP = 460;

function project(s, g) {
  let x = 0;
  let y = 0;
  for (let i = 0; i < GENES; i++) {
    x += s.P[0][i] * (g[i] - 0.5);
    y += s.P[1][i] * (g[i] - 0.5);
  }
  return [clamp(0.5 + x * s.norm[0], 0.02, 0.98), clamp(0.5 + y * s.norm[1], 0.02, 0.98)];
}

function spawn(s, g, lin, e, parent) {
  const [ex, ey] = project(s, g);
  const o = { id: s.id++, g, lin, e, age: 0, ex, ey, dx: parent ? parent.dx : ex, dy: parent ? parent.dy : ey, born: s.simT, dead: -1 };
  s.orgs.push(o);
  return o;
}

// three resource niches, each slowly orbiting its own centre
const NICHES = [
  [0.27, 0.66, 0.0],
  [0.72, 0.7, 2.1],
  [0.52, 0.27, 4.2],
];
function hotspots(s) {
  const t = s.simT;
  return NICHES.map(([x, y, ph], i) => [
    x + 0.1 * Math.sin(t * (0.09 + i * 0.02) + ph),
    y + 0.08 * Math.cos(t * (0.07 + i * 0.015) + ph),
    0.12,
  ]);
}

export function stepLife(s, dt) {
  const r = s.r;
  s.simT += dt;
  const G = 18;
  const cell = (o) => Math.min(G - 1, (o.ex * G) | 0) + Math.min(G - 1, (o.ey * G) | 0) * G;
  const grid = new Uint16Array(G * G);
  const kin = new Uint16Array(G * G * LINEAGES); // kin compete harder than strangers, so lineages coexist
  const alive = s.orgs.filter((o) => o.dead < 0);
  for (const o of alive) {
    const c = cell(o);
    grid[c]++;
    kin[c * LINEAGES + o.lin]++;
  }
  const hs = hotspots(s);
  const counts = new Array(LINEAGES).fill(0);
  for (const o of alive) counts[o.lin]++;
  let pop = alive.length;
  for (const o of alive) {
    let food = 0;
    for (const [hx, hy, hr] of hs) food += Math.exp(-((o.ex - hx) ** 2 + (o.ey - hy) ** 2) / (2 * hr * hr));
    const c = cell(o);
    // food is shared with neighbours (kin weigh more), which gives a self-regulating carrying capacity
    o.e += dt * ((0.5 * food) / (1 + 0.14 * grid[c] + 0.3 * kin[c * LINEAGES + o.lin]) - 0.06);
    o.age += dt;
    if (o.e <= 0 || o.age > 11 + 7 * o.g[0]) {
      o.dead = s.simT;
      counts[o.lin]--;
      pop--;
      continue;
    }
    if (o.e > 1 && pop < CAP) {
      o.e -= 0.55;
      let lin = o.lin;
      let rate = 0.035;
      const empty = counts.findIndex((c) => c <= 0);
      if (empty >= 0 && r() < 0.02) {
        lin = empty; // a big mutation founds a new lineage in an empty slot
        rate = 0.22;
      }
      const g = o.g.map((v) => clamp(v + gauss(r) * rate));
      const child = spawn(s, g, lin, 0.42, o);
      counts[lin]++;
      pop++;
      s.links.push({ a: o, b: child, t0: s.simT });
    }
  }
  s.orgs = s.orgs.filter((o) => o.dead < 0 || s.simT - o.dead < 0.7);
  s.links = s.links.filter((l) => s.simT - l.t0 < 1.4);
  if (pop < 25) seedLife(s);
  s.histAcc += dt;
  if (s.histAcc >= 0.5) {
    s.histAcc = 0;
    s.hist.push(counts.map((c) => Math.max(0, c)));
    if (s.hist.length > 130) s.hist.shift();
  }
}

function seedLife(s) {
  const r = s.r;
  const hs = hotspots(s);
  for (let l = 0; l < LINEAGES; l++) {
    const [hx, hy] = hs[l % hs.length];
    let g0 = null;
    for (let tries = 0; tries < 600; tries++) {
      const g = Array.from({ length: GENES }, () => 0.1 + r() * 0.8);
      const [x, y] = project(s, g);
      if (!g0 || Math.hypot(x - hx, y - hy) < Math.hypot(project(s, g0)[0] - hx, project(s, g0)[1] - hy)) g0 = g;
      if (Math.hypot(x - hx, y - hy) < 0.06) break;
    }
    for (let k = 0; k < 16; k++) spawn(s, g0.map((v) => clamp(v + gauss(r) * 0.03)), l, 0.3 + r() * 0.5);
  }
}

export const genomeSpace = {
  bg: "#08080b",
  noLens: true,
  init() {
    const r = rng(77);
    const P = [0, 1].map(() => Array.from({ length: GENES }, () => r() * 2 - 1));
    const norm = P.map((row) => 1 / (3.2 * Math.sqrt(row.reduce((a, v) => a + v * v, 0) / 12)));
    const s = { r, P, norm, orgs: [], links: [], hist: [], histAcc: 0, simT: 0, acc: 0, id: 0, last: 0 };
    s.cols = Array.from({ length: LINEAGES }, (_, i) => cmap("turbo", 0.1 + i * 0.165));
    seedLife(s);
    for (let i = 0; i < 700; i++) stepLife(s, 0.05);
    return s;
  },
  resize(s, w, h) {
    s.box = { x: 14, y: 40, w: w - 28, h: h * 0.62 };
    s.gw = 72;
    s.gh = Math.max(24, Math.round((72 * s.box.h) / s.box.w));
    s.glow = document.createElement("canvas");
    s.glow.width = s.gw;
    s.glow.height = s.gh;
    s.gctx = s.glow.getContext("2d");
    s.gimg = s.gctx.createImageData(s.gw, s.gh);
    s.stream = { x: 14, y: h * 0.74, w: w - 28, h: h * 0.17 };
  },
  draw(ctx, w, h, t, env, s) {
    ctx.fillStyle = this.bg;
    ctx.fillRect(0, 0, w, h);
    const dt = clamp(t - s.last, 0, 0.1);
    s.last = t;
    s.acc += dt;
    while (s.acc >= 0.05) {
      s.acc -= 0.05;
      stepLife(s, 0.05);
    }
    const { box, stream } = s;
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    const X = (u) => box.x + u * box.w;
    const Y = (v) => box.y + (1 - v) * box.h;
    const ls = Math.max(7, Math.min(9, w / 55));

    // grid + fitness-landscape contours around the resource hotspots
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(245,245,240,0.06)";
    for (let i = 0; i <= 8; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.round(X(i / 8)) + 0.5, box.y);
      ctx.lineTo(Math.round(X(i / 8)) + 0.5, box.y + box.h);
      ctx.moveTo(box.x, Math.round(Y(i / 8)) + 0.5);
      ctx.lineTo(box.x + box.w, Math.round(Y(i / 8)) + 0.5);
      ctx.stroke();
    }
    for (const [hx, hy, hr] of hotspots(s)) {
      for (let k = 1; k <= 5; k++) {
        ctx.strokeStyle = `rgba(245,245,240,${0.03 + 0.035 * (6 - k)})`;
        ctx.beginPath();
        ctx.ellipse(X(hx), Y(hy), hr * k * 0.55 * box.w, hr * k * 0.55 * box.h, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // population density field, tinted by the locally dominant lineages
    const alive = s.orgs.filter((o) => o.dead < 0);
    const { gw, gh } = s;
    const acc = new Float32Array(gw * gh * 4);
    for (const o of alive) {
      const gx = o.dx * (gw - 1);
      const gy = (1 - o.dy) * (gh - 1);
      const c = s.cols[o.lin];
      for (let yy = Math.max(0, Math.floor(gy) - 3); yy <= Math.min(gh - 1, Math.ceil(gy) + 3); yy++) {
        for (let xx = Math.max(0, Math.floor(gx) - 3); xx <= Math.min(gw - 1, Math.ceil(gx) + 3); xx++) {
          const wgt = Math.exp(-((xx - gx) ** 2 + (yy - gy) ** 2) / 3.2);
          const k = (yy * gw + xx) * 4;
          acc[k] += c[0] * wgt;
          acc[k + 1] += c[1] * wgt;
          acc[k + 2] += c[2] * wgt;
          acc[k + 3] += wgt;
        }
      }
    }
    const px = s.gimg.data;
    for (let i = 0; i < gw * gh; i++) {
      const wsum = acc[i * 4 + 3];
      if (wsum < 1e-3) {
        px[i * 4 + 3] = 0;
        continue;
      }
      px[i * 4] = acc[i * 4] / wsum;
      px[i * 4 + 1] = acc[i * 4 + 1] / wsum;
      px[i * 4 + 2] = acc[i * 4 + 2] / wsum;
      px[i * 4 + 3] = Math.min(150, wsum * 26);
    }
    s.gctx.putImageData(s.gimg, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(s.glow, box.x, box.y, box.w, box.h);
    ctx.globalAlpha = 1;

    // convex hull + label per lineage (the clusters, drawn like a cluster analysis)
    for (let l = 0; l < LINEAGES; l++) {
      const pts = alive.filter((o) => o.lin === l).map((o) => [X(o.dx), Y(o.dy)]);
      if (pts.length < 6) continue;
      pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
      }
      const upper = [];
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
      }
      const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
      ctx.strokeStyle = rgba(s.cols[l], 0.55);
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      hull.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      const top = hull.reduce((a, p) => (p[1] < a[1] ? p : a), hull[0]);
      label(ctx, `${LIN_NAMES[l]} · ${pts.length}`, top[0], top[1] - 16, { size: ls, alpha: 0.85, align: "center", color: s.cols[l].join(",") });
    }

    // phylogeny links for recent births
    for (const l of s.links) {
      const a = 1 - (s.simT - l.t0) / 1.4;
      ctx.strokeStyle = rgba(s.cols[l.b.lin], 0.5 * a);
      ctx.beginPath();
      ctx.moveTo(X(l.a.dx), Y(l.a.dy));
      ctx.lineTo(X(l.b.dx), Y(l.b.dy));
      ctx.stroke();
    }

    // organisms
    const mo = env.mouse;
    let hover = null;
    let best = 44;
    for (const o of s.orgs) {
      o.dx += (o.ex - o.dx) * Math.min(1, dt * 3);
      o.dy += (o.ey - o.dy) * Math.min(1, dt * 3);
      const x = X(o.dx) + Math.sin(t * 1.3 + o.id) * 1.2;
      const y = Y(o.dy) + Math.cos(t * 1.1 + o.id * 1.7) * 1.2;
      const c = s.cols[o.lin];
      const fade = o.dead >= 0 ? 1 - (s.simT - o.dead) / 0.7 : 1;
      const young = s.simT - o.born;
      ctx.fillStyle = rgba(c, (0.45 + 0.55 * clamp(o.e)) * fade);
      ctx.fillRect(x - 2, y - 2, 4, 4);
      if (young < 0.6) {
        ctx.strokeStyle = rgba(c, 0.8 * (1 - young / 0.6));
        ctx.beginPath();
        ctx.arc(x, y, 2 + young * 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (mo.on > 0.5 && o.dead < 0) {
        const d = Math.hypot(x - mo.x, y - mo.y);
        if (d < best) {
          best = d;
          hover = { o, x, y };
        }
      }
    }
    label(ctx, "PC1 →", box.x + box.w - 4, box.y + box.h + 6, { size: ls, alpha: 0.4, align: "right" });
    label(ctx, "PC2 ↑", box.x + 4, box.y + 4, { size: ls, alpha: 0.4 });

    // genome inspector
    if (hover) {
      const { o, x, y } = hover;
      const c = s.cols[o.lin];
      ctx.strokeStyle = rgba(c, 1);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, Math.PI * 2);
      ctx.stroke();
      const bw = Math.min(150, w * 0.3);
      const px = x + 16 + bw > w - 14 ? x - 16 - bw : x + 16;
      const py = clamp(y - 30, box.y, box.y + box.h - 70);
      ctx.fillStyle = "rgba(8,8,11,0.88)";
      ctx.fillRect(px, py, bw, 70);
      ctx.strokeStyle = rgba(c, 0.6);
      ctx.strokeRect(px + 0.5, py + 0.5, bw, 70);
      label(ctx, `ORG #${o.id} · LINEAGE ${LIN_NAMES[o.lin]}`, px + 8, py + 7, { size: ls, alpha: 0.9 });
      const gw = (bw - 16) / GENES;
      o.g.forEach((v, i) => {
        ctx.fillStyle = rgba(c, 0.35 + 0.65 * v);
        const bh = 4 + v * 24;
        ctx.fillRect(px + 8 + i * gw, py + 48 - bh, gw - 2, bh);
      });
      label(ctx, `AGE ${o.age.toFixed(1)}s  E ${o.e.toFixed(2)}`, px + 8, py + 54, { size: ls, alpha: 0.6 });
    }

    // population streamgraph
    const H = s.hist;
    if (H.length > 1) {
      const maxT = Math.max(...H.map((row) => row.reduce((a, v) => a + v, 0)), 1);
      const sx = stream.w / (H.length - 1);
      const off = 0;
      const mid = stream.y + stream.h / 2;
      const k = stream.h / maxT;
      for (let l = 0; l < LINEAGES; l++) {
        ctx.beginPath();
        for (let i = 0; i < H.length; i++) {
          const tot = H[i].reduce((a, v) => a + v, 0);
          let below = 0;
          for (let m = 0; m < l; m++) below += H[i][m];
          const y = mid - (tot / 2) * k + (below + H[i][l]) * k;
          const x = stream.x + off + i * sx;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        for (let i = H.length - 1; i >= 0; i--) {
          const tot = H[i].reduce((a, v) => a + v, 0);
          let below = 0;
          for (let m = 0; m < l; m++) below += H[i][m];
          ctx.lineTo(stream.x + off + i * sx, mid - (tot / 2) * k + below * k);
        }
        ctx.closePath();
        ctx.fillStyle = rgba(s.cols[l], 0.85);
        ctx.fill();
      }
    }
    label(ctx, "POPULATION BY LINEAGE", stream.x, stream.y - 16, { size: ls, alpha: 0.5 });
    label(ctx, `−${Math.round((H.length - 1) * 0.5)} s`, stream.x, stream.y + stream.h + 6, { size: ls, alpha: 0.4 });
    label(ctx, "NOW", stream.x + stream.w, stream.y + stream.h + 6, { size: ls, alpha: 0.4, align: "right" });

    const lins = new Set(alive.map((o) => o.lin)).size;
    chrome(ctx, w, h, "FIG.06 — GENOME SPACE", `POP ${String(alive.length).padStart(3, "0")} · LINEAGES ${lins}`);
  },
};

/* Footer wordmark ---------------------------------------------------------------- */
export const wordmark = {
  bg: null,
  draw(ctx, w, h, t, env) {
    const text = "darian lalla";
    ctx.font = `560 100px ${SANS}`;
    ctx.letterSpacing = "-6px";
    const m = ctx.measureText(text);
    const fs = Math.min((100 * w) / m.width, h * 1.28);
    ctx.font = `560 ${fs}px ${SANS}`;
    ctx.letterSpacing = `${-fs * 0.06}px`;
    const m2 = ctx.measureText(text);
    ctx.fillStyle = `rgb(${env.fg[0]},${env.fg[1]},${env.fg[2]})`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(text, (w - m2.width) / 2 - fs * 0.02, h - m2.actualBoundingBoxDescent - 2);
    ctx.letterSpacing = "0px";
  },
};
