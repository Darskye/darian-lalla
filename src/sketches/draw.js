// Shared drawing helpers for the generative plates.

import { MONO } from "../lib/glyphs.js";

export const label = (ctx, text, x, y, { size = 9, alpha = 0.55, align = "left", color = "245,245,240" } = {}) => {
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = `rgba(${color},${alpha})`;
  ctx.fillText(text, x, y);
};

export const chrome = (ctx, w, h, fig, right) => {
  const s = Math.max(8, Math.min(10, w / 48));
  label(ctx, fig, 14, 14, { size: s });
  if (right) label(ctx, right, w - 14, 14, { size: s, align: "right" });
};

export const gauss = (r) => {
  const u = Math.max(1e-6, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
};
