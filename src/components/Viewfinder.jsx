import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
const STEP_VH = 70; // scroll distance per project
const BOXW = 232;
const BOXH = 80;

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
  const maxH = Math.min(vh * 0.72, vh - 196);
  const maxW = vw * 0.64;
  let h = maxH;
  let w = h * item.aspect;
  if (w > maxW) {
    w = maxW;
    h = w / item.aspect;
  }
  return { x: (vw - w) / 2, y: vh * 0.53 - h / 2, w, h };
}

/** Title card: beside the frame when there's room, otherwise a glass card over its edge. */
function infoLayout(frame, vw) {
  const room = frame.x - 22 - 44;
  if (room >= 280) return { glass: false, right: vw - frame.x + 22, top: frame.y - 4, width: Math.min(380, room) };
  return { glass: true, left: 44, top: frame.y + 18, width: 300 };
}

/** Callout boxes beside the frame, stacked without overlap, joined to the plate by elbow leaders. */
function layoutNotes(item, frame, vw, vh, infoBottom, allRight) {
  const out = [];
  for (const side of ["l", "r"]) {
    const room = side === "r" ? vw - 44 - (frame.x + frame.w) : frame.x - 44;
    const outside = room >= BOXW + 60;
    const bx = side === "r" ? (outside ? frame.x + frame.w + 46 : vw - 44 - BOXW) : outside ? frame.x - 46 - BOXW : 44;
    const minY = side === "l" ? Math.max(104, infoBottom + 26) : 104;
    const list = item.notes
      .map((n, i) => ({ ...n, i, ax: frame.x + n.at[0] * frame.w, ay: frame.y + n.at[1] * frame.h }))
      .filter((n) => (allRight ? "r" : n.side) === side)
      .sort((a, b) => a.ay - b.ay);
    let last = -1e9;
    for (const n of list) {
      n.by = Math.max(n.ay - 24, minY, last + BOXH + 14);
      last = n.by;
    }
    const over = last + BOXH - (vh - 92);
    if (over > 0) for (const n of list) n.by = Math.max(minY, n.by - over);
    for (const n of list) {
      n.bx = bx;
      const attachX = side === "r" ? bx : bx + BOXW;
      const attachY = n.by + 15;
      const ex = side === "r" ? frame.x + frame.w + 16 : frame.x - 16;
      const pts = outside
        ? [
            [n.ax, n.ay],
            [ex, n.ay],
            [attachX + (side === "r" ? -12 : 12), attachY],
            [attachX, attachY],
          ]
        : [
            [n.ax, n.ay],
            [n.ax + (attachX - n.ax) * 0.55, n.ay],
            [attachX, attachY],
          ];
      n.d = pts.map(([x, y], k) => `${k ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
      n.len = Math.ceil(pts.slice(1).reduce((a, [x, y], k) => a + Math.hypot(x - pts[k][0], y - pts[k][1]), 0));
      out.push(n);
    }
  }
  return out.sort((a, b) => a.i - b.i);
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
    let bg = [22, 22, 22];
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
        ({ fg, bg } = themeColors());
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
      ctx.fillStyle = c(0.35);
      for (let x = R; x < W; x += 10) {
        const major = x % 120 === 0;
        const mid = x % 40 === 0;
        ctx.fillRect(x, 0, 1, major ? 9 : mid ? 6 : 3);
        if (major && !small) ctx.fillText(String(x), x + 3, 9);
      }
      ctx.fillRect(R, R - 1, W - R, 1);
      for (let y = R; y < H; y += 10) {
        const major = y % 120 === 0;
        const mid = y % 40 === 0;
        ctx.fillRect(0, y, major ? 9 : mid ? 6 : 3, 1);
        if (major && !small) ctx.fillText(String(y), 2, y + 3);
      }
      ctx.fillRect(R - 1, R, 1, H - R);
      // frame edges measured on the rulers (follows the scroll zoom)
      const f = frameRef.current?.scaled || frameRef.current;
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
      if (mouse.x > R && mouse.y > R) {
        ctx.fillStyle = c(0.95);
        ctx.fillRect(Math.round(mouse.x), 0, 1, R);
        ctx.fillRect(0, Math.round(mouse.y), R, 1);
        ctx.fillStyle = c(1);
        ctx.fillRect(mouse.x + 3, 1, 24, 10);
        ctx.fillRect(1, mouse.y + 3, 20, 10);
        ctx.fillStyle = `rgb(${bg.join(",")})`;
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
  const focusRef = useRef(null);
  const infoRef = useRef(null);
  const [filter, setFilter] = useState("index");
  const [active, setActive] = useState(0);
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const [sound, setSoundOn] = useState(false);
  const [mounted, setMounted] = useState(() => new Set([ALL[0].code]));
  const [activations, setActivations] = useState(0);
  const [infoBottom, setInfoBottom] = useState(0);
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

  // scroll-linked zoom: a project grows as you scroll into it and eases back as you leave
  useEffect(() => {
    let spos = null;
    return subscribe((_, dt) => {
      const el = sectionRef.current;
      const f = focusRef.current;
      const fr = frameRef.current;
      if (!el || !f || !fr) return;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      const span = Math.max(1, r.height - window.innerHeight);
      const pos = Math.min(1, Math.max(0, -r.top / span)) * (N - 1);
      spos = spos == null ? pos : spos + (pos - spos) * Math.min(1, dt * 9);
      const lp = spos - Math.round(spos);
      const still = document.documentElement.dataset.motion === "off";
      const k = still ? 1 : 1 - 0.12 * Math.pow(Math.min(1, Math.abs(lp) * 2), 1.6);
      const cx = fr.x + fr.w / 2;
      const cy = fr.y + fr.h / 2;
      f.style.transformOrigin = `${cx}px ${cy}px`;
      f.style.transform = `scale(${k.toFixed(4)})`;
      fr.scaled = { x: cx + (fr.x - cx) * k, y: cy + (fr.y - cy) * k, w: fr.w * k, h: fr.h * k };
    });
  }, [N]);

  // measure the title card after every render so left callouts always clear it
  useLayoutEffect(() => {
    const el = infoRef.current;
    if (!el) return;
    const b = el.offsetTop + el.offsetHeight;
    if (Math.abs(b - infoBottom) > 1) setInfoBottom(b);
  });

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
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = sectionRef.current;
        const top = el.getBoundingClientRect().top + window.scrollY;
        window.scrollTo({ top: top + 1, behavior: smooth ? "smooth" : "auto" });
      })
    );
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
  const info = infoLayout(frame, vp.w);
  const notes = mobile ? [] : layoutNotes(item, frame, vp.w, vp.h, infoBottom || frame.y + 300, info.glass);

  return (
    <section id="work" ref={sectionRef} className="vf" style={{ height: `calc(100vh + ${(N - 1) * STEP_VH}vh)` }} aria-label="Projects">
      <div className="vf-stage" ref={stageRef}>
        <canvas ref={rulerRef} className="vf-rulers" aria-hidden="true" />

        <div className="vf-focus" ref={focusRef}>
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
            <span className="vf-dim">
              {Math.round(frame.w)} × {Math.round(frame.h)}
            </span>
          </div>

          {/* annotations, re-keyed per project so every line draws in fresh */}
          <div className="vf-annot" key={`${item.code}-${vp.w}-${vp.h}`}>
            {mobile ? (
              item.notes.map((n, i) => (
                <span key={i} className="vf-pin" style={{ left: frame.x + n.at[0] * frame.w, top: frame.y + n.at[1] * frame.h, "--d": `${0.3 + i * 0.1}s` }}>
                  {i + 1}
                </span>
              ))
            ) : (
              <>
                <svg className="vf-leaders" width={vp.w} height={vp.h} aria-hidden="true">
                  {notes.map((n, k) => (
                    <g key={n.i} style={{ "--d": `${0.35 + k * 0.13}s`, "--len": n.len }}>
                      <path className="lead" d={n.d} />
                      <circle className="ring" cx={n.ax} cy={n.ay} r="9" />
                      <circle className="dot" cx={n.ax} cy={n.ay} r="3" />
                    </g>
                  ))}
                </svg>
                {notes.map((n, k) => (
                  <div key={n.i} className="vf-note" style={{ left: n.bx, top: n.by, width: BOXW, "--d": `${0.55 + k * 0.13}s` }}>
                    <div className="vf-note-head">
                      <span>{pad(n.i + 1)}</span>
                      <span>{n.title}</span>
                    </div>
                    <p>{n.text}</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {!mobile && (
          <ol className="vf-list">
            {items.map((it, i) => {
              const d = Math.abs(i - idx);
              if (i === idx || d > 2) return null;
              const y = i < idx ? frame.y - 34 - (idx - 1 - i) * 22 : frame.y + frame.h + 14 + (i - idx - 1) * 22;
              const clear = y > 64 && y < vp.h - 84;
              return (
                <li key={it.code} style={{ top: y, opacity: clear ? (d === 1 ? 0.85 : 0.35) : 0 }}>
                  <button type="button" onClick={() => goTo(i)} onMouseEnter={hoverBlip} data-scramble-host="">
                    <span className="muted">{i < idx ? "↑ " : "↓ "}</span>
                    <Scramble text={it.title.toUpperCase()} />
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <div
          ref={infoRef}
          className={`vf-info ${info.glass && !mobile ? "glass" : ""}`}
          aria-live="polite"
          style={
            mobile
              ? { top: frame.y + frame.h + 16 }
              : info.glass
                ? { left: info.left, top: info.top, width: info.width }
                : { right: info.right, top: info.top, width: info.width }
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
          {mobile ? (
            <ol className="vf-notes-m" key={`m-${item.code}`}>
              {item.notes.map((n, i) => (
                <li key={i}>
                  <span className="vf-pin-n">{i + 1}</span> {n.title}: <span className="muted">{n.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <dl className="vf-spec" key={`s-${item.code}`}>
              {item.spec.map(([k, v], i) => (
                <div key={k} style={{ "--d": `${0.25 + i * 0.09}s` }}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="vf-actions">
            {item.kind === "concept" && <span className="badge">Concept study</span>}
            {item.link && (
              <a className="card-link" href={item.link[1]} {...ext}>
                {item.link[0]} ↗
              </a>
            )}
          </div>
        </div>

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
          <div className="vf-note-foot muted">
            {item.kind === "concept" ? "CONCEPT — AN IMAGINED SYSTEM, BUILT ON REAL METHODS" : "LIVE PLATE — GENERATED FROM CODE, NOT A SCREENSHOT"}
          </div>
        </div>
      </div>
    </section>
  );
}
