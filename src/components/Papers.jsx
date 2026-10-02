import { useEffect, useRef, useState } from "react";
import { subscribe } from "../lib/ticker.js";
import { SensorField } from "../lib/sensorField.js";
import { useInView } from "./Reveal.jsx";
import { PAPER } from "../content.js";

const ext = { target: "_blank", rel: "noreferrer" };
const motionOff = () => document.documentElement.dataset.motion === "off";

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

/** The chapter's subject as a live 3D cover figure: an IoT sensor mesh routing data to a gateway. */
function Cover() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const fieldRef = useRef(null);
  const [mode, setMode] = useState("environment");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fieldRef.current?.set({ mode });
  }, [mode]);

  useEffect(() => {
    let field;
    try {
      field = new SensorField(canvasRef.current);
    } catch {
      setFailed(true);
      return;
    }
    fieldRef.current = field;
    field.set({ mode: "environment", nodes: 200, radius: 1.3, rate: 26, cognitive: true, rotate: true });
    const wrap = wrapRef.current;
    const ro = new ResizeObserver(() => {
      const r = wrap.getBoundingClientRect();
      field.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2));
    });
    ro.observe(wrap);
    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: "100px" });
    io.observe(wrap);
    // gently swap scenarios on its own until the visitor picks one
    let auto = true;
    let clock = 0;
    const unsub = subscribe((_, dt) => {
      if (!visible) return;
      const still = motionOff();
      field.frame(still ? 0 : dt);
      if (auto && !still) {
        clock += dt;
        if (clock > 9) {
          clock = 0;
          setMode((m) => (m === "environment" ? "healthcare" : "environment"));
        }
      }
    });
    const c = canvasRef.current;
    const down = (e) => {
      auto = false;
      c.setPointerCapture(e.pointerId);
      field.pointerDown(e.clientX, e.clientY);
    };
    const mv = (e) => field.pointerMove(e.clientX, e.clientY);
    const upE = () => field.pointerUp();
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", mv);
    c.addEventListener("pointerup", upE);
    c.addEventListener("pointercancel", upE);
    wrap.addEventListener("click", (e) => e.target.closest("button") && (auto = false));
    return () => {
      unsub();
      ro.disconnect();
      io.disconnect();
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", mv);
      c.removeEventListener("pointerup", upE);
      c.removeEventListener("pointercancel", upE);
    };
  }, []);

  return (
    <div className="pp-cover vp" ref={wrapRef}>
      <canvas ref={canvasRef} className="vp-canvas" aria-label="3D cover figure: an IoT sensor network routing data to a gateway. Drag to orbit." />
      {failed && <div className="vp-fail">WebGL2 is unavailable in this browser.</div>}
      <div className="vp-hint">
        <span>FIG.P1 — Sensor field</span>
        <span className="vp-dim">Illustrative render of the chapter&apos;s subject · drag to orbit</span>
      </div>
      <div className="pp-seg seg" role="group" aria-label="Scenario">
        {[
          ["environment", "Environment"],
          ["healthcare", "Healthcare"],
        ].map(([k, t]) => (
          <button key={k} type="button" className={mode === k ? "on" : ""} aria-pressed={mode === k} onClick={() => setMode(k)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Papers() {
  const ref = useInView(0.2);
  return (
    <article className="pp fade" ref={ref}>
      <header className="win-bar pp-bar">
        <div className="win-btns" aria-hidden="true">
          <i />
          <i />
        </div>
        <span className="win-title">{PAPER.code} — cognitive_sensing.pdf</span>
        <span className="win-meta">PDF · 25 PP</span>
      </header>
      <div className="pp-grid">
        <Cover />
        <div className="pp-paper">
          <PaperBody />
        </div>
      </div>
    </article>
  );
}
