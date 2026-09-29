import { useEffect, useRef } from "react";
import { subscribe } from "../lib/ticker.js";
import { cellPx, fontsReady, getAtlas } from "../lib/glyphs.js";
import { clamp, hash2, noise1 } from "../lib/math.js";
import { themeColors } from "../lib/settings.jsx";

/** A one-line ASCII waveform pinned to the bottom edge; scroll speed drives it. */
export default function SignalStrip() {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let atlas, cw, ch, cols, dpr;
    let phase = 0;
    let vel = 0;
    let lastY = window.scrollY;
    let unsub = () => {};
    let moodSeen = null;
    let tint = "#f5f5f0";

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      ({ cw, ch } = cellPx(dpr));
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = ch;
      cols = Math.ceil(canvas.width / cw);
      atlas = getAtlas(cw, ch);
    };

    const frame = (t, dt) => {
      const y = window.scrollY;
      const dy = Math.abs(y - lastY);
      lastY = y;
      vel += (dy / Math.max(dt, 0.001) - vel) * 0.1;
      const still = document.documentElement.dataset.motion === "off";
      phase += still ? 0 : dt * (0.35 + Math.min(vel, 4000) * 0.0012);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const prog = max > 0 ? y / max : 0;
      const heroP = parseFloat(document.documentElement.style.getPropertyValue("--hero-p")) || 0;
      canvas.style.opacity = clamp(heroP * 1.4).toFixed(2);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const n = atlas.n;
      for (let c = 0; c < cols; c++) {
        const a = noise1(c * 0.07 + phase * 3);
        const b = noise1(c * 0.013 - phase + 40);
        let v = Math.pow(a * b, 1.4) * 1.9;
        if (c / cols < prog) v += 0.12;
        let gi = Math.round(clamp(v) * (n - 1));
        if (gi > 0) gi = Math.max(1, Math.min(n - 1, gi + Math.floor(hash2(c, Math.floor(phase * 6)) * 7) - 3));
        if (gi > 0) ctx.drawImage(atlas.canvas, gi * cw, 0, cw, ch, c * cw, 0, cw, ch);
      }
      const mood = document.documentElement.dataset.mood;
      if (mood !== moodSeen) {
        moodSeen = mood;
        const [r, g, b] = themeColors().fg;
        tint = `rgb(${r},${g},${b})`;
      }
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalCompositeOperation = "source-over";
    };

    fontsReady().then(() => {
      resize();
      window.addEventListener("resize", resize);
      unsub = subscribe(frame);
    });
    return () => {
      unsub();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="signal-strip" aria-hidden="true" />;
}
