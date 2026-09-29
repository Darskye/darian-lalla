// Perceptual colormaps from the data-science toolbox, as 256-step lookup tables.

const STOPS = {
  magma: ["#000004", "#1c1044", "#4f127b", "#812581", "#b5367a", "#e55064", "#fb8761", "#fec287", "#fcfdbf"],
  inferno: ["#000004", "#1f0c48", "#550f6d", "#88226a", "#ba3655", "#e35933", "#f98c0a", "#f9c932", "#fcffa4"],
  viridis: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"],
  // cold → warm sea-surface temperature
  thermal: ["#0b2a5b", "#1561a8", "#3c9ad0", "#9fd6ea", "#f3ead2", "#f8b46a", "#ec6a3c", "#c42a2a", "#7e0f20"],
  // diverging red–blue (warming stripes)
  rdbu: ["#053061", "#2166ac", "#4393c3", "#92c5de", "#d1e5f0", "#f7f7f7", "#fddbc7", "#f4a582", "#d6604d", "#b2182b", "#67001f"],
  turbo: [
    "#30123b", "#4145ab", "#4675ed", "#39a2fc", "#1bcfd4", "#24eca6", "#61fc6c",
    "#a4fc3b", "#d1e834", "#f3c63a", "#fe9b2d", "#f36315", "#d93806", "#b11901", "#7a0403",
  ],
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const luts = {};

function build(name) {
  const stops = STOPS[name].map(hex);
  const rgb = [];
  const css = [];
  for (let i = 0; i < 256; i++) {
    const t = (i / 255) * (stops.length - 1);
    const k = Math.min(Math.floor(t), stops.length - 2);
    const f = t - k;
    const c = [0, 1, 2].map((j) => Math.round(stops[k][j] + (stops[k + 1][j] - stops[k][j]) * f));
    rgb.push(c);
    css.push(`rgb(${c[0]},${c[1]},${c[2]})`);
  }
  return (luts[name] = { rgb, css });
}

const idx = (t) => Math.max(0, Math.min(255, Math.round(t * 255)));

export function cmap(name, t) {
  return (luts[name] || build(name)).rgb[idx(t)];
}

export function cmapCss(name, t, a = 1) {
  const lut = luts[name] || build(name);
  if (a >= 1) return lut.css[idx(t)];
  const [r, g, b] = lut.rgb[idx(t)];
  return `rgba(${r},${g},${b},${a})`;
}
