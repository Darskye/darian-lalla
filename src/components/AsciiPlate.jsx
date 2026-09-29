import { useEffect, useRef } from "react";
import { Plate } from "../lib/plate.js";
import { subscribe } from "../lib/ticker.js";
import { fontsReady } from "../lib/glyphs.js";
import { START_T } from "../lib/debug.js";
import { themeColors, useSettings } from "../lib/settings.jsx";

export default function AsciiPlate({ sketch, seed = 1, transparent = false, still = 5, className = "", label, paused = false, revealKey = 0, band = true, style }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const settings = useSettings();
  const live = useRef(settings);
  live.current = settings;
  const ctl = useRef({ paused, band, revealAt: -1, revealKey });
  ctl.current.paused = paused;
  ctl.current.band = band;
  if (ctl.current.revealKey !== revealKey) {
    ctl.current.revealKey = revealKey;
    ctl.current.revealAt = performance.now();
  }

  useEffect(() => {
    const wrap = wrapRef.current;
    const plate = new Plate(canvasRef.current, sketch, { transparent, seed });
    const mouse = { x: -1e4, y: -1e4, on: 0, target: 0 };
    let unsub = null;
    let local = still + START_T;
    let colors = null;
    let moodSeen = null;
    let ready = false;

    const env = { mode: "image", top: 0, vh: 1, mouse, fg: [245, 245, 240], bg: [22, 22, 22], animate: true };
    let pending = 0;
    const draw = (frameDt) => {
      if (!ready || (ctl.current.paused && frameDt > 0)) return;
      const { img, motion, mood } = live.current;
      // full text/pixel plates are glyph-heavy; 30 fps reads the same and halves the cost
      pending += frameDt;
      if (frameDt > 0 && img !== "image" && pending < 1 / 31) return;
      const dt = pending;
      pending = 0;
      if (mood !== moodSeen) {
        moodSeen = mood;
        colors = themeColors();
      }
      const animate = motion === "on";
      if (animate) local += dt;
      mouse.on += (mouse.target - mouse.on) * Math.min(1, dt * 8 || 1);
      const rect = wrap.getBoundingClientRect();
      env.mode = img;
      env.top = rect.top;
      env.vh = window.innerHeight;
      env.fg = colors.fg;
      env.bg = colors.bg;
      env.animate = animate;
      env.band = ctl.current.band;
      const ra = ctl.current.revealAt;
      env.reveal = ra < 0 || !animate ? 1 : Math.min(1, (performance.now() - ra) / 950);
      plate.render(local, env);
    };

    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      plate.resize(r.width, r.height);
      draw(0);
    });
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !unsub) unsub = subscribe((_, dt) => draw(dt));
        else if (!e.isIntersecting && unsub) {
          unsub();
          unsub = null;
        }
      },
      { rootMargin: "80px 0px" }
    );

    const move = (e) => {
      const r = wrap.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
      mouse.target = 1;
    };
    const leave = () => {
      mouse.target = 0;
    };
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerleave", leave);

    fontsReady().then(() => {
      ready = true;
      ro.observe(wrap);
      io.observe(wrap);
    });

    return () => {
      unsub?.();
      ro.disconnect();
      io.disconnect();
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerleave", leave);
    };
  }, [sketch, seed, transparent, still]);

  return (
    <div ref={wrapRef} className={`plate ${className}`} role={label ? "img" : undefined} aria-label={label} style={style}>
      <canvas ref={canvasRef} />
    </div>
  );
}
