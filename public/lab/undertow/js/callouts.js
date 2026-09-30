// Leader-line callouts: a pulsing anchor on a map feature, a line that draws in, and a
// glass box of explanation that finds free space next to it and follows the feature.

import { clamp, escapeHTML, lerp } from "./util.js";

const SVGNS = "http://www.w3.org/2000/svg";
const GAP = 16;

export class Callouts {
  constructor(root, flow) {
    this.root = root;
    this.flow = flow;
    this.svg = document.createElementNS(SVGNS, "svg");
    this.svg.setAttribute("class", "co-lines");
    this.svg.setAttribute("aria-hidden", "true");
    root.appendChild(this.svg);
    this.items = new Map();
    this.max = 5;
    this.obstacles = [];
    this.lastObstacleScan = 0;
  }

  /** items: [{ id, lon, lat, code, label, title, text, metrics: [[value, unit]], tone, spark }] */
  set(list) {
    const keep = new Set();
    list.slice(0, this.max).forEach((it, i) => {
      keep.add(it.id);
      let c = this.items.get(it.id);
      if (!c) {
        c = this.create(it, i);
        this.items.set(it.id, c);
      } else if (c.leaving) {
        c.leaving = false;
        c.box.classList.remove("is-out");
        c.g.classList.remove("is-out");
      }
      c.data = it;
      this.fill(c);
    });
    for (const [id, c] of this.items) if (!keep.has(id) && !c.leaving) this.remove(id);
  }
  clear() { for (const id of [...this.items.keys()]) this.remove(id); }

  create(it, i) {
    const box = document.createElement("div");
    box.className = "co";
    box.style.setProperty("--d", `${0.25 + i * 0.12}s`);
    this.root.appendChild(box);
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", "co-g");
    g.style.setProperty("--d", `${0.1 + i * 0.12}s`);
    g.innerHTML = '<path class="co-lead"/><circle class="co-ring" r="10"/><circle class="co-dot" r="3"/>';
    this.svg.appendChild(g);
    return { box, g, path: g.firstChild, ring: g.children[1], dot: g.children[2], x: null, y: null, w: 0, h: 0, side: null, html: "" };
  }
  fill(c) {
    const it = c.data;
    const metrics = (it.metrics || []).map(([v, u]) => `<span><b>${escapeHTML(v)}</b>${u ? ` ${escapeHTML(u)}` : ""}</span>`).join("");
    const spark = it.spark ? sparkSVG(it.spark, it.tone) : "";
    const html = `<div class="co-head"><span class="co-code">${escapeHTML(it.code || "")}</span><span>${escapeHTML(it.label || "")}</span></div>`
      + (it.title ? `<div class="co-title">${escapeHTML(it.title)}</div>` : "")
      + (metrics ? `<div class="co-metrics">${metrics}</div>` : "")
      + spark
      + (it.text ? `<p class="co-text">${escapeHTML(it.text)}</p>` : "");
    if (html !== c.html) {
      c.box.innerHTML = html;
      c.html = html;
      c.w = c.box.offsetWidth;
      c.h = c.box.offsetHeight;
    }
    c.box.dataset.tone = it.tone || "neutral";
    c.g.dataset.tone = it.tone || "neutral";
  }
  remove(id) {
    const c = this.items.get(id);
    if (!c) return;
    c.leaving = true;
    c.box.classList.add("is-out");
    c.g.classList.add("is-out");
    setTimeout(() => {
      if (!c.leaving) return;
      c.box.remove();
      c.g.remove();
      this.items.delete(id);
    }, 450);
  }

  scanObstacles(now) {
    if (now - this.lastObstacleScan < 400) return;
    this.lastObstacleScan = now;
    this.obstacles = [...document.querySelectorAll("[data-obstacle]")]
      .filter((el) => el.offsetParent !== null && getComputedStyle(el).visibility !== "hidden")
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({ x: r.left - 8, y: r.top - 8, w: r.width + 16, h: r.height + 16 }));
  }

  update(now) {
    this.scanObstacles(now);
    const W = innerWidth, H = innerHeight;
    const placed = [...this.obstacles];
    const order = [...this.items.values()].sort((a, b) => (a.leaving ? 1 : 0) - (b.leaving ? 1 : 0));
    for (const c of order) {
      const it = c.data;
      const p = this.flow.toScreen(it.lon, it.lat);
      const anchorOk = p.visible && !placed.slice(0, this.obstacles.length).some((r) => inside(p.x, p.y, r));
      let target = null;
      if (anchorOk && !c.leaving) {
        const tries = [];
        for (const d of [44, 84, 132]) {
          tries.push([p.x + d, p.y - d - c.h * 0.5, "r"], [p.x - d - c.w, p.y - d - c.h * 0.5, "l"],
            [p.x + d, p.y + d - c.h * 0.3, "r"], [p.x - d - c.w, p.y + d - c.h * 0.3, "l"]);
        }
        // prefer the side the box is already on, so it doesn't flip back and forth
        if (c.side) tries.sort((a, b) => (a[2] === c.side ? 0 : 1) - (b[2] === c.side ? 0 : 1));
        for (const [x, y, side] of tries) {
          const r = { x, y, w: c.w, h: c.h };
          if (x < GAP || y < GAP || x + c.w > W - GAP || y + c.h > H - GAP) continue;
          if (placed.some((o) => overlap(r, o))) continue;
          target = { x, y, side };
          break;
        }
      }
      const show = !!target;
      c.box.classList.toggle("is-hidden", !show);
      c.g.classList.toggle("is-hidden", !show);
      if (!show) { c.x = null; continue; }
      placed.push({ x: target.x - 6, y: target.y - 6, w: c.w + 12, h: c.h + 12 });
      if (c.x === null || c.side !== target.side) { c.x = target.x; c.y = target.y; }
      c.x = lerp(c.x, target.x, 0.18);
      c.y = lerp(c.y, target.y, 0.18);
      c.side = target.side;
      c.box.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
      // elbow: anchor -> diagonal -> short horizontal into the box's near top corner
      const bx = target.side === "r" ? c.x : c.x + c.w;
      const by = c.y + 14;
      const ex = bx + (target.side === "r" ? -14 : 14);
      c.path.setAttribute("d", `M${p.x.toFixed(1)},${p.y.toFixed(1)} L${ex.toFixed(1)},${by.toFixed(1)} L${bx.toFixed(1)},${by.toFixed(1)}`);
      c.dot.setAttribute("cx", p.x.toFixed(1));
      c.dot.setAttribute("cy", p.y.toFixed(1));
      c.ring.setAttribute("cx", p.x.toFixed(1));
      c.ring.setAttribute("cy", p.y.toFixed(1));
    }
  }
}

function inside(x, y, r) { return x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h; }
function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

export function sparkSVG(values, tone = "neutral", w = 168, h = 28) {
  const lo = Math.min(...values, 0), hi = Math.max(...values, 0);
  const sx = (i) => (i / (values.length - 1)) * (w - 4) + 2;
  const sy = (v) => h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4);
  const pts = values.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(" ");
  const zero = sy(0).toFixed(1);
  const last = values.length - 1;
  return `<svg class="co-spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-tone="${tone}" aria-hidden="true">`
    + `<line x1="0" x2="${w}" y1="${zero}" y2="${zero}" class="z"/>`
    + `<polyline points="${pts}"/><circle cx="${sx(last).toFixed(1)}" cy="${sy(values[last]).toFixed(1)}" r="2.5"/></svg>`;
}

export { clamp };
