import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { subscribe } from "../lib/ticker.js";
import { clamp, rng, smooth } from "../lib/math.js";
import { useInView } from "./Reveal.jsx";
import { CHAPTERS, FACTS } from "../content.js";

const NAME = "DARIAN LALLA";
const HEX = [...NAME].map((c) => c.charCodeAt(0).toString(16).toUpperCase()).join(" ");
const STYLES = ["Encoded", ...CHAPTERS.map((c) => c.style)];

/**
 * One continuous line from the top of the section to the quote. Its character changes
 * per chapter: the name as a waveform, an organic meander, a quantised step signal,
 * then generative loops. Returns the SVG path plus a y→length table for scroll drawing.
 */
function buildSignal(W, x0, bounds, small) {
  const pts = [];
  const push = (x, y) => pts.push([x, y]);
  const env = (t) => smooth(clamp(t / 0.12)) * smooth(clamp((1 - t) / 0.12));
  const k = small ? 0.45 : 1;
  const r = rng(31);
  const [b0, b1, b2, b3, b4, b5] = bounds;

  // 00 encoded: the name's character codes as amplitudes of a fast waveform
  for (let y = b0; y <= b1; y += 2) {
    const t = (y - b0) / Math.max(1, b1 - b0);
    const ch = NAME.charCodeAt(Math.min(NAME.length - 1, Math.floor(t * NAME.length)));
    const a = ch === 32 ? 4 : ((ch - 64) / 26) * 46 + 8;
    push(x0 + env(t) * a * k * Math.sin((y - b0) * 0.34), y);
  }
  // 01 organic: a slow river-like meander
  for (let y = b1; y <= b2; y += 4) {
    const t = (y - b1) / Math.max(1, b2 - b1);
    push(x0 + env(t) * k * (40 * Math.sin(y * 0.009 + 1) + 18 * Math.sin(y * 0.024)), y);
  }
  // 02 quantised: a stepped digital signal
  let lastX = x0;
  for (let y = b2; y < b3; y += 30) {
    const t = (y - b2) / Math.max(1, b3 - b2);
    const level = Math.round((r() - 0.5) * 4.4);
    const x = x0 + env(t) * level * 22 * k;
    push(lastX, y);
    push(x, y);
    lastX = x;
  }
  push(lastX, b3);
  push(x0, b3);
  // 03 generative: prolate-cycloid loops
  const loops = Math.max(3, Math.round((b4 - b3) / 70));
  const R = 32 * k + 6;
  for (let th = 0; th <= loops * Math.PI * 2; th += 0.12) {
    const t = th / (loops * Math.PI * 2);
    const e = env(t);
    push(x0 + e * R * Math.sin(th), b3 + t * (b4 - b3) + e * R * 0.85 * (1 - Math.cos(th)));
  }
  // tail into the quote: a decaying wave that settles to calm
  for (let y = b4; y <= b5; y += 3) {
    const t = (y - b4) / Math.max(1, b5 - b4);
    push(x0 + 18 * k * (1 - t) * smooth(clamp(t / 0.08)) * Math.sin((y - b4) * 0.11), y);
  }

  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  // cumulative length against a running-max y, so scroll depth maps to drawn length
  const ys = [];
  const cum = [];
  let L = 0;
  let maxY = -1e9;
  pts.forEach(([x, y], i) => {
    if (i) L += Math.hypot(x - pts[i - 1][0], y - pts[i - 1][1]);
    maxY = Math.max(maxY, y);
    ys.push(maxY);
    cum.push(L);
  });
  return { d, ys, cum, total: L };
}

function lengthAtY(sig, y) {
  const { ys, cum } = sig;
  let lo = 0;
  let hi = ys.length - 1;
  if (y <= ys[0]) return 0;
  if (y >= ys[hi]) return cum[hi];
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ys[mid] <= y) lo = mid;
    else hi = mid;
  }
  return cum[lo];
}

function Barcode({ text }) {
  const bars = [...text].flatMap((c) =>
    c.charCodeAt(0)
      .toString(2)
      .padStart(8, "0")
      .split("")
      .map((b) => b === "1")
  );
  return (
    <div className="barcode" aria-hidden="true">
      {bars.map((wide, i) => (
        <i key={i} style={{ width: wide ? 3 : 1 }} />
      ))}
    </div>
  );
}

function Chapter({ ch, refFn }) {
  const ref = useInView(0.35);
  return (
    <article
      className="chapter"
      ref={(el) => {
        ref.current = el;
        refFn(el);
      }}
    >
      <div className="chapter-head">
        <span className="chapter-code">{ch.code}</span>
        <span>{ch.label}</span>
        <span className="muted">↳ {ch.style} signal</span>
      </div>
      <div className="chapter-word" aria-hidden="true" data-text={ch.word}>
        {ch.word}
      </div>
      <p className="chapter-text">{ch.text}</p>
    </article>
  );
}

export default function AboutSignal() {
  const wrapRef = useRef(null);
  const svgPathRef = useRef(null);
  const glowRef = useRef(null);
  const headRef = useRef(null);
  const nodeRefs = useRef([]);
  const blockRefs = useRef([]);
  const quoteRef = useRef(null);
  const [geo, setGeo] = useState(null);
  const specRef = useInView(0.3);
  const quoteIn = useInView(0.4);

  // measure the blocks, then lay the signal through them
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const measure = () => {
      const W = wrap.clientWidth;
      const H = wrap.scrollHeight;
      const small = W < 760;
      const x0 = small ? 20 : Math.round(W * 0.2);
      const node = (el) => (el ? el.offsetTop + 22 : 0);
      const nodes = blockRefs.current.map(node);
      const endY = quoteRef.current ? quoteRef.current.offsetTop + 30 : H - 40;
      const bounds = [nodes[0], nodes[1], nodes[2], nodes[3], nodes[4], endY];
      const sig = buildSignal(W, x0, bounds, small);
      const fr = nodes.map((y) => lengthAtY(sig, y) / sig.total);
      setGeo({ W, H, x0, nodes, endY, sig, fr, small, bounds });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // draw the line down to ~62% of the viewport, smoothly
  useEffect(() => {
    if (!geo) return;
    let shown = null;
    const path = svgPathRef.current;
    return subscribe((_, dt) => {
      const r = wrapRef.current.getBoundingClientRect();
      if (r.bottom < -200 || r.top > window.innerHeight + 200) return;
      const still = document.documentElement.dataset.motion === "off";
      const target = still ? geo.sig.total : lengthAtY(geo.sig, window.innerHeight * 0.62 - r.top);
      shown = shown == null ? target : shown + (target - shown) * Math.min(1, dt * 6);
      const off = Math.max(0, geo.sig.total - shown);
      path.style.strokeDashoffset = off;
      glowRef.current.style.strokeDashoffset = off;
      const p = path.getPointAtLength(Math.max(0, shown));
      headRef.current.setAttribute("transform", `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      headRef.current.style.opacity = shown > 4 && shown < geo.sig.total - 2 ? 1 : 0;
      const f = shown / geo.sig.total;
      nodeRefs.current.forEach((n, i) => n && n.classList.toggle("on", f >= geo.fr[i] - 0.002));
    });
  }, [geo]);

  const setBlock = (i) => (el) => (blockRefs.current[i] = el);

  return (
    <div className="about-signal" ref={wrapRef}>
      {geo && (
        <svg className="signal-svg" width={geo.W} height={geo.H} aria-hidden="true">
          <defs>
            <linearGradient id="sig-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={geo.endY}>
              <stop offset="0" stopColor="#e6fffb" />
              <stop offset="0.22" stopColor="#23b5c4" />
              <stop offset="0.5" stopColor="#4675ed" />
              <stop offset="0.78" stopColor="#b5367a" />
              <stop offset="1" stopColor="#fb8761" />
            </linearGradient>
          </defs>
          {/* depth scale, like a strip chart */}
          {Array.from({ length: Math.floor(geo.H / 40) }, (_, i) => (
            <g key={i} className="sig-tick">
              <line x1="0" x2={i % 5 ? 4 : 9} y1={i * 40 + 0.5} y2={i * 40 + 0.5} />
              {!geo.small && i % 5 === 0 && (
                <text x="12" y={i * 40 + 3}>
                  {String(i * 40).padStart(4, "0")}
                </text>
              )}
            </g>
          ))}
          <line className="sig-axis" x1={geo.x0} x2={geo.x0} y1="0" y2={geo.endY} />
          {!geo.small &&
            STYLES.map((s, i) => (
              <text key={s} className="sig-seg" x={geo.x0 - 172} y={(geo.bounds[i] + geo.bounds[i + 1]) / 2}>
                {String(i).padStart(2, "0")} {s.toUpperCase()}
              </text>
            ))}
          <path ref={glowRef} className="sig-glow" d={geo.sig.d} style={{ strokeDasharray: geo.sig.total, strokeDashoffset: geo.sig.total }} />
          <path ref={svgPathRef} className="sig-line" d={geo.sig.d} style={{ strokeDasharray: geo.sig.total, strokeDashoffset: geo.sig.total }} />
          {geo.nodes.map((y, i) => (
            <g key={i} className="sig-node" ref={(el) => (nodeRefs.current[i] = el)}>
              <line className="sig-lead" x1={geo.x0 + 10} x2={geo.small ? geo.x0 + 22 : geo.W * 0.3 - 14} y1={y} y2={y} />
              <circle className="sig-halo" cx={geo.x0} cy={y} r="11" />
              <circle className="sig-dot" cx={geo.x0} cy={y} r="4" />
            </g>
          ))}
          <circle className="sig-end" cx={geo.x0} cy={geo.endY} r="3" />
          <g ref={headRef} className="sig-head">
            <circle r="10" className="sig-head-halo" />
            <circle r="3.2" />
          </g>
        </svg>
      )}

      <div className="signal-intro" ref={setBlock(0)}>
        <div className="chapter-head">
          <span className="chapter-code">00</span>
          <span>Signal</span>
          <span className="muted">↳ encoded</span>
        </div>
        <p className="signal-lede">
          This is where a photo would go. Instead, a single line: my path from where I started to where I&apos;m going,
          drawn as you scroll.
        </p>
        <div className="signal-hex muted">
          {NAME} → {HEX}
        </div>
      </div>

      {CHAPTERS.map((ch, i) => (
        <Chapter key={ch.code} ch={ch} refFn={setBlock(i + 1)} />
      ))}

      <div
        className="specimen-wrap"
        ref={(el) => {
          specRef.current = el;
          blockRefs.current[4] = el;
        }}
      >
        <div className="specimen">
          <div className="specimen-head">
            <span>FIG.08 — Specimen</span>
            <span className="muted">Homo datarius</span>
          </div>
          <dl>
            {FACTS.map(([k, v], i) => (
              <div key={k} style={{ "--d": `${0.15 + i * 0.08}s` }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <Barcode text={NAME} />
          <div className="specimen-foot muted">{HEX}</div>
        </div>
      </div>

      <blockquote
        className="signal-quote"
        ref={(el) => {
          quoteRef.current = el;
          quoteIn.current = el;
        }}
      >
        <p>
          “Without <span className="q-data">data</span>, you&apos;re just another person with an opinion.”
        </p>
        <cite>— W. Edwards Deming</cite>
      </blockquote>
    </div>
  );
}
