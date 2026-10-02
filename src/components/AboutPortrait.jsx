import { useEffect, useRef, useState } from "react";
import { subscribe } from "../lib/ticker.js";
import { PortraitGL } from "../lib/portraitGL.js";
import { fontsReady } from "../lib/glyphs.js";
import { clamp, smooth } from "../lib/math.js";
import { useInView } from "./Reveal.jsx";
import { CHAPTERS, FACTS } from "../content.js";
import dataUrl from "../assets/portrait-data.png";
import colorUrl from "../assets/portrait-color.png";

const STEPS = [
  {
    code: "00",
    label: "Portrait",
    word: "HELLO",
    medium: "Assembled point cloud",
    text: "I'm Darian, a data scientist and creative technologist.",
  },
  ...CHAPTERS.map((c, i) => ({ ...c, medium: ["Topographic contours", "Binary terraces", "Generative swirl"][i] })),
];
const YAW = [0, -0.2, 0.03, 0.2];
const STEP_VH = 95;
const motionOff = () => document.documentElement.dataset.motion === "off";

function Barcode({ text }) {
  const bars = [...text].flatMap((c) => c.charCodeAt(0).toString(2).padStart(8, "0").split(""));
  return (
    <div className="ab-barcode" aria-hidden="true">
      {bars.map((b, i) => (
        <i key={i} style={{ width: b === "1" ? 3 : 1, "--i": i }} />
      ))}
    </div>
  );
}

export default function AboutPortrait() {
  const wrapRef = useRef(null);
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const hudRef = useRef(null);
  const barRef = useRef(null);
  const [active, setActive] = useState(0);
  const [failed, setFailed] = useState(false);
  const [glyphs, setGlyphs] = useState(0);
  const factsRef = useInView(0.25);
  const quoteRef = useInView(0.4);

  useEffect(() => {
    let gl = null;
    let unsub = () => {};
    let disposed = false;
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const st = { t: 0, spos: 0, mx: 0, my: 0, mOn: 0, mTarget: 0, yaw: 0, pitch: 0, wave: [0, 0, -9, 0], nx: 0, ny: 0 };

    const resize = () => {
      if (!gl) return;
      const r = canvas.getBoundingClientRect();
      gl.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2));
    };
    const move = (e) => {
      const r = canvas.getBoundingClientRect();
      st.nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      st.ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      st.mTarget = 1;
    };
    const leave = () => (st.mTarget = 0);
    const down = (e) => {
      if (!gl || e.target.closest("a, button")) return;
      move(e);
      const [x, y] = gl.planePoint(st.nx, st.ny);
      st.wave = [x, y, st.t, 1];
    };

    fontsReady()
      .then(() => PortraitGL.create(canvas, dataUrl, colorUrl))
      .then((g) => {
        if (disposed) return;
        gl = g;
        setGlyphs(g.count);
        resize();
        const ro = new ResizeObserver(resize);
        ro.observe(canvas);
        let lastActive = -1;
        const off = subscribe((_, dt) => {
          const wr = wrapRef.current.getBoundingClientRect();
          const vh = window.innerHeight;
          if (wr.bottom < -50 || wr.top > vh + 50) return;
          const still = motionOff();
          if (!still) st.t += dt;
          const span = Math.max(1, wr.height - vh);
          const p = clamp(-wr.top / span);
          const target = p * (STEPS.length - 1);
          st.spos = still ? target : st.spos + (target - st.spos) * Math.min(1, dt * 5);
          const i0 = Math.min(STEPS.length - 2, Math.floor(st.spos));
          const f = smooth(clamp((st.spos - i0 - 0.2) / 0.6));
          const w = [0, 0, 0, 0];
          w[i0] = 1 - f;
          w[i0 + 1] = f;
          const ai = Math.round(i0 + f);
          if (ai !== lastActive) {
            lastActive = ai;
            setActive(ai);
          }
          const assemble = still ? 1 : clamp((vh * 1.05 - wr.top) / (vh * 0.95));
          st.mOn += (st.mTarget - st.mOn) * Math.min(1, dt * 5);
          st.mx += (st.nx - st.mx) * Math.min(1, dt * 4);
          st.my += (st.ny - st.my) * Math.min(1, dt * 4);
          const sway = still ? 0 : Math.sin(st.t * 0.35) * 0.06;
          const yawT = YAW[i0] * (1 - f) + YAW[i0 + 1] * f + st.mx * 0.3 * st.mOn + sway;
          const pitchT = -st.my * 0.2 * st.mOn + 0.04;
          st.yaw += (yawT - st.yaw) * Math.min(1, dt * 3);
          st.pitch += (pitchT - st.pitch) * Math.min(1, dt * 3);
          const wide = stage.clientWidth >= 900;
          const [px, py] = gl.planePoint(st.mx, st.my);
          gl.render({
            t: st.t,
            assemble,
            w,
            yaw: st.yaw,
            pitch: st.pitch,
            mouse: [px, py, st.mOn],
            wave: st.wave,
            offsetX: wide ? -0.98 : 0,
            light: document.documentElement.dataset.mood === "light" ? 1 : 0,
          });
          if (barRef.current) barRef.current.style.transform = `scaleX(${p.toFixed(4)})`;
          if (hudRef.current) {
            const d = (0.5 * w[0] + 0.5 * w[1] + 0.62 * w[2] + 0.85 * w[3]).toFixed(2);
            hudRef.current.textContent = `YAW ${(st.yaw >= 0 ? "+" : "") + st.yaw.toFixed(2)}  PITCH ${(st.pitch >= 0 ? "+" : "") + st.pitch.toFixed(2)}  DEPTH ${d}`;
          }
        });
        unsub = () => {
          off();
          ro.disconnect();
        };
      })
      .catch((err) => {
        console.error(err);
        setFailed(true);
      });

    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    stage.addEventListener("pointerdown", down);
    return () => {
      disposed = true;
      unsub();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
      stage.removeEventListener("pointerdown", down);
    };
  }, []);

  const jump = (i) => {
    const wr = wrapRef.current;
    const top = wr.getBoundingClientRect().top + window.scrollY;
    const span = wr.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + (i / (STEPS.length - 1)) * span + 2, behavior: "smooth" });
  };

  return (
    <>
      <div className="ab-wrap" ref={wrapRef} style={{ height: `calc(100vh + ${(STEPS.length - 1) * STEP_VH}vh)` }}>
        <div className="ab-stage" ref={stageRef} data-step={active}>
          {STEPS.map((s, i) => (
            <div key={s.code} className={`ab-aura a${i} ${active === i ? "on" : ""}`} aria-hidden="true" />
          ))}
          <canvas ref={canvasRef} className="ab-gl" aria-label="A 3D portrait of Darian made of text characters" />
          {failed && <div className="ab-fail">Portrait needs WebGL2.</div>}

          <div className="ab-copy">
            {STEPS.map((s, i) => (
              <article key={s.code} className={`ab-ch ${active === i ? "on" : ""}`} aria-hidden={active !== i}>
                <div className="ab-ch-head">
                  <span className="chapter-code">{s.code}</span>
                  <span>{s.label}</span>
                </div>
                <div className={`ab-word w${i}`}>{s.word}</div>
                <p className="ab-text">{s.text}</p>
                <div className="ab-medium">
                  <span className="muted">Medium</span> {s.medium}
                </div>
              </article>
            ))}
          </div>

          <div className="ab-hud-top" aria-hidden="true">
            <span>FIG.09 — Self-portrait</span>
            <span className="muted">{glyphs ? `${glyphs.toLocaleString("en-US")} glyphs · 3D` : "loading"}</span>
          </div>
          <div className="ab-hud" aria-hidden="true">
            <div className="ab-steps">
              {STEPS.map((s, i) => (
                <button key={s.code} type="button" tabIndex={-1} className={active === i ? "on" : ""} onClick={() => jump(i)}>
                  {s.code} {s.label}
                </button>
              ))}
            </div>
            <div className="ab-progress">
              <i ref={barRef} />
            </div>
            <div className="ab-readout muted" ref={hudRef} />
          </div>
          <div className={`ab-hint ${active === 0 ? "" : "gone"}`} aria-hidden="true">
            Move across the portrait · click to ripple · scroll to change the medium
          </div>
        </div>
      </div>

      <div className="ab-after">
        <div className="ab-facts" ref={factsRef}>
          {FACTS.map(([k, v], i) => (
            <div key={k} className="ab-fact" style={{ "--d": `${0.06 * i}s` }}>
              <span className="muted">{k}</span>
              <span>{v}</span>
            </div>
          ))}
          <Barcode text="DARIAN LALLA" />
        </div>
        <blockquote className="ab-quote" ref={quoteRef}>
          <p>
            “Without <span className="q-data">data</span>, you&apos;re just another person with an opinion.”
          </p>
          <cite>— W. Edwards Deming</cite>
        </blockquote>
      </div>
    </>
  );
}
