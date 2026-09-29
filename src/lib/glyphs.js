// Glyph atlas: renders a character set once, sorts it by ink coverage,
// and exposes it as a density ramp (index 0 is always blank).

export const MONO = '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';
export const SANS = '"Geist Variable", Helvetica, Arial, sans-serif';
export const WIDE = '"Anybody Wide", "Arial Black", sans-serif';

const CHARSET = " ·.:-=+<>!?/|()1iIl7t3259468A0ONM#%@";
const cache = new Map();

let fontsPromise;
export function fontsReady() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      document.fonts?.load(`500 12px ${MONO}`),
      document.fonts?.load(`500 12px ${SANS}`),
      document.fonts?.load(`800 12px ${WIDE}`),
    ])
      .then(() => document.fonts?.ready)
      .catch(() => {});
  }
  return fontsPromise;
}

/**
 * @param {number} cw  cell width in device pixels
 * @param {number} ch  cell height in device pixels
 */
export function getAtlas(cw, ch) {
  const key = `${cw}x${ch}`;
  if (cache.has(key)) return cache.get(key);

  const fontPx = Math.round(ch * 0.78);
  const font = `500 ${fontPx}px ${MONO}`;
  const chars = [...new Set(CHARSET)];

  const probe = document.createElement("canvas");
  probe.width = cw;
  probe.height = ch;
  const pc = probe.getContext("2d", { willReadFrequently: true });
  const setup = (c) => {
    c.font = font;
    c.fillStyle = "#fff";
    c.textAlign = "center";
    c.textBaseline = "middle";
  };
  setup(pc);

  const measured = chars.map((c) => {
    pc.clearRect(0, 0, cw, ch);
    pc.fillText(c, cw / 2, ch / 2 + fontPx * 0.04);
    const d = pc.getImageData(0, 0, cw, ch).data;
    let ink = 0;
    for (let i = 3; i < d.length; i += 4) ink += d[i];
    return { c, ink };
  });
  measured.sort((a, b) => a.ink - b.ink);
  const ramp = measured.map((m) => m.c);

  const canvas = document.createElement("canvas");
  canvas.width = cw * ramp.length;
  canvas.height = ch;
  const ac = canvas.getContext("2d");
  setup(ac);
  ramp.forEach((c, i) => ac.fillText(c, i * cw + cw / 2, ch / 2 + fontPx * 0.04));

  const atlas = { canvas, ramp, n: ramp.length, cw, ch };
  cache.set(key, atlas);
  return atlas;
}

/** Character cell size in CSS px (matches the --ch / --line grid). */
export const CELL = { w: 8, h: 16 };

export function cellPx(dpr) {
  return { cw: Math.max(4, Math.round(CELL.w * dpr)), ch: Math.max(8, Math.round(CELL.h * dpr)) };
}

export const SCRAMBLE = "·:-=+<>!?/1I3259468A0N#%";
