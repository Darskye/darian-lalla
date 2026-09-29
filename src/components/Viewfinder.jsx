import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsciiPlate from "./AsciiPlate.jsx";
import Scramble from "./Scramble.jsx";
import { subscribe } from "../lib/ticker.js";
import { MONO } from "../lib/glyphs.js";
import { themeColors, useSettings } from "../lib/settings.jsx";
import { hoverBlip, setSound, tick } from "../lib/sound.js";
import { CONCEPTS, WORK } from "../content.js";

const ALL = [
  ...WORK.map((w, i) => ({ ...w, kind: "work", n: i + 1 })),
  ...CONCEPTS.map((c, i) => ({ ...c, kind: "concept", n: i + 1 })),
];
const FILTERS = [
  ["selected", "Selected", (i) => i.kind === "work"],
  ["concepts", "Concepts", (i) => i.kind === "concept"],
  ["index", "Index", () => true],
];
const pad = (n) => String(n).padStart(2, "0");
const ext = { target: "_blank", rel: "noreferrer" };
const STEP_VH = 55; // scroll distance per project

function frameFor(item, vw, vh) {
  if (vw < 760) {
    const maxW = vw - 32;
    const maxH = vh * 0.44;
    let w = maxW;
    let h = w / item.aspect;
    if (h > maxH) {
      h = maxH;
      w = h * item.aspect;
    }
    return { x: (vw - w) / 2, y: 104, w, h };
  }
  const maxH = vh * 0.56;
  const maxW = vw * 0.46;
  let h = maxH;
  let w = h * item.aspect;
  if (w > maxW) {
    w = maxW;
    h = w / item.aspect;
  }
  return { x: (vw - w) / 2, y: vh * 0.54 - h / 2, w, h };
}

/** Rulers along the top and left edge that measure the frame and follow the cursor. */
function useRulers(canvasRef, stageRef, frameRef) {
  const settings = useSettings();
  const live = useRef(settings);
  live.current = settings;
  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const ctx = canvas.getContext("2d");
    const mouse = { x: -1, y: -1 };
    let unsub = null;
    let moodSeen = null;
    let fg = [245, 245, 240];
    const move = (e) => {
      const r = stage.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const leave = () => (mouse.x = mouse.y = -1);
    const draw = () => {
      const { mood } = live.current;
      if (mood !== moodSeen) {
        moodSeen = mood;
        fg = themeColors().fg;
      }
      const W = stage.clientWidth;
      const H = stage.clientHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const c = (a) => `rgba(${fg[0]},${fg[1]},${fg[2]},${a})`;
      const R = 22;
      const small = W < 760;
      ctx.font = `500 8px ${MONO}`;
      ctx.textBaseline = "top";
      // top ruler
      ctx.fillStyle = c(0.35);
      for (let x = R; x < W; x += 10) {
        const major = x % 120 === 0;
        const mid = x % 40 === 0;
        ctx.fillRect(x, 0, 1, major ? 9 : mid ? 6 : 3);
        if (major && !small) ctx.fillText(String(x), x + 3, 9);
      }
      ctx.fillRect(R, R - 1, W - R, 1);
      // left ruler
      for (let y = R; y < H; y += 10) {
        const major = y % 120 === 0;
        const mid = y % 40 === 0;
        ctx.fillRect(0, y, major ? 9 : mid ? 6 : 3, 1);
        if (major && !small) ctx.fillText(String(y), 2, y + 3);
      }
      ctx.fillRect(R - 1, R, 1, H - R);
      // frame edges measured on the rulers
      const f = frameRef.current;
      if (f) {
        ctx.fillStyle = "rgba(252,190,120,0.95)";
        [f.x, f.x + f.w].forEach((x) => ctx.fillRect(Math.round(x), 0, 1, R));
        [f.y, f.y + f.h].forEach((y) => ctx.fillRect(0, Math.round(y), R, 1));
        if (!small) {
          ctx.fillText(`${Math.round(f.w)}`, f.x + f.w / 2 - 8, 12);
          ctx.save();
          ctx.translate(12, f.y + f.h / 2 + 8);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(`${Math.round(f.h)}`, 0, 0);
          ctx.restore();
        }
      }
      // cursor readout
      if (mouse.x > R && mouse.y > R) {
        ctx.fillStyle = c(0.95);
        ctx.fillRect(Math.round(mouse.x), 0, 1, R);
        ctx.fillRect(0, Math.round(mouse.y), R, 1);
        ctx.fillStyle = c(1);
        ctx.fillRect(mouse.x + 3, 1, 24, 10);
        ctx.fillRect(1, mouse.y + 3, 20, 10);
        ctx.fillStyle = `rgb(${themeColors().bg.join(",")})`;
        ctx.fillText(String(Math.round(mouse.x)), mouse.x + 5, 2);
        ctx.fillText(String(Math.round(mouse.y)), 2, mouse.y + 4);
      }
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !unsub) unsub = subscribe(draw);
      else if (!e.isIntersecting && unsub) {
        unsub();
        unsub = null;
      }
    });
    io.observe(stage);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerleave", leave);
    return () => {
      unsub?.();
      io.disconnect();
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerleave", leave);
    };
  }, [canvasRef, stageRef, frameRef]);
}

export default function Viewfinder() {
  const sectionRef = useRef(null);
  const stageRef = useRef(null);
  const rulerRef = useRef(null);
  const frameRef = useRef(null);
  const [filter, setFilter] = useState("index");
  const [active, setActive] = useState(0);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [sound, setSoundOn] = useState(false);
  const [mounted, setMounted] = useState(() => new Set([ALL[0].code]));
  const [activations, setActivations] = useState(0);
  const { img, setImg } = useSettings();

  const items = useMemo(() => ALL.filter(FILTERS.find((f) => f[0] === filter)[2]), [filter]);
  const N = items.length;
  const idx = Math.min(active, N - 1);
  const item = items[idx];
  const frame = frameFor(item, vp.w, vp.h);
  frameRef.current = frame;
  useRulers(rulerRef, stageRef, frameRef);

  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  useEffect(() => {
    const onScroll = () => {
      const el = sectionRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, span)));
      const i = Math.round(p * (N - 1));
      setActive((a) => (a === i ? a : i));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [N]);

  useEffect(() => {
    tick();
    setActivations((n) => n + 1);
    setMounted((m) => (m.has(item.code) ? m : new Set(m).add(item.code)));
  }, [item.code]);

  const goTo = useCallback(
    (i, smooth = true) => {
      const el = sectionRef.current;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const span = el.offsetHeight - window.innerHeight;
      window.scrollTo({ top: top + (N > 1 ? i / (N - 1) : 0) * span + 1, behavior: smooth ? "smooth" : "auto" });
    },
    [N]
  );

  const choose = useCallback((f, smooth = false) => {
    setFilter(f);
    setActive(0);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = sectionRef.current;
      const top = el.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: top + 1, behavior: smooth ? "smooth" : "auto" });
    }));
  }, []);

  // nav links: Work = real projects, Concepts = imagined ones
  useEffect(() => {
    const onClick = (e) => {
      const a = e.target.closest?.('a[href="#work"], a[href="#concepts"]');
      if (!a) return;
      e.preventDefault();
      choose(a.getAttribute("href") === "#concepts" ? "concepts" : "selected", true);
    };
    document.addEventListener("click", onClick);
    if (location.hash === "#concepts") choose("concepts");
    return () => document.removeEventListener("click", onClick);
  }, [choose]);

  useEffect(() => {
    const onKey = (e) => {
      const r = sectionRef.current.getBoundingClientRect();
      if (r.top > 1 || r.bottom < window.innerHeight - 1) return;
      if (e.target.closest?.("input, textarea")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        goTo(Math.min(N - 1, idx + 1));
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(Math.max(0, idx - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, idx, N]);

  const toggleSound = () => setSoundOn(setSound(!sound));
  const mobile = vp.w < 760;
  const label = `[ ${item.kind === "work" ? "WORK" : "CONCEPT"} ${pad(item.n)} ]`;
  const fname = FILTERS.find((f) => f[0] === filter)[1].toUpperCase();

  return (
    <section id="work" ref={sectionRef} className="vf" style={{ height: `calc(100vh + ${(N - 1) * STEP_VH}vh)` }} aria-label="Projects">
      <div className="vf-stage" ref={stageRef}>
        <canvas ref={rulerRef} className="vf-rulers" aria-hidden="true" />
        <div className="vf-guide v" style={{ left: frame.x }} />
        <div className="vf-guide v" style={{ left: frame.x + frame.w }} />
        <div className="vf-guide h" style={{ top: frame.y }} />
        <div className="vf-guide h" style={{ top: frame.y + frame.h }} />
        <div className="vf-guide v center" style={{ left: vp.w / 2 }} />

        {ALL.filter((it) => mounted.has(it.code)).map((it) => {
          const f = frameFor(it, vp.w, vp.h);
          const on = it.code === item.code;
          return (
            <AsciiPlate
              key={it.code}
              sketch={it.sketch}
              seed={ALL.indexOf(it) + 1}
              label={it.alt}
              paused={!on}
              band={false}
              revealKey={on ? activations : -1}
              className={`vf-plate ${on ? "on" : ""}`}
              style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
            />
          );
        })}

        <div className="vf-frame" style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h }} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </div>

        {!mobile && (
          <ol className="vf-list">
            {items.map((it, i) => {
              if (i === idx) return null;
              const d = Math.abs(i - idx);
              const y = i < idx ? frame.y - 36 - (idx - 1 - i) * 24 : frame.y + frame.h + 14 + (i - idx - 1) * 24;
              const clear = y > 64 && y < vp.h - 84;
              return (
                <li key={it.code} style={{ top: y, opacity: clear ? Math.max(0.16, 1 - d * 0.16) : 0 }}>
                  <button type="button" onClick={() => goTo(i)} onMouseEnter={hoverBlip} data-scramble-host="">
                    <Scramble text={it.title.toUpperCase()} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div
          className="vf-info"
          aria-live="polite"
          style={
            mobile
              ? { top: frame.y + frame.h + 16 }
              : { right: vp.w - frame.x + 22, top: frame.y - 4, width: Math.max(220, Math.min(380, frame.x - 22 - 64)) }
          }
        >
          <div className="muted vf-code">
            <Scramble key={label} text={label} trigger="change" />
          </div>
          <h3 className="vf-title">
            <Scramble key={item.code} text={item.title.toUpperCase()} trigger="change" duration={520} />
          </h3>
          <div className="muted vf-tags">{item.tags}</div>
          <p className="vf-body" key={`b-${item.code}`}>
            {item.body}
          </p>
          <div className="vf-actions">
            {item.kind === "concept" && <span className="badge">Concept study</span>}
            {item.link && (
              <a className="card-link" href={item.link[1]} {...ext}>
                {item.link[0]} ↗
              </a>
            )}
          </div>
        </div>

        {!mobile && (
          <div className="vf-hint" style={{ left: frame.x + frame.w + 22, top: frame.y + frame.h / 2 - 6 }}>
            SCROLL / ↑↓ TO BROWSE
          </div>
        )}

        <div className="vf-tabs">
          <div className="vf-filter" role="tablist" aria-label="Filter projects">
            {FILTERS.map(([key, name, fn], i) => (
              <span key={key}>
                {i > 0 && <span className="muted"> / </span>}
                <button type="button" role="tab" aria-selected={filter === key} className={filter === key ? "on" : ""} onClick={() => choose(key)}>
                  {name.toUpperCase()} {pad(ALL.filter(fn).length)}
                </button>
              </span>
            ))}
          </div>
          <div className="vf-count">
            {pad(idx + 1)} — {pad(N)} {fname}
          </div>
          <button type="button" className="vf-sound" onClick={toggleSound} aria-pressed={sound}>
            SOUND — {sound ? "ON" : "OFF"}
          </button>
        </div>

        {!mobile && (
          <>
            <a className="vf-side left" href="#about">
              ‹ ABOUT
            </a>
            <a className="vf-side right" href="#contact">
              CONTACT ›
            </a>
          </>
        )}

        <div className="vf-foot">
          <div className="vf-render">
            <span className="muted">RENDER — </span>
            {[
              ["image", "IMAGE"],
              ["text", "TEXT"],
              ["pixel", "PIXEL"],
            ].map(([v, t]) => (
              <button key={v} type="button" className={img === v ? "on" : ""} onClick={() => setImg(v)} aria-pressed={img === v}>
                {t}
              </button>
            ))}
          </div>
          <div className="vf-ticks" aria-hidden="true">
            {items.map((it, i) => (
              <button key={it.code} type="button" tabIndex={-1} className={i === idx ? "on" : ""} onClick={() => goTo(i)} />
            ))}
          </div>
          <div className="vf-note muted">
            {item.kind === "concept" ? "CONCEPT — AN IMAGINED SYSTEM, BUILT ON REAL METHODS" : "LIVE PLATE — GENERATED FROM CODE, NOT A SCREENSHOT"}
          </div>
        </div>
      </div>
    </section>
  );
}
