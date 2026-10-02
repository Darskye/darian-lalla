import { useEffect, useRef, useState } from "react";
import { subscribe } from "../lib/ticker.js";
import { DeviceGL } from "../lib/deviceGL.js";
import { MONO } from "../lib/glyphs.js";
import { BUDDY } from "../content.js";

const ext = { target: "_blank", rel: "noreferrer" };
const motionOff = () => document.documentElement.dataset.motion === "off";

// states named as in the firmware README
const STATES = [
  { name: "READY", col: [225, 225, 230], dur: 3.2 },
  { name: "THINKING", col: [252, 190, 120], dur: 3.6 },
  { name: "RUNNING", col: [80, 220, 210], dur: 3.4 },
  { name: "YOUR TURN", col: [90, 150, 255], dur: 3.0 },
  { name: "DONE", col: [120, 225, 130], dur: 2.4 },
];

const PARTS = [
  { id: "display", top: "70px", at: [0, 0.28, 0.17], n: [0, 0, 1], side: "l", title: "0.85″ 128×128 panel", text: "Agent state, the running tool and live usage. The layout never cuts; it morphs." },
  { id: "chip", top: "58%", at: [0, -0.6, 0.165], n: [0, 0, 1], side: "l", title: "ESP32-S3", text: "4 MB flash, 2 MB PSRAM. Every pixel is drawn in software." },
  { id: "wifi", top: "52px", at: [0, 1.0, 0], n: [0, 1, 0.25], side: "r", title: "2.4 GHz Wi-Fi", text: "Claude Code hooks broadcast a UDP packet. Nothing stays running on the PC." },
  { id: "buttons", top: "33%", at: [0.66, 0.55, 0], n: [1, 0, 0], side: "r", title: "Two buttons", text: "Right for the next screen, left to go back: buddy, usage, session." },
  { id: "usb", top: "64%", at: [0, -1.0, 0.04], n: [0, -0.4, 0.9], side: "r", title: "USB-C", text: "Power and flashing with PlatformIO." },
];

/** The 128×128 screen, drawn every frame and uploaded as a texture. */
function drawScreen(ctx, t, st, usage) {
  const [r, g, b] = st.col;
  const c = `rgb(${r},${g},${b})`;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 128, 128);
  // usage along the top edge
  ctx.fillStyle = "#1c1d22";
  ctx.fillRect(8, 8, 112, 3);
  ctx.fillStyle = "#e8e8e8";
  ctx.fillRect(8, 8, 112 * usage, 3);
  ctx.font = `600 7px ${MONO}`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = "#8a8a90";
  ctx.fillText("5H", 8, 14);
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(usage * 100)}%`, 120, 14);
  // glow
  const gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 46);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gr;
  ctx.fillRect(0, 18, 128, 92);
  // state mark
  ctx.strokeStyle = c;
  ctx.fillStyle = c;
  ctx.lineWidth = 3;
  const k = t % 10;
  if (st.name === "READY") {
    const s = 14 + Math.sin(t * 2) * 2;
    ctx.beginPath();
    ctx.arc(64, 60, s, 0, Math.PI * 2);
    ctx.stroke();
  } else if (st.name === "THINKING") {
    const n = 1 + (Math.floor(t * 2.5) % 3);
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < n ? 1 : 0.2;
      ctx.beginPath();
      ctx.arc(46 + i * 18, 60, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (st.name === "RUNNING") {
    for (let i = 0; i < 6; i++) {
      const on = Math.floor(t * 8 + i * 2.3) % 6 === i;
      ctx.globalAlpha = on ? 1 : 0.28;
      ctx.fillRect(28 + i * 12, 54, 9, 9);
    }
    ctx.globalAlpha = 1;
  } else if (st.name === "YOUR TURN") {
    const y = 48 + Math.sin(t * 4) * 3;
    ctx.fillRect(60, y, 8, 18);
    ctx.fillRect(60, y + 22, 8, 7);
  } else {
    const rr = 10 + ((k * 22) % 26);
    ctx.globalAlpha = 1 - (rr - 10) / 26;
    ctx.beginPath();
    ctx.arc(64, 60, rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(56, 60);
    ctx.lineTo(62, 66);
    ctx.lineTo(73, 54);
    ctx.stroke();
  }
  // ground line + label
  ctx.fillStyle = c;
  ctx.globalAlpha = 0.6;
  ctx.fillRect(24, 92, 80, 1);
  ctx.globalAlpha = 1;
  ctx.font = `700 9px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillText(st.name, 64, 100);
}

export default function Hardware() {
  const stageRef = useRef(null);
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const labelRefs = useRef([]);
  const [failed, setFailed] = useState(false);
  const [pinned, setPinned] = useState(-1);
  const pinnedRef = useRef(-1);
  pinnedRef.current = pinned;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    let dev;
    try {
      dev = new DeviceGL(canvas);
    } catch (e) {
      console.error(e);
      setFailed(true);
      return;
    }
    const scr = document.createElement("canvas");
    scr.width = 128;
    scr.height = 128;
    const sctx = scr.getContext("2d");
    const s = { t: 0, yaw: -0.5, pitch: 0.16, vyaw: 0, drag: null, mx: 0, my: 0, usage: 0.31, clock: 0, si: 0, tilt: 0 };
    let visible = false;
    let lastShown = -1;

    const resize = () => {
      const r = stage.getBoundingClientRect();
      dev.resize(r.width, r.height, window.devicePixelRatio || 1);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(stage);
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "60px" });
    io.observe(stage);

    const down = (e) => {
      if (e.target.closest("a, button")) return;
      s.drag = { x: e.clientX, yaw: s.yaw, last: e.clientX, t: performance.now() };
      stage.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      const r = stage.getBoundingClientRect();
      s.mx = ((e.clientX - r.left) / r.width) * 2 - 1;
      s.my = ((e.clientY - r.top) / r.height) * 2 - 1;
      if (s.drag) {
        s.yaw = s.drag.yaw - (e.clientX - s.drag.x) * 0.008;
        const now = performance.now();
        s.vyaw = (-(e.clientX - s.drag.last) * 0.008) / Math.max(0.008, (now - s.drag.t) / 1000);
        s.drag.last = e.clientX;
        s.drag.t = now;
      }
    };
    const up = () => (s.drag = null);
    stage.addEventListener("pointerdown", down);
    stage.addEventListener("pointermove", move);
    stage.addEventListener("pointerup", up);
    stage.addEventListener("pointercancel", up);

    const unsub = subscribe((_, dt) => {
      if (!visible) return;
      const still = motionOff();
      if (!still) s.t += dt;
      // turntable with inertia after a drag
      if (!s.drag) {
        s.vyaw *= Math.exp(-dt * 2.2);
        s.yaw += (still ? 0 : 0.18 + s.vyaw) * dt;
      }
      s.tilt += (s.my * 0.08 - s.tilt) * Math.min(1, dt * 3);
      // state machine (or a state pinned by the visitor)
      let st;
      if (pinnedRef.current >= 0) st = STATES[pinnedRef.current];
      else {
        s.clock += dt;
        if (s.clock > STATES[s.si].dur) {
          s.clock = 0;
          s.si = (s.si + 1) % STATES.length;
        }
        st = STATES[s.si];
      }
      if (st.name === "THINKING" || st.name === "RUNNING") s.usage = Math.min(0.94, s.usage + dt * 0.012);
      const si = STATES.indexOf(st);
      if (si !== lastShown) {
        lastShown = si;
        setShown(si);
      }
      drawScreen(sctx, s.t, st, s.usage);
      const bob = still ? 0 : Math.sin(s.t * 1.1) * 0.035;
      const wide = stage.clientWidth >= 760;
      const glow = st.col.map((v) => (v / 255) * 0.5);
      dev.render({ t: s.t, yaw: s.yaw, pitch: 0.16 + s.tilt, dist: wide ? 6.3 : 7.2, bob, screen: scr, glow, led: [0.3, 0.95, 0.85] });

      // leader lines from projected parts to their labels
      const svg = svgRef.current;
      if (!svg) return;
      PARTS.forEach((part, i) => {
        const el = labelRefs.current[i];
        const line = svg.children[i];
        if (!el || !line) return;
        const pr = dev.project(part.at, part.n, bob);
        const lr = el.getBoundingClientRect();
        const sr = stage.getBoundingClientRect();
        const ax = part.side === "l" ? lr.right - sr.left + 8 : lr.left - sr.left - 8;
        const ay = lr.top - sr.top + 11;
        const vis = Math.max(0, Math.min(1, pr.facing * 3 + 0.3));
        const path = line.querySelector("path");
        const dot = line.querySelector("circle");
        const mid = ax + (pr.x - ax) * 0.25;
        path.setAttribute("d", `M${ax.toFixed(1)},${ay.toFixed(1)} L${mid.toFixed(1)},${ay.toFixed(1)} L${pr.x.toFixed(1)},${pr.y.toFixed(1)}`);
        dot.setAttribute("cx", pr.x.toFixed(1));
        dot.setAttribute("cy", pr.y.toFixed(1));
        line.style.opacity = (0.15 + 0.85 * vis).toFixed(2);
        el.style.opacity = (0.35 + 0.65 * vis).toFixed(2);
      });
    });

    return () => {
      unsub();
      ro.disconnect();
      io.disconnect();
      stage.removeEventListener("pointerdown", down);
      stage.removeEventListener("pointermove", move);
      stage.removeEventListener("pointerup", up);
      stage.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <div className="hw">
      <div className="hw-stage" ref={stageRef}>
        <div className="hw-floor" aria-hidden="true" />
        <canvas ref={canvasRef} className="hw-gl" aria-label="A 3D model of the Claude Buddy device: drag to turn it" />
        {failed && <div className="ab-fail">This model needs WebGL2.</div>}
        <svg ref={svgRef} className="hw-leaders" aria-hidden="true">
          {PARTS.map((p) => (
            <g key={p.id}>
              <path />
              <circle r="3.5" />
            </g>
          ))}
        </svg>
        {PARTS.map((p, i) => (
          <div key={p.id} ref={(el) => (labelRefs.current[i] = el)} className={`hw-label ${p.side}`} style={{ top: p.top }}>
            <div className="hw-label-head">
              <span>{String(i + 1).padStart(2, "0")}</span>
              {p.title}
            </div>
            <p>{p.text}</p>
          </div>
        ))}
        <div className="hw-hint">Drag to turn · FIG.10</div>
      </div>

      <div className="hw-copy">
        <div className="muted hw-code">[ H01 ]</div>
        <h3 className="hw-title">{BUDDY.title}</h3>
        <div className="muted hw-tags">{BUDDY.tags}</div>
        <p className="hw-body">{BUDDY.body}</p>
        <div className="hw-states">
          <div className="muted">States — tap to pin one</div>
          <div className="hw-chips">
            {STATES.map((st, i) => (
              <button
                key={st.name}
                type="button"
                className={`${shown === i ? "on" : ""} ${pinned === i ? "pinned" : ""}`}
                style={{ "--c": `rgb(${st.col.join(",")})` }}
                onClick={() => setPinned((p) => (p === i ? -1 : i))}
                aria-pressed={pinned === i}
              >
                <i />
                {st.name}
              </button>
            ))}
          </div>
        </div>
        <dl className="hw-spec">
          <div>
            <dt>Board</dt>
            <dd>LilyGo T-QT Pro (ESP32-S3)</dd>
          </div>
          <div>
            <dt>Link</dt>
            <dd>UDP broadcast over 2.4 GHz Wi-Fi</dd>
          </div>
          <div>
            <dt>Screens</dt>
            <dd>Buddy · Usage · Session</dd>
          </div>
        </dl>
        <div className="hw-foot">
          <a className="card-link" href={BUDDY.link[1]} {...ext}>
            {BUDDY.link[0]} ↗
          </a>
          <span className="vp-dim">Model and screen are simulated renders</span>
        </div>
      </div>
    </div>
  );
}
