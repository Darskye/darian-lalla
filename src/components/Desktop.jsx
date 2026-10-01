import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { subscribe } from "../lib/ticker.js";
import { SensorField } from "../lib/sensorField.js";
import { MONO } from "../lib/glyphs.js";
import { BUDDY, NOTES, PAPER } from "../content.js";

const ext = { target: "_blank", rel: "noreferrer" };
const motionOff = () => document.documentElement.dataset.motion === "off";

const WINDOWS = [
  { id: "viewport", title: "sensor_field.gl", task: "Viewport" },
  { id: "paper", title: "P01 — cognitive_sensing.pdf", task: "Paper" },
  { id: "notes", title: "~/notes — zsh", task: "Notes" },
  { id: "buddy", title: "lab / claude-buddy", task: "Device" },
  { id: "monitor", title: "telemetry.app", task: "Monitor" },
];

function layoutFor(W) {
  const g = 22;
  const pw = Math.min(540, Math.max(400, W * 0.37));
  const vx = g + pw + 18;
  const bw = Math.min(470, (W - g - vx) * 0.56);
  return {
    viewport: { x: vx, y: 48, w: W - g - vx, h: 520, z: 1 },
    paper: { x: g, y: 48, w: pw, h: 506, z: 2 },
    notes: { x: g, y: 572, w: pw, h: 268, z: 3 },
    buddy: { x: vx, y: 586, w: bw, h: 254, z: 4 },
    monitor: { x: vx + bw + 18, y: 586, w: W - g - (vx + bw + 18), h: 254, z: 5 },
  };
}

/* ------------------------------------------------------------------ window */

function Win({ id, def, st, mobile, onFocus, onMove, onClose, onMin, meta, metaRef, children, index, bodyClass = "" }) {
  const ref = useRef(null);
  const drag = useRef(null);

  const down = (e) => {
    onFocus(id);
    if (mobile || e.target.closest("button, a")) return;
    const el = ref.current;
    drag.current = { px: e.clientX, py: e.clientY, x: st.x, y: st.y, W: el.parentElement.clientWidth, H: el.parentElement.clientHeight };
    e.currentTarget.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  };
  const move = (e) => {
    const d = drag.current;
    if (!d) return;
    const el = ref.current;
    const x = Math.min(d.W - 120, Math.max(-st.w + 160, d.x + e.clientX - d.px));
    const y = Math.min(d.H - 76, Math.max(30, d.y + e.clientY - d.py));
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    d.nx = x;
    d.ny = y;
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    ref.current?.classList.remove("dragging");
    if (d && d.nx != null) onMove(id, d.nx, d.ny);
  };

  if (!st.open) return null;
  const style = mobile ? { "--d": `${index * 0.08}s` } : { left: st.x, top: st.y, width: st.w, height: st.min ? "auto" : st.h, zIndex: st.z, "--d": `${0.1 + index * 0.12}s` };
  return (
    <section
      ref={ref}
      className={`win ${st.top ? "focus" : ""} ${st.min ? "min" : ""}`}
      style={style}
      onPointerDown={() => onFocus(id)}
      aria-label={def.title}
    >
      <header className="win-bar" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="win-btns">
          <button type="button" aria-label={`Close ${def.task}`} onClick={() => onClose(id)}>
            ×
          </button>
          <button type="button" aria-label={`Minimise ${def.task}`} onClick={() => onMin(id)}>
            –
          </button>
        </div>
        <span className="win-title">{def.title}</span>
        <span className="win-meta" ref={metaRef}>
          {meta}
        </span>
      </header>
      <div className={`win-body ${bodyClass}`}>{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ paper */

const NL = String.fromCharCode(10);

function Bib({ text }) {
  return (
    <pre className="bib">
      {text.split(NL).map((ln, i) => {
        const head = ln.match(/^(@\w+)(\{)(.*)$/);
        if (head)
          return (
            <span key={i}>
              <span className="b-type">{head[1]}</span>
              <span className="b-brace">{head[2]}</span>
              {head[3]}
              {NL}
            </span>
          );
        const kv = ln.match(/^(\s*)(\w+)(\s*=\s*)(.*)$/);
        if (kv)
          return (
            <span key={i}>
              {kv[1]}
              <span className="b-key">{kv[2]}</span>
              <span className="b-eq">{kv[3]}</span>
              <span className="b-val">{kv[4]}</span>
              {NL}
            </span>
          );
        return (
          <span key={i} className={ln.trim() === "}" ? "b-brace" : "b-val"}>
            {ln}
            {NL}
          </span>
        );
      })}
    </pre>
  );
}

function PaperBody() {
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PAPER.bibtex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <>
      <div className="tabs" role="tablist">
        {[
          ["overview", "Overview"],
          ["cite", "Cite"],
          ["links", "Links"],
        ].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
        <span className="tabs-fill" />
        <span className="muted">{PAPER.code}</span>
      </div>
      <div className="tab-pane" key={tab}>
        {tab === "overview" && (
          <>
            <span className="badge">{PAPER.kind}</span>
            <h3 className="paper-h">{PAPER.title}</h3>
            <p className="paper-authors">
              {PAPER.authors.map((a, i) => (
                <span key={a}>
                  {i > 0 && ", "}
                  <span className={a.startsWith("Darian") ? "me" : ""}>{a}</span>
                </span>
              ))}
            </p>
            <dl className="paper-meta">
              {PAPER.meta.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        {tab === "cite" && (
          <>
            <div className="cite-head">
              <span className="muted">BibTeX</span>
              <button type="button" className="pill" onClick={copy}>
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <Bib text={PAPER.bibtex} />
          </>
        )}
        {tab === "links" && (
          <div className="link-rows">
            {PAPER.links.map(([t, h]) => (
              <a key={h} href={h} {...ext}>
                <span>{t}</span>
                <span className="muted">{h.replace(/^https?:\/\//, "")}</span>
                <span>↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ 3D viewport */

function Range({ label, min, max, step, value, onChange, fmt = (v) => v }) {
  return (
    <label className="gui-row">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <output>{fmt(value)}</output>
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="gui-row">
      <span>{label}</span>
      <button type="button" className={`tgl ${value ? "on" : ""}`} aria-pressed={value} onClick={() => onChange(!value)}>
        <i />
      </button>
      <output>{value ? "ON" : "OFF"}</output>
    </label>
  );
}

function ViewportBody({ active, metaRef, telemetry }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const readRef = useRef(null);
  const fieldRef = useRef(null);
  const [failed, setFailed] = useState(false);
  const [gui, setGui] = useState(() => window.innerWidth >= 760);
  const [p, setP] = useState({ mode: "environment", nodes: 180, radius: 1.25, rate: 26, cognitive: true, rotate: true });
  const set = (k) => (v) => setP((o) => ({ ...o, [k]: v }));
  const activeRef = useRef(active);
  activeRef.current = active;

  useEffect(() => {
    fieldRef.current?.set(p);
  }, [p]);

  useEffect(() => {
    let field;
    try {
      field = new SensorField(canvasRef.current);
    } catch {
      setFailed(true);
      return;
    }
    fieldRef.current = field;
    field.set(p);
    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      field.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2));
    });
    ro.observe(wrap);

    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "100px" });
    io.observe(wrap);
    let acc = 0;
    let tAcc = 0;
    let frames = 0;
    let fpsT = 0;
    const unsub = subscribe((_, dt) => {
      if (!visible || !activeRef.current) return;
      const still = motionOff();
      const stats = field.frame(still ? 0 : dt);
      frames++;
      fpsT += dt;
      acc += dt;
      tAcc += dt;
      if (tAcc > 0.2) {
        tAcc = 0;
        const tl = telemetry.current;
        tl.push({ tp: stats.throughput, cov: stats.coverage, pdr: stats.pdr, hops: stats.hops, nodes: stats.nodes });
        if (tl.length > 150) tl.shift();
      }
      if (acc > 0.15 && readRef.current) {
        acc = 0;
        readRef.current.textContent = [
          `NODES      ${String(stats.nodes).padStart(5)}`,
          `LINKS      ${String(stats.links).padStart(5)}`,
          `COVERAGE   ${(stats.coverage * 100).toFixed(1).padStart(5)}%`,
          `AVG HOPS   ${stats.hops.toFixed(2).padStart(5)}`,
          `THROUGHPUT ${String(stats.throughput).padStart(5)} pkt/s`,
          `DELIVERY   ${(stats.pdr * 100).toFixed(1).padStart(5)}%`,
          `IN FLIGHT  ${String(stats.inflight).padStart(5)}`,
        ].join("\n");
      }
      if (fpsT > 0.5 && metaRef.current) {
        metaRef.current.textContent = `WEBGL2 · ${Math.round(frames / fpsT)} FPS`;
        frames = 0;
        fpsT = 0;
      }
    });
    const down = (e) => {
      if (e.target !== canvasRef.current) return;
      canvasRef.current.setPointerCapture(e.pointerId);
      field.pointerDown(e.clientX, e.clientY);
    };
    const mv = (e) => field.pointerMove(e.clientX, e.clientY);
    const upE = () => field.pointerUp();
    const c = canvasRef.current;
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", mv);
    c.addEventListener("pointerup", upE);
    c.addEventListener("pointercancel", upE);
    return () => {
      unsub();
      ro.disconnect();
      io.disconnect();
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", mv);
      c.removeEventListener("pointerup", upE);
      c.removeEventListener("pointercancel", upE);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="vp" ref={wrapRef}>
      <canvas ref={canvasRef} className="vp-canvas" aria-label="Interactive 3D sensor network: drag to orbit" />
      {failed && <div className="vp-fail">WebGL2 is unavailable in this browser.</div>}
      <div className="vp-hint">
        <span>Drag to orbit</span>
        <span className="vp-dim">Illustrative simulation, not results from the chapter</span>
      </div>
      <div className={`gui ${gui ? "" : "closed"}`}>
        <button type="button" className="gui-head" onClick={() => setGui((g) => !g)} aria-expanded={gui}>
          <span>Controls</span>
          <span>{gui ? "▾" : "▸"}</span>
        </button>
        {gui && (
          <div className="gui-body">
            <div className="gui-row">
              <span>Scenario</span>
              <div className="seg">
                {[
                  ["environment", "Env"],
                  ["healthcare", "Health"],
                ].map(([k, t]) => (
                  <button key={k} type="button" className={p.mode === k ? "on" : ""} aria-pressed={p.mode === k} onClick={() => set("mode")(k)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Range label="Sensors" min={40} max={320} step={10} value={p.nodes} onChange={set("nodes")} />
            <Range label="Radio range" min={0.7} max={1.8} step={0.05} value={p.radius} onChange={set("radius")} fmt={(v) => v.toFixed(2)} />
            <Range label="Packet rate" min={4} max={80} step={2} value={p.rate} onChange={set("rate")} fmt={(v) => `${v}/s`} />
            <Toggle label="Cognitive routing" value={p.cognitive} onChange={set("cognitive")} />
            <Toggle label="Auto-rotate" value={p.rotate} onChange={set("rotate")} />
          </div>
        )}
      </div>
      <pre className="readout" ref={readRef} aria-hidden="true" />
      <ul className="legend" aria-hidden="true">
        <li>
          <i style={{ background: p.mode === "environment" ? "#35b779" : "#e55064" }} /> Sensor
        </li>
        <li>
          <i style={{ background: "#fcbe78" }} /> Gateway
        </li>
        <li>
          <i style={{ background: "#fffae1" }} /> Packet
        </li>
        <li>
          <i style={{ background: "#ffaa3c" }} /> Adaptive link
        </li>
        <li>
          <i style={{ background: "#eb463c" }} /> Stranded
        </li>
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ notes terminal */

const PROMPT = "darian@research ~ %";

function NotesBody({ booted }) {
  const [lines, setLines] = useState([]);
  const [typing, setTyping] = useState(null);
  const queue = useRef([]);
  const scrollRef = useRef(null);

  const push = useCallback((items) => {
    queue.current.push(...items);
  }, []);

  useEffect(() => {
    if (!booted) return;
    push([
      { cmd: "ls -l notes/" },
      { out: `total ${NOTES.length}` },
      ...NOTES.map((n, i) => ({ file: i })),
      { cmd: "cat notes/README.md" },
      { out: "Three essays in progress, on data, compliance and AI." },
      { out: "Click a file to preview it.", dim: true },
    ]);
  }, [booted, push]);

  useEffect(() => {
    const id = setInterval(() => {
      if (typing) {
        if (typing.shown < typing.cmd.length) setTyping((t) => ({ ...t, shown: t.shown + 1 }));
        else {
          setLines((l) => [...l, { cmd: typing.cmd }]);
          setTyping(null);
        }
        return;
      }
      const next = queue.current.shift();
      if (!next) return;
      if (next.cmd && !motionOff()) setTyping({ cmd: next.cmd, shown: 0 });
      else setLines((l) => [...l, next]);
    }, 32);
    return () => clearInterval(id);
  }, [typing]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines, typing]);

  const open = (i) => {
    const n = NOTES[i];
    push([{ cmd: `head -n 2 notes/${n.file}` }, { out: `# ${n.title}`, strong: true }, { out: "status: drafting · publishing soon", dim: true }]);
  };

  return (
    <div className="term" ref={scrollRef}>
      {lines.map((l, i) =>
        l.cmd ? (
          <div key={i} className="t-line">
            <span className="t-prompt">{PROMPT}</span> {l.cmd}
          </div>
        ) : l.file != null ? (
          <button key={i} type="button" className="t-line t-file" onClick={() => open(l.file)}>
            <span className="muted">-rw-r--r--</span> <span className="t-tag">draft</span> <span className="t-name">{NOTES[l.file].file}</span>
          </button>
        ) : (
          <div key={i} className={`t-line ${l.dim ? "muted" : ""} ${l.strong ? "t-strong" : ""}`}>
            {l.out}
          </div>
        )
      )}
      <div className="t-line">
        <span className="t-prompt">{PROMPT}</span> {typing ? typing.cmd.slice(0, typing.shown) : ""}
        <span className="t-cursor" />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ device */

const STATES = [
  ["IDLE", [150, 150, 150], 3],
  ["THINKING", [252, 190, 120], 4],
  ["TOOL USE", [80, 220, 210], 3],
  ["DONE", [120, 220, 120], 2],
];

function BuddyBody({ active }) {
  const ref = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    c.width = 128;
    c.height = 128;
    let t = 0;
    let used = 0.18;
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    const cycle = STATES.reduce((a, s) => a + s[2], 0);
    const unsub = subscribe((_, dt) => {
      if (!visible || !activeRef.current) return;
      if (!motionOff()) t += dt;
      let k = t % cycle;
      let si = 0;
      while (k > STATES[si][2]) k -= STATES[si++][2];
      const [name, col] = STATES[si];
      if (si === 1 || si === 2) used = Math.min(0.97, used + dt * 0.03);
      if (t % (cycle * 3) < dt) used = 0.18;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, 128, 128);
      // usage ring
      ctx.lineWidth = 7;
      ctx.strokeStyle = "#1b1b1f";
      ctx.beginPath();
      ctx.arc(64, 58, 38, Math.PI * 0.75, Math.PI * 2.25);
      ctx.stroke();
      ctx.strokeStyle = `rgb(${col.join(",")})`;
      ctx.beginPath();
      ctx.arc(64, 58, 38, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * used));
      ctx.stroke();
      // ticks
      ctx.fillStyle = "#444";
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (0.75 + 0.15 * i);
        ctx.fillRect(64 + Math.cos(a) * 47 - 1, 58 + Math.sin(a) * 47 - 1, 2, 2);
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.font = `700 17px ${MONO}`;
      ctx.fillText(`${Math.round(used * 100)}%`, 64, 54);
      ctx.fillStyle = "#777";
      ctx.font = `600 7px ${MONO}`;
      ctx.fillText("CONTEXT", 64, 70);
      // state line
      const blink = si === 1 ? 0.5 + 0.5 * Math.sin(t * 9) : 1;
      ctx.fillStyle = `rgba(${col.join(",")},${blink})`;
      ctx.beginPath();
      ctx.arc(30, 112, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.font = `700 9px ${MONO}`;
      ctx.fillStyle = `rgb(${col.join(",")})`;
      ctx.fillText(si === 1 ? name + ".".repeat(1 + (Math.floor(t * 3) % 3)) : name, 38, 112);
    });
    return () => {
      unsub();
      io.disconnect();
    };
  }, []);
  return (
    <div className="bud">
      <div className="bud-device" aria-hidden="true">
        <canvas ref={ref} />
        <span className="bud-led" />
      </div>
      <div className="bud-info">
        <span className="badge">Lab</span>
        <h3>{BUDDY.title}</h3>
        <p>{BUDDY.body}</p>
        <div className="bud-foot">
          <span className="muted">{BUDDY.tags}</span>
          <a className="card-link" href={BUDDY.link[1]} {...ext}>
            {BUDDY.link[0]} ↗
          </a>
        </div>
        <span className="vp-dim">Simulated screen preview</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ telemetry monitor */

function MonitorBody({ telemetry, active }) {
  const ref = useRef(null);
  const valRef = useRef(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => {
    const c = ref.current;
    const ctx = c.getContext("2d");
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(c);
    let last = -1;
    const unsub = subscribe(() => {
      if (!visible || !activeRef.current) return;
      const data = telemetry.current;
      if (data.length === last) return;
      last = data.length;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = c.parentElement.clientWidth;
      const H = c.parentElement.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const fg = getComputedStyle(c).color;
      ctx.strokeStyle = fg;
      ctx.globalAlpha = 0.1;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = Math.round((H - 14) * (i / 4)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let i = 0; i <= 10; i++) {
        const x = Math.round((W * i) / 10) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H - 14);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (data.length < 2) return;
      const N = 150;
      const x = (i) => W - ((data.length - 1 - i) / (N - 1)) * W;
      const ch = H - 14;
      const maxTp = Math.max(20, ...data.map((d) => d.tp)) * 1.15;
      // throughput as filled area
      ctx.beginPath();
      data.forEach((d, i) => (i ? ctx.lineTo(x(i), ch - (d.tp / maxTp) * ch) : ctx.moveTo(x(i), ch - (d.tp / maxTp) * ch)));
      ctx.lineTo(x(data.length - 1), ch);
      ctx.lineTo(x(0), ch);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, "rgba(70,117,237,0.45)");
      g.addColorStop(1, "rgba(70,117,237,0)");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = "#39a2fc";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      data.forEach((d, i) => (i ? ctx.lineTo(x(i), ch - (d.tp / maxTp) * ch) : ctx.moveTo(x(i), ch - (d.tp / maxTp) * ch)));
      ctx.stroke();
      // coverage + delivery as lines on a 0..100% scale
      for (const [key, col] of [
        ["cov", "#35b779"],
        ["pdr", "#fcbe78"],
      ]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        data.forEach((d, i) => {
          const y = 4 + (1 - d[key]) * (ch - 8);
          i ? ctx.lineTo(x(i), y) : ctx.moveTo(x(i), y);
        });
        ctx.stroke();
      }
      const d = data[data.length - 1];
      ctx.fillStyle = fg;
      ctx.globalAlpha = 0.5;
      ctx.font = `500 9px ${MONO}`;
      ctx.textBaseline = "bottom";
      ctx.textAlign = "left";
      ctx.fillText(`-${Math.round((N - 1) * 0.2)}s`, 0, H);
      ctx.textAlign = "right";
      ctx.fillText("NOW", W, H);
      ctx.globalAlpha = 1;
      if (valRef.current)
        valRef.current.innerHTML =
          `<span style="color:#39a2fc">● THROUGHPUT ${d.tp} pkt/s</span>` +
          `<span style="color:#35b779">● COVERAGE ${(d.cov * 100).toFixed(0)}%</span>` +
          `<span style="color:#fcbe78">● DELIVERY ${(d.pdr * 100).toFixed(1)}%</span>`;
    });
    return () => {
      unsub();
      io.disconnect();
    };
  }, [telemetry]);
  return (
    <div className="mon">
      <div className="mon-vals" ref={valRef}>
        <span className="muted">Waiting for the viewport…</span>
      </div>
      <div className="mon-chart">
        <canvas ref={ref} aria-label="Live chart of the sensor network simulation" />
      </div>
      <div className="vp-dim">Linked to sensor_field.gl: change the controls and watch the curves move</div>
    </div>
  );
}

/* ------------------------------------------------------------------ desktop */

export default function Desktop() {
  const deskRef = useRef(null);
  const vpMeta = useRef(null);
  const telemetry = useRef([]);
  const [W, setW] = useState(() => (typeof window !== "undefined" ? window.innerWidth - 32 : 1200));
  const [mobile, setMobile] = useState(() => window.innerWidth < 900);
  const [booted, setBooted] = useState(false);
  const [moved, setMoved] = useState(false);
  const [wins, setWins] = useState(() => {
    const l = layoutFor(W);
    return Object.fromEntries(WINDOWS.map((w) => [w.id, { ...l[w.id], open: true, min: false }]));
  });

  useEffect(() => {
    const el = deskRef.current;
    const ro = new ResizeObserver(() => {
      setW(el.clientWidth);
      setMobile(window.innerWidth < 900);
    });
    ro.observe(el);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setBooted(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  // re-flow the default layout on resize until the visitor rearranges things
  useEffect(() => {
    if (moved) return;
    const l = layoutFor(W);
    setWins((ws) => Object.fromEntries(Object.entries(ws).map(([id, s]) => [id, { ...s, x: l[id].x, y: l[id].y, w: l[id].w, h: l[id].h }])));
  }, [W, moved]);

  const topZ = Math.max(...Object.values(wins).map((s) => s.z));
  const focus = useCallback(
    (id) =>
      setWins((ws) => {
        const z = Math.max(...Object.values(ws).map((s) => s.z));
        if (ws[id].z === z) return ws;
        return { ...ws, [id]: { ...ws[id], z: z + 1 } };
      }),
    []
  );
  const move = useCallback((id, x, y) => {
    setMoved(true);
    setWins((ws) => ({ ...ws, [id]: { ...ws[id], x, y } }));
  }, []);
  const close = useCallback((id) => setWins((ws) => ({ ...ws, [id]: { ...ws[id], open: false } })), []);
  const minimise = useCallback((id) => setWins((ws) => ({ ...ws, [id]: { ...ws[id], min: !ws[id].min } })), []);
  const task = (id) =>
    setWins((ws) => {
      const s = ws[id];
      const z = Math.max(...Object.values(ws).map((v) => v.z));
      if (!s.open || s.min) return { ...ws, [id]: { ...s, open: true, min: false, z: z + 1 } };
      if (s.z === z) return { ...ws, [id]: { ...s, min: true } };
      return { ...ws, [id]: { ...s, z: z + 1 } };
    });
  const reset = () => {
    setMoved(false);
    const l = layoutFor(W);
    setWins(Object.fromEntries(WINDOWS.map((w) => [w.id, { ...l[w.id], open: true, min: false }])));
  };

  const common = (id, i) => ({
    id,
    def: WINDOWS.find((w) => w.id === id),
    st: { ...wins[id], top: wins[id].z === topZ },
    mobile,
    onFocus: focus,
    onMove: move,
    onClose: close,
    onMin: minimise,
    index: i,
  });
  const live = (id) => booted && wins[id].open && !wins[id].min;

  return (
    <div className={`desk ${booted ? "in" : ""} ${mobile ? "stacked" : ""}`} ref={deskRef}>
      <div className="desk-bar">
        <span>◆ research / workspace</span>
        <span className="muted desk-bar-mid">{mobile ? "" : "Drag windows · orbit the model · try the controls"}</span>
        <button type="button" className="desk-reset" onClick={reset}>
          Reset layout
        </button>
      </div>

      <Win {...common("viewport", 0)} meta="WEBGL2" metaRef={vpMeta} bodyClass="flush">
        <ViewportBody active={live("viewport")} metaRef={vpMeta} telemetry={telemetry} />
      </Win>
      <Win {...common("paper", 1)} meta="PDF · 25 PP">
        <PaperBody />
      </Win>
      <Win {...common("notes", 2)} meta="3 DRAFTS" bodyClass="flush">
        <NotesBody booted={booted} />
      </Win>
      <Win {...common("buddy", 3)} meta="ESP32-S3">
        <BuddyBody active={live("buddy")} />
      </Win>
      <Win {...common("monitor", 4)} meta="5 HZ">
        <MonitorBody telemetry={telemetry} active={live("monitor")} />
      </Win>

      {!mobile && (
        <nav className="desk-task" aria-label="Windows">
          {WINDOWS.map((w) => {
            const s = wins[w.id];
            return (
              <button key={w.id} type="button" className={`${s.open && !s.min ? "on" : ""} ${s.z === topZ && s.open && !s.min ? "top" : ""}`} onClick={() => task(w.id)}>
                <i />
                {w.task}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
