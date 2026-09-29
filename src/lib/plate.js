// Plate renderer: draws a generative sketch offscreen, then composites it as
// image, coloured ASCII, or ordered-dither pixels. In image mode the rows near the
// bottom of the viewport stay in "text" and decode as they scroll up (aino-style),
// and the cursor opens a lens that flips cells to the opposite representation.

import { cellPx, getAtlas } from "./glyphs.js";
import { hash2 } from "./math.js";

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);
const BAND = 44; // css px of text at the bottom of the viewport
const FRONT = 36; // css px of scrambled transition above it

export class Plate {
  constructor(canvas, sketch, { transparent = false, seed = 1 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.sketch = sketch;
    this.transparent = transparent;
    this.seed = seed;
    const mk = (opts) => {
      const c = document.createElement("canvas");
      return [c, c.getContext("2d", opts)];
    };
    [this.src, this.sctx] = mk();
    [this.samp, this.pctx] = mk({ willReadFrequently: true });
    [this.glyph, this.gctx] = mk();
    [this.color, this.cctx] = mk();
    [this.pix, this.xctx] = mk({ willReadFrequently: true });
    this.state = sketch.init ? sketch.init() : {};
    this.w = 0;
  }

  resize(w, h) {
    if (w < 2 || h < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.q = Math.min(dpr, 1.5);
    this.src.width = Math.round(w * this.q);
    this.src.height = Math.round(h * this.q);
    ({ cw: this.cw, ch: this.ch } = cellPx(dpr));
    this.cols = Math.ceil(this.canvas.width / this.cw);
    this.rows = Math.ceil(this.canvas.height / this.ch);
    this.samp.width = this.color.width = this.cols;
    this.samp.height = this.color.height = this.rows;
    this.colorData = this.cctx.createImageData(this.cols, this.rows);
    this.glyph.width = this.canvas.width;
    this.glyph.height = this.canvas.height;
    this.atlas = getAtlas(this.cw, this.ch);
    this.sketch.resize?.(this.state, w, h);
  }

  render(t, env) {
    if (!this.w) return;
    const { ctx, canvas, w, h } = this;
    this.sctx.setTransform(this.q, 0, 0, this.q, 0, 0);
    this.sctx.clearRect(0, 0, w, h);
    this.sketch.draw(this.sctx, w, h, t, env, this.state);

    if (env.mode === "pixel") return this.renderPixel(env);

    const { cols, rows, cw, ch, dpr, atlas } = this;
    const pctx = this.pctx;
    pctx.clearRect(0, 0, cols, rows);
    pctx.drawImage(this.src, 0, 0, canvas.width / cw, canvas.height / ch);
    const data = pctx.getImageData(0, 0, cols, rows).data;
    const out = this.colorData.data;
    const n = atlas.n;
    const text = env.mode === "text";
    const tick = Math.floor(t * 14);
    const glitchOn = env.animate && hash2(Math.floor(t * 0.7) + this.seed * 31, 3) > 0.72 && (t * 0.7) % 1 < 0.12;
    const gRow = Math.floor(hash2(Math.floor(t * 0.7), this.seed) * rows);
    const mcx = (env.mouse.x * dpr) / cw;
    const mcy = (env.mouse.y * dpr) / ch;
    const lensR = this.sketch.noLens ? 0 : 11 * env.mouse.on; // sketches with their own hover UI opt out
    const fg = env.fg;

    const gctx = this.gctx;
    gctx.globalCompositeOperation = "source-over";
    gctx.clearRect(0, 0, canvas.width, canvas.height);
    const erase = new Path2D();
    let anyText = false;
    let anyImage = false;

    for (let r = 0; r < rows; r++) {
      const screenY = env.top + (r * ch) / dpr;
      const fromBottom = env.vh - screenY;
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const k = i * 4;
        const hsh = hash2(c + this.seed * 997, r);
        let asText = text;
        let front = false;

        if (!text && env.reveal < 1) {
          // activation sweep: text below the frontier, scrambled at it, image above
          const fr = env.reveal * (rows + 8) - 4;
          if (r > fr + 2) asText = true;
          else if (r > fr - 2) {
            asText = true;
            front = hash2(c + tick, r) > 0.35;
          }
        } else if (!text && env.band !== false) {
          if (fromBottom < BAND) asText = true;
          else if (fromBottom < BAND + FRONT) {
            const p = (fromBottom - BAND) / FRONT;
            if (hsh > p) {
              asText = true;
              front = hash2(c + tick, r) > 0.45;
            }
          }
          if (glitchOn && Math.abs(r - gRow) < 2) asText = true;
        }
        let inLens = false;
        if (lensR > 0.5) {
          const d = Math.hypot(c - mcx, (r - mcy) * 2);
          if (d < lensR * (0.75 + 0.25 * hsh)) {
            asText = !asText;
            inLens = asText;
          }
        }

        if (!asText) {
          anyImage = true;
          out[k + 3] = 0;
          continue;
        }
        anyText = true;
        erase.rect(c * cw, r * ch, cw, ch);

        let R = data[k], G = data[k + 1], B = data[k + 2];
        const A = data[k + 3];
        let v;
        if (this.transparent) {
          v = A / 255;
          R = fg[0];
          G = fg[1];
          B = fg[2];
        } else {
          const m = Math.max(R, G, B, 1);
          const lum = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
          const val = 0.45 * lum + 0.55 * (m / 255);
          v = Math.pow(Math.max(0, (val - 0.07) / 0.93), 0.72);
          const s = (120 + 135 * v) / m;
          R = Math.min(255, R * s);
          G = Math.min(255, G * s);
          B = Math.min(255, B * s);
        }
        let gi = Math.round(v * (n - 1));
        if (front) {
          gi = 1 + Math.floor(hash2(c * 7 + tick, r * 3) * (n - 1));
          R = fg[0];
          G = fg[1];
          B = fg[2];
        }
        if (gi <= 0 && inLens) {
          gi = 1;
          R = fg[0] * 0.45;
          G = fg[1] * 0.45;
          B = fg[2] * 0.45;
        }
        if (gi <= 0) {
          out[k + 3] = 0;
          continue;
        }
        out[k] = R;
        out[k + 1] = G;
        out[k + 2] = B;
        out[k + 3] = 255;
        gctx.drawImage(atlas.canvas, gi * cw, 0, cw, ch, c * cw, r * ch, cw, ch);
      }
    }

    if (this.transparent) ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (anyImage) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.src, 0, 0, canvas.width, canvas.height);
    } else if (!this.transparent) {
      ctx.fillStyle = this.sketch.bg || "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    if (!anyText) return;
    if (anyImage) {
      if (this.transparent) {
        ctx.globalCompositeOperation = "destination-out";
        ctx.fill(erase);
        ctx.globalCompositeOperation = "source-over";
      } else {
        ctx.fillStyle = this.sketch.bg || "#000";
        ctx.fill(erase);
      }
    }
    this.cctx.putImageData(this.colorData, 0, 0);
    gctx.globalCompositeOperation = "source-in";
    gctx.imageSmoothingEnabled = false;
    gctx.drawImage(this.color, 0, 0, cols * cw, rows * ch);
    gctx.globalCompositeOperation = "source-over";
    ctx.drawImage(this.glyph, 0, 0);
  }

  renderPixel(env) {
    const { ctx, canvas, w, h } = this;
    const block = 4;
    const pw = Math.ceil(w / block);
    const ph = Math.ceil(h / block);
    if (this.pix.width !== pw || this.pix.height !== ph) {
      this.pix.width = pw;
      this.pix.height = ph;
    }
    const x = this.xctx;
    x.clearRect(0, 0, pw, ph);
    x.drawImage(this.src, 0, 0, pw, ph);
    const img = x.getImageData(0, 0, pw, ph);
    const d = img.data;
    const levels = 3;
    const fg = env.fg;
    for (let yy = 0; yy < ph; yy++) {
      for (let xx = 0; xx < pw; xx++) {
        const k = (yy * pw + xx) * 4;
        const b = BAYER[(yy & 3) * 4 + (xx & 3)] / levels;
        if (this.transparent) {
          const a = d[k + 3] / 255 + b;
          d[k] = fg[0];
          d[k + 1] = fg[1];
          d[k + 2] = fg[2];
          d[k + 3] = a > 0.5 ? 255 : 0;
          continue;
        }
        // ordered dither with a black point, so the dark paper stays clean
        for (let j = 0; j < 3; j++) {
          const v = Math.max(0, (d[k + j] / 255 - 0.07) / 0.93);
          d[k + j] = Math.min(levels, Math.floor(v * levels + b * levels + 0.5)) * (255 / levels);
        }
      }
    }
    x.putImageData(img, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.pix, 0, 0, pw * block * this.dpr, ph * block * this.dpr);
  }
}
