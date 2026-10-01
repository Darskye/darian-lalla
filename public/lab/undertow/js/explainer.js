// "How the model sees": an animated pipeline drawn from the real fields.
//   1 last three days of currents -> 2 the same map rewritten as waves (2D Fourier spectrum)
//   -> 3 keep the largest waves and apply learned weights -> 4 back to a map: tomorrow.

import { ramp, PALETTES, clamp, reduceMotion } from "./util.js";

const SPEED = ramp(PALETTES.speed, 256);
const JET = ramp(PALETTES.jet, 256);
const MODES = 12;       // Fourier modes kept per axis by the model (see tools/undertow/train_fno.py)
const TILE = 96;        // the model's working tile incl. padding

function speedImage(o, u, v, dayOffset, vmax) {
  const { W, H, n } = o;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const src = dayOffset + j * W + i, dst = ((H - 1 - j) * W + i) * 4;
      if (o.mask[j * W + i] < 128) { img.data.set([14, 17, 22, 255], dst); continue; }
      const s = Math.sqrt(clamp(Math.hypot(u[src], v[src]) / vmax)) * 255 | 0;
      img.data.set([SPEED[s * 4], SPEED[s * 4 + 1], SPEED[s * 4 + 2], 255], dst);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// log-magnitude 2D DFT of a TILE x TILE crop of u, shifted so the largest waves sit in the middle
function spectrumImage(o, u, dayOffset) {
  const { W, H } = o;
  const N = TILE;
  const x0 = Math.max(0, Math.floor((W - N) / 2)), y0 = Math.max(0, Math.floor((H - N) / 2));
  const f = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = Math.min(x0 + i, W - 1), y = Math.min(y0 + j, H - 1);
    f[j * N + i] = u[dayOffset + y * W + x];
  }
  const cos = new Float32Array(N * N), sin = new Float32Array(N * N);
  for (let k = 0; k < N; k++) for (let x = 0; x < N; x++) {
    const a = (-2 * Math.PI * k * x) / N;
    cos[k * N + x] = Math.cos(a);
    sin[k * N + x] = Math.sin(a);
  }
  const re = new Float32Array(N * N), im = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {             // rows
    let r = 0, s = 0;
    for (let x = 0; x < N; x++) { const v = f[j * N + x]; r += v * cos[k * N + x]; s += v * sin[k * N + x]; }
    re[j * N + k] = r; im[j * N + k] = s;
  }
  const mag = new Float32Array(N * N);
  for (let k = 0; k < N; k++) for (let l = 0; l < N; l++) {             // columns
    let r = 0, s = 0;
    for (let y = 0; y < N; y++) {
      const a = re[y * N + k], b = im[y * N + k], c = cos[l * N + y], d = sin[l * N + y];
      r += a * c - b * d; s += a * d + b * c;
    }
    mag[l * N + k] = Math.log1p(Math.hypot(r, s));
  }
  let mx = 0;
  for (const m of mag) mx = Math.max(mx, m);
  const c = document.createElement("canvas");
  c.width = N; c.height = N;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(N, N);
  for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) {
    const sk = (k + N / 2) % N, sl = (l + N / 2) % N;                  // fftshift
    const t = Math.pow(mag[l * N + k] / mx, 1.6) * 255 | 0;
    img.data.set([JET[t * 4], JET[t * 4 + 1], JET[t * 4 + 2], 255], ((N - 1 - sl) * N + sk) * 4);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export class Explainer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.imgs = null;
    this.t0 = performance.now();
  }
  /** o: ocean data, t: start day index, fc: forecast run ({u, v}) */
  setData(o, t, fc) {
    const n = o.n, vmax = o.sc.vmax;
    this.imgs = {
      days: [t - 2, t - 1, t].map((k) => speedImage(o, o.u, o.v, Math.max(k, 0) * n, vmax)),
      spec: spectrumImage(o, o.u, t * n),
      next: fc ? speedImage(o, fc.u, fc.v, 0, vmax) : speedImage(o, o.u, o.v, Math.min(t + 1, o.N - 1) * n, vmax),
    };
    this.aspect = o.H / o.W;
  }
  draw(now) {
    const c = this.canvas, ctx = this.ctx;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !this.imgs) return;
    if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const col = w / 4, tw = Math.min(col - 14, 88), th = Math.min(tw * this.aspect, 62), top = 12;
    const cx = (i) => col * i + col / 2;
    const phase = reduceMotion ? 2.5 : ((now - this.t0) / 1000) % 4;        // which stage is lit
    const lit = (i) => 0.45 + 0.55 * Math.max(0, 1 - Math.abs(phase - i - 0.5) * 1.3);
    ctx.imageSmoothingEnabled = true;
    ctx.font = '500 10px "Geist Mono", ui-monospace, monospace';
    ctx.textAlign = "center";

    // connectors with travelling pulses
    for (let i = 0; i < 3; i++) {
      const x0 = cx(i) + tw / 2 + 5, x1 = cx(i + 1) - tw / 2 - 5, y = top + th / 2;
      ctx.strokeStyle = "rgba(245,245,240,0.22)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x1 - 4, y - 3); ctx.lineTo(x1, y); ctx.lineTo(x1 - 4, y + 3); ctx.stroke();
      const p = (((now - this.t0) / 1000 + i * 0.33) % 1);
      if (!reduceMotion) {
        const gx = x0 + (x1 - x0) * p;
        const grd = ctx.createRadialGradient(gx, y, 0, gx, y, 6);
        grd.addColorStop(0, "rgba(248,180,106,0.95)");
        grd.addColorStop(1, "rgba(248,180,106,0)");
        ctx.fillStyle = grd;
        ctx.fillRect(gx - 6, y - 6, 12, 12);
      }
    }
    // 1 · three days, stacked like cards
    ctx.globalAlpha = lit(0);
    this.imgs.days.forEach((im, k) => {
      const o = (2 - k) * 4;
      ctx.drawImage(im, cx(0) - tw / 2 + o, top - o, tw, th);
      ctx.strokeStyle = "rgba(245,245,240,0.3)";
      ctx.strokeRect(cx(0) - tw / 2 + o + 0.5, top - o + 0.5, tw - 1, th - 1);
    });
    // 2 · spectrum
    const sw = Math.min(tw, th + 8);
    ctx.globalAlpha = lit(1);
    ctx.drawImage(this.imgs.spec, cx(1) - sw / 2, top, sw, sw);
    // 3 · same spectrum, only the kept modes lit, with the window marked
    ctx.globalAlpha = lit(2) * 0.28;
    ctx.drawImage(this.imgs.spec, cx(2) - sw / 2, top, sw, sw);
    ctx.globalAlpha = lit(2);
    const kw = ((2 * MODES + 1) / TILE) * sw;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx(2) - kw / 2, top + sw / 2 - kw / 2, kw, kw); ctx.clip();
    ctx.drawImage(this.imgs.spec, cx(2) - sw / 2, top, sw, sw);
    ctx.restore();
    ctx.strokeStyle = "#f8b46a";
    ctx.strokeRect(cx(2) - kw / 2 - 0.5, top + sw / 2 - kw / 2 - 0.5, kw + 1, kw + 1);
    // 4 · tomorrow
    ctx.globalAlpha = lit(3);
    ctx.drawImage(this.imgs.next, cx(3) - tw / 2, top, tw, th);
    ctx.strokeStyle = "#f8b46a";
    ctx.strokeRect(cx(3) - tw / 2 + 0.5, top + 0.5, tw - 1, th - 1);
    ctx.globalAlpha = 1;
    // captions
    const labels = [["Last 3 days", "of currents"], ["As waves", "(Fourier)"], ["Keep big", "waves ×W"], ["Tomorrow", "as a map"]];
    labels.forEach(([a, b], i) => {
      ctx.fillStyle = `rgba(245,245,240,${0.5 + 0.5 * (lit(i) - 0.45) / 0.55})`;
      ctx.fillText(a, cx(i), top + Math.max(th, sw) + 18);
      ctx.fillStyle = "rgba(245,245,240,0.5)";
      ctx.fillText(b, cx(i), top + Math.max(th, sw) + 31);
    });
  }
}
