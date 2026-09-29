import { useEffect, useRef } from "react";
import { subscribe } from "../lib/ticker.js";
import { cellPx, fontsReady, getAtlas } from "../lib/glyphs.js";
import { ASCII_FS, SCENE_FS, VS } from "../lib/heroShaders.js";
import { themeColors, useSettings } from "../lib/settings.jsx";
import { clamp } from "../lib/math.js";
import { START_T } from "../lib/debug.js";
import FluidSign from "./FluidSign.jsx";

export const STAGES = ["RAW DATA", "CLUSTERING", "NEURAL NET", "MODEL", "SIGNAL"];
const STAGE_SEC = 7;
const LAYERS = [3, 5, 5, 2];

function compile(gl, vs, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
    gl.attachShader(prog, sh);
  }
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const loc = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name.replace(/\[0\]$/, "");
    loc[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, loc };
}

// Layers are vertical columns of nodes (a classic network diagram). They are
// pre-rotated by R(yaw + wobble) because the shader maps view -> object with R(yaw),
// which cancels the sculpture's spin so the network always reads side-on.
function netNodes(t, yaw, out) {
  const ang = yaw + 0.55 * Math.sin(t * 0.3);
  const c = Math.cos(ang), s = Math.sin(ang);
  let k = 0;
  LAYERS.forEach((n, l) => {
    for (let i = 0; i < n; i++) {
      const vx = -1.32 + l * 0.88;
      const vy = (i - (n - 1) / 2) * 0.5 + 0.04 * Math.sin(t * 1.3 + l + i);
      const vz = 0.22 * Math.sin(t * 0.6 + i * 1.9 + l * 2.3);
      out[k++] = vx * c + vz * s;
      out[k++] = vy;
      out[k++] = -vx * s + vz * c;
    }
  });
}

function balls(t, out) {
  for (let i = 0; i < 6; i++) {
    out[i * 4] = Math.sin(t * 0.45 + i * 2.1) * 1.0;
    out[i * 4 + 1] = Math.sin(t * 0.37 + i * 1.3 + 1) * 0.75;
    out[i * 4 + 2] = Math.cos(t * 0.41 + i * 2.7) * 0.9;
    out[i * 4 + 3] = 0.34 + 0.06 * Math.sin(i * 3);
  }
}

const pad = (n, w) => String(n).padStart(w, "0");

export default function AsciiHero() {
  const canvasRef = useRef(null);
  const readoutRef = useRef(null);
  const { mood, motion } = useSettings();
  const live = useRef({ mood, motion });
  live.current = { mood, motion };

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      document.documentElement.classList.add("no-webgl");
      return;
    }

    let disposed = false;
    let unsub = () => {};
    let scene, ascii, fbo, sceneTex, atlasTex;
    let dpr = 1, cw = 8, ch = 16, cols = 1, rows = 1, fw = 1, fh = 1, atlasN = 1;
    let t = START_T, bootT = START_T ? 10 : 0, lastReadout = -1;
    let fg = [245, 245, 240], moodSeen = null;
    const mouse = { x: -999, y: -999, on: 0, target: 0, nx: 0, ny: 0, sx: 0, sy: 0, last: 0 };
    const waves = new Float32Array(16);
    let waveIdx = 0;
    const nodes = new Float32Array(45);
    const ballBuf = new Float32Array(24);
    let dirty = true;

    const init = async () => {
      await fontsReady();
      if (disposed) return;
      try {
        scene = compile(gl, VS, SCENE_FS);
        ascii = compile(gl, VS, ASCII_FS);
      } catch (err) {
        console.error(err);
        document.documentElement.classList.add("no-webgl");
        return;
      }
      gl.bindVertexArray(gl.createVertexArray());
      sceneTex = gl.createTexture();
      atlasTex = gl.createTexture();
      fbo = gl.createFramebuffer();
      resize();
      window.addEventListener("resize", resize);
      unsub = subscribe(frame);
    };

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ({ cw, ch } = cellPx(dpr));
      cols = Math.ceil(canvas.width / cw);
      rows = Math.ceil(canvas.height / ch);
      const ss = cols * rows > 14000 || w < 700 ? 1 : 2;
      fw = cols * ss;
      fh = rows * ss;

      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, fw, fh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      const atlas = getAtlas(cw, ch);
      atlasN = atlas.n;
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      dirty = true;
    }

    function frame(_clock, dt) {
      const { mood: m, motion: mo } = live.current;
      if (m !== moodSeen) {
        moodSeen = m;
        fg = themeColors().fg;
        dirty = true;
      }
      const vh = window.innerHeight;
      const scroll = clamp(window.scrollY / (vh * 0.9));
      document.documentElement.style.setProperty("--hero-p", scroll.toFixed(3));
      if (scroll >= 1) {
        canvas.style.visibility = "hidden";
        return;
      }
      canvas.style.visibility = "visible";

      const moving = mo === "on";
      if (moving) t += dt;
      bootT += dt;
      const boot = moving ? clamp(bootT / 2.4) : 1;

      mouse.on += (mouse.target - mouse.on) * Math.min(1, dt * 4);
      if (performance.now() - mouse.last > 2500) mouse.target = 0;
      mouse.sx += (mouse.nx - mouse.sx) * Math.min(1, dt * 2.5);
      mouse.sy += (mouse.ny - mouse.sy) * Math.min(1, dt * 2.5);

      if (!moving && !dirty && boot >= 1) return;
      dirty = false;

      const stage = moving ? (t / STAGE_SEC) % STAGES.length : 3.0;
      netNodes(t, t * 0.18 + mouse.sx * 0.7, nodes);
      balls(t, ballBuf);

      // pass 1: sculpture -> tiny buffer
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, fw, fh);
      gl.useProgram(scene.prog);
      const s = scene.loc;
      gl.uniform2f(s.uRes, fw, fh);
      gl.uniform1f(s.uAspect, (cols * cw) / (rows * ch));
      gl.uniform1f(s.uTime, t);
      gl.uniform1f(s.uStage, stage);
      gl.uniform2f(s.uMouse, mouse.sx, mouse.sy);
      gl.uniform1f(s.uZoom, 1 + scroll * 0.7);
      gl.uniform1f(s.uShift, (cols * cw) / (rows * ch) > 1 ? 0.3 : 0.16);
      gl.uniform3fv(s.uNodes, nodes);
      gl.uniform4fv(s.uBalls, ballBuf);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // pass 2: buffer -> glyphs
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(ascii.prog);
      const a = ascii.loc;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(a.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.uniform1i(a.uAtlas, 1);
      gl.uniform1f(a.uN, atlasN);
      gl.uniform2f(a.uCell, cw, ch);
      gl.uniform2f(a.uGrid, cols, rows);
      gl.uniform2f(a.uCanvas, canvas.width, canvas.height);
      gl.uniform1f(a.uTime, t + bootT * (moving ? 0 : 1));
      gl.uniform3f(a.uMouse, mouse.x, mouse.y, moving ? mouse.on : 0);
      gl.uniform4fv(a.uWaves, waves);
      gl.uniform1f(a.uScroll, scroll);
      gl.uniform1f(a.uBoot, boot);
      gl.uniform3f(a.uFg, fg[0] / 255, fg[1] / 255, fg[2] / 255);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // live readout of the "training run"
      if (readoutRef.current && t - lastReadout > 0.08) {
        lastReadout = t;
        const si = Math.floor(stage);
        const local = (stage % 1) * STAGE_SEC;
        const epoch = Math.floor(t * 23) % 10000;
        const loss = 0.018 + 2.2 * Math.exp(-local * 0.7) + 0.004 * Math.sin(t * 9);
        readoutRef.current.textContent =
          `STAGE ${pad(si + 1, 2)}/${pad(STAGES.length, 2)} — ${STAGES[si]}\n` +
          `EPOCH ${pad(epoch, 4)}   LOSS ${loss.toFixed(4)}\n` +
          `PTR ${(mouse.sx * 0.5 + 0.5).toFixed(3)} ${(mouse.sy * 0.5 + 0.5).toFixed(3)}`;
      }
    }

    const onMove = (e) => {
      mouse.x = (e.clientX * dpr) / cw;
      mouse.y = (e.clientY * dpr) / ch;
      mouse.nx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ny = -((e.clientY / window.innerHeight) * 2 - 1);
      mouse.target = 1;
      mouse.last = performance.now();
    };
    const onDown = (e) => {
      if (window.scrollY > window.innerHeight * 0.5) return;
      if (e.target.closest("a, button, input, .settings")) return;
      const i = waveIdx++ % 4;
      waves[i * 4] = (e.clientX * dpr) / cw;
      waves[i * 4 + 1] = (e.clientY * dpr) / ch;
      waves[i * 4 + 2] = t;
      waves[i * 4 + 3] = 1;
      dirty = true;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    init();

    return () => {
      disposed = true;
      unsub();
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
    };
  }, []);

  return (
    <section className="hero" id="top">
      <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />
      <h1 className="sr-only">Darian Lalla</h1>
      <div className="hero-sign">
        <FluidSign />
      </div>
      <div className="hero-ui">
        <div className="hero-id">
          <p>
            Data science · Machine learning
            <br />
            Creative technology
          </p>
        </div>
        <div className="hero-hint" aria-hidden="true">
          Scroll <span>↓</span>
        </div>
        <pre className="hero-readout" ref={readoutRef} aria-hidden="true">
          {"STAGE 01/05 — RAW DATA\nEPOCH 0000   LOSS 2.2180\nPTR 0.500 0.500"}
        </pre>
      </div>
      <div className="hero-fallback" aria-hidden="true">
        darian
        <br />
        lalla
      </div>
    </section>
  );
}
