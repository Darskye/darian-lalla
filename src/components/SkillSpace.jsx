import { useEffect, useRef } from "react";
import { subscribe } from "../lib/ticker.js";
import { cmap } from "../lib/colormaps.js";
import { MONO, fontsReady } from "../lib/glyphs.js";
import { clamp, easeInOut, rng } from "../lib/math.js";
import { themeColors, useSettings } from "../lib/settings.jsx";
import { CLUSTERS } from "../content.js";

const COLOR_T = [0.14, 0.33, 0.58, 0.76, 0.9];

function layout() {
  const r = rng(42);
  const pts = [];
  CLUSTERS.forEach((cl, ci) => {
    cl.skills.forEach((name) => {
      const a = r() * Math.PI * 2;
      const d = 0.03 + r() * 0.1;
      pts.push({
        name,
        ci,
        tx: cl.at[0] + Math.cos(a) * d * 1.25,
        ty: cl.at[1] + Math.sin(a) * d,
        sx: r(),
        sy: r(),
        ph: r() * 10,
      });
    });
  });
  // relax so labels breathe
  for (let it = 0; it < 120; it++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = (b.tx - a.tx) * 0.8;
        const dy = b.ty - a.ty;
        const d = Math.hypot(dx, dy) || 1e-4;
        if (d < 0.075) {
          const f = (0.075 - d) * 0.5;
          a.tx -= (dx / d) * f;
          a.ty -= (dy / d) * f;
          b.tx += (dx / d) * f;
          b.ty += (dy / d) * f;
        }
      }
    }
    for (const p of pts) {
      p.tx = clamp(p.tx, 0.05, 0.86);
      p.ty = clamp(p.ty, 0.1, 0.92);
    }
  }
  for (const p of pts) {
    p.nn = pts
      .filter((q) => q !== p)
      .map((q) => [q, Math.hypot(q.tx - p.tx, q.ty - p.ty)])
      .sort((a, b) => a[1] - b[1])
      .slice(0, 4);
  }
  return pts;
}

export default function SkillSpace() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const readRef = useRef(null);
  const settings = useSettings();
  const live = useRef(settings);
  live.current = settings;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const pts = layout();
    const mouse = { x: -1e4, y: -1e4, on: false };
    let w = 0, h = 0, dpr = 1;
    let seen = false;
    let prog = 0;
    let local = 0;
    let unsub = null;
    let moodSeen;
    let fg = [245, 245, 240];

    const resize = () => {
      const r = wrap.getBoundingClientRect();
      w = r.width;
      h = r.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw(0);
    };

    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    function draw(dt) {
      if (!w) return;
      const { mood, motion } = live.current;
      if (mood !== moodSeen) {
        moodSeen = mood;
        fg = themeColors().fg;
      }
      const moving = motion === "on";
      if (seen) prog = moving ? Math.min(1, prog + dt / 2.6) : 1;
      if (moving) local += dt;
      const e = easeInOut(prog);
      const small = w < 640;
      const fs = small ? 9 : 10.5;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(fg, 0.07);
      for (let i = 1; i < 10; i++) {
        const x = Math.round((w * i) / 10) + 0.5;
        const y = Math.round((h * i) / 10) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.font = `500 ${fs}px ${MONO}`;
      ctx.textBaseline = "middle";

      const P = pts.map((p) => {
        const jitter = (1 - e) * 0.08;
        const x = p.sx + (p.tx - p.sx) * e + Math.sin(local * 0.6 + p.ph) * (0.004 + jitter);
        const y = p.sy + (p.ty - p.sy) * e + Math.cos(local * 0.5 + p.ph) * (0.004 + jitter);
        return [x * w, y * h];
      });

      let hover = -1;
      if (mouse.on) {
        let best = small ? 40 : 48;
        P.forEach(([x, y], i) => {
          const d = Math.hypot(x - mouse.x, y - mouse.y);
          if (d < best) {
            best = d;
            hover = i;
          }
        });
      }

      if (e > 0.98) {
        CLUSTERS.forEach((cl, ci) => {
          const c = cmap("turbo", COLOR_T[ci]);
          ctx.fillStyle = rgba(c, 0.85);
          ctx.textAlign = "left";
          ctx.fillText(`◦ ${cl.name}`, cl.label[0] * w, cl.label[1] * h);
        });
      }

      if (hover >= 0) {
        const p = pts[hover];
        const [x, y] = P[hover];
        ctx.strokeStyle = rgba(fg, 0.45);
        ctx.setLineDash([2, 3]);
        for (const [q, d] of p.nn) {
          const j = pts.indexOf(q);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(P[j][0], P[j][1]);
          ctx.stroke();
          ctx.fillStyle = rgba(fg, 0.5);
          ctx.textAlign = "center";
          ctx.fillText(d.toFixed(3), (x + P[j][0]) / 2, (y + P[j][1]) / 2 - 7);
        }
        ctx.setLineDash([]);
      }

      pts.forEach((p, i) => {
        const [x, y] = P[i];
        const c = cmap("turbo", COLOR_T[p.ci]);
        const isH = i === hover;
        const near = hover >= 0 && pts[hover].nn.some(([q]) => q === p);
        const dim = hover >= 0 && !isH && !near;
        ctx.fillStyle = rgba(c, dim ? 0.35 : 1);
        ctx.beginPath();
        ctx.arc(x, y, isH ? 5 : 3, 0, Math.PI * 2);
        ctx.fill();
        if (isH) {
          ctx.strokeStyle = rgba(c, 0.8);
          ctx.beginPath();
          ctx.arc(x, y, 11, 0, Math.PI * 2);
          ctx.stroke();
        }
        if (e > 0.6) {
          ctx.textAlign = "left";
          ctx.fillStyle = rgba(fg, (dim ? 0.3 : isH ? 1 : 0.78) * clamp((e - 0.6) / 0.4));
          ctx.fillText(p.name.toUpperCase(), x + 8, y);
        }
      });

      ctx.fillStyle = rgba(fg, 0.45);
      ctx.textAlign = "left";
      ctx.fillText("DIM-1 →", 8, h - 12);
      ctx.save();
      ctx.translate(12, h - 34);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("DIM-2 →", 0, 0);
      ctx.restore();

      if (readRef.current) {
        const kl = 0.31 + 2.1 * (1 - e) * (1 - e);
        const name = hover >= 0 ? `${pts[hover].name.toUpperCase()} · ${CLUSTERS[pts[hover].ci].name}` : "HOVER A POINT";
        readRef.current.textContent = `ITER ${String(Math.round(e * 1000)).padStart(4, "0")}   KL ${kl.toFixed(3)}   ${name}`;
      }
    }

    const ro = new ResizeObserver(resize);
    const io = new IntersectionObserver(
      ([en]) => {
        if (en.isIntersecting) {
          if (en.intersectionRatio > 0.3) seen = true;
          if (!unsub) unsub = subscribe((_, dt) => draw(dt));
        } else if (unsub) {
          unsub();
          unsub = null;
        }
      },
      { threshold: [0, 0.3] }
    );
    const move = (ev) => {
      const r = wrap.getBoundingClientRect();
      mouse.x = ev.clientX - r.left;
      mouse.y = ev.clientY - r.top;
      mouse.on = true;
    };
    const leave = () => (mouse.on = false);
    wrap.addEventListener("pointermove", move);
    wrap.addEventListener("pointerleave", leave);
    fontsReady().then(() => {
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
  }, []);

  return (
    <figure className="skillspace">
      <figcaption className="fig-head">
        <span>FIG.07 — Skill space</span>
        <span className="muted">Hand-tuned embedding · perplexity: high</span>
      </figcaption>
      <div ref={wrapRef} className="skillspace-canvas">
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      <div className="fig-foot" ref={readRef} aria-hidden="true">
        ITER 0000
      </div>
      <ul className="sr-only">
        {CLUSTERS.map((c) => (
          <li key={c.name}>
            {c.name}: {c.skills.join(", ")}
          </li>
        ))}
      </ul>
    </figure>
  );
}
