import { useEffect, useRef } from "react";
import { subscribe } from "../lib/ticker.js";
import { WIDE, fontsReady } from "../lib/glyphs.js";
import * as SH from "../lib/fluidShaders.js";
import { themeColors, useSettings } from "../lib/settings.jsx";
import { clamp } from "../lib/math.js";

const NAME = "DARIAN LALLA";
const SPLIT = ["DARIAN", "LALLA"];
const DARK_BASE = [234 / 255, 249 / 255, 251 / 255]; // the sign's icy off-white

function compile(gl, fs) {
  const prog = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, SH.VS],
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

/** Eight spectral weights (red → violet) normalised so they sum to white. */
function spectralWeights() {
  const w = [];
  for (let i = 0; i < 8; i++) {
    const h = (i / 7) * 0.78;
    const k = (n) => (n + h * 6) % 6;
    const f = (n) => 1 - Math.max(0, Math.min(k(n), 4 - k(n), 1));
    w.push([f(5), f(3), f(1)]);
  }
  const sum = [0, 1, 2].map((c) => w.reduce((a, v) => a + v[c], 0));
  return new Float32Array(w.flatMap((v) => v.map((x, c) => x / sum[c])));
}

/**
 * The name as a fluid sign: the cursor pushes a small incompressible fluid, whose
 * accumulated flow displaces the letters and splits them into prismatic fringes.
 */
export default function FluidSign() {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const settings = useSettings();
  const live = useRef(settings);
  live.current = settings;

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) {
      wrap.classList.add("sign-fallback");
      return;
    }
    const floatOK = gl.getExtension("EXT_color_buffer_float") || gl.getExtension("EXT_color_buffer_half_float");
    gl.getExtension("OES_texture_float_linear");
    if (!floatOK) {
      wrap.classList.add("sign-fallback");
      return;
    }

    let P;
    try {
      P = {
        splat: compile(gl, SH.SPLAT),
        advect: compile(gl, SH.ADVECT),
        curl: compile(gl, SH.CURL),
        vort: compile(gl, SH.VORTICITY),
        div: compile(gl, SH.DIVERGENCE),
        press: compile(gl, SH.PRESSURE),
        grad: compile(gl, SH.GRADIENT),
        scale: compile(gl, SH.SCALE),
        display: compile(gl, SH.DISPLAY),
      };
    } catch (err) {
      console.error(err);
      wrap.classList.add("sign-fallback");
      return;
    }
    gl.bindVertexArray(gl.createVertexArray());
    const weights = spectralWeights();

    const target = (w, h) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { tex, fbo, w, h };
    };
    const pair = (w, h) => {
      const p = { read: target(w, h), write: target(w, h) };
      p.swap = () => ([p.read, p.write] = [p.write, p.read]);
      return p;
    };

    let W = 0, H = 0, dpr = 1, simW = 0, simH = 0;
    let vel, disp, pressure, divergence, curl, textTex;
    let t = 0, age = 0, unsub = null, moodSeen = null;
    let base = DARK_BASE;
    let dirty = true;
    const pointer = { x: 0, y: 0, px: 0, py: 0, moved: false, init: false };

    const draw = (prog, out, setup) => {
      gl.useProgram(prog.prog);
      setup(prog.loc);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out ? out.fbo : null);
      gl.viewport(0, 0, out ? out.w : canvas.width, out ? out.h : canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const bind = (unit, tex) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      return unit;
    };

    function layout() {
      const r = wrap.getBoundingClientRect();
      W = r.width;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const gut = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--gut")) || 16;
      const lines = W < 700 ? SPLIT : [NAME];
      const m = document.createElement("canvas").getContext("2d");
      m.font = `800 100px ${WIDE}`;
      const fs = Math.min(...lines.map((l) => (100 * (W - gut * 2)) / m.measureText(l).width));
      m.font = `800 ${fs}px ${WIDE}`;
      const cap = m.measureText("D").actualBoundingBoxAscent || fs * 0.72;
      const gap = cap * 0.28;
      const pad = cap * 0.9;
      H = Math.round(pad * 2 + cap * lines.length + gap * (lines.length - 1));
      wrap.style.height = `${H}px`;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = `${H}px`;

      const tc = document.createElement("canvas");
      tc.width = canvas.width;
      tc.height = canvas.height;
      const c = tc.getContext("2d");
      c.scale(dpr, dpr);
      c.font = `800 ${fs}px ${WIDE}`;
      c.fillStyle = "#fff";
      c.textBaseline = "alphabetic";
      lines.forEach((l, i) => {
        const lw = c.measureText(l).width;
        const x = lines.length > 1 ? gut : gut + (W - gut * 2 - lw) / 2;
        c.fillText(l, x, pad + cap + i * (cap + gap));
      });
      textTex = textTex || gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, textTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      simW = W < 700 ? 110 : 190;
      simH = Math.max(20, Math.round((simW * H) / W));
      vel = pair(simW, simH);
      disp = pair(simW, simH);
      pressure = pair(simW, simH);
      divergence = target(simW, simH);
      curl = target(simW, simH);
      dirty = true;
    }

    function splat(x, y, fx, fy) {
      const tx = [1 / simW, 1 / simH];
      draw(P.splat, vel.write, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uTarget, bind(0, vel.read.tex));
        gl.uniform2f(l.uPoint, x, y);
        gl.uniform2f(l.uForce, fx, fy);
        gl.uniform1f(l.uRadius, W < 700 ? 0.09 : 0.05);
        gl.uniform1f(l.uAspect, W / H);
      });
      vel.swap();
    }

    function step(dt) {
      const tx = [1 / simW, 1 / simH];
      // pointer + a scripted sweep on load so the fluid shows itself once
      if (age > 0.25 && age < 1.7) {
        const k = (age - 0.25) / 1.45;
        const x = -0.05 + k * 1.1;
        const y = 0.5 + 0.22 * Math.sin(k * Math.PI * 3);
        const lastK = Math.max(0, (age - dt - 0.25) / 1.45);
        const lx = -0.05 + lastK * 1.1;
        const ly = 0.5 + 0.22 * Math.sin(lastK * Math.PI * 3);
        splat(x, y, ((x - lx) * simW) / Math.max(dt, 1 / 120) * 0.55, ((y - ly) * simH) / Math.max(dt, 1 / 120) * 0.55);
      }
      if (pointer.moved) {
        pointer.moved = false;
        const dx = (pointer.x - pointer.px) * simW;
        const dy = (pointer.y - pointer.py) * simH;
        pointer.px = pointer.x;
        pointer.py = pointer.y;
        if (pointer.y > -0.4 && pointer.y < 1.4) splat(pointer.x, pointer.y, (dx / Math.max(dt, 1 / 120)) * 0.75, (dy / Math.max(dt, 1 / 120)) * 0.75);
      }
      draw(P.curl, curl, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uVelocity, bind(0, vel.read.tex));
      });
      draw(P.vort, vel.write, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uVelocity, bind(0, vel.read.tex));
        gl.uniform1i(l.uCurl, bind(1, curl.tex));
        gl.uniform1f(l.uCurlStrength, 3);
        gl.uniform1f(l.uDt, dt);
      });
      vel.swap();
      draw(P.div, divergence, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uVelocity, bind(0, vel.read.tex));
      });
      draw(P.scale, pressure.write, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uSource, bind(0, pressure.read.tex));
        gl.uniform1f(l.uValue, 0.8);
      });
      pressure.swap();
      for (let i = 0; i < 18; i++) {
        draw(P.press, pressure.write, (l) => {
          gl.uniform2f(l.uTexel, ...tx);
          gl.uniform1i(l.uPressure, bind(0, pressure.read.tex));
          gl.uniform1i(l.uDivergence, bind(1, divergence.tex));
        });
        pressure.swap();
      }
      draw(P.grad, vel.write, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uPressure, bind(0, pressure.read.tex));
        gl.uniform1i(l.uVelocity, bind(1, vel.read.tex));
      });
      vel.swap();
      draw(P.advect, vel.write, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uVelocity, bind(0, vel.read.tex));
        gl.uniform1i(l.uSource, bind(0, vel.read.tex));
        gl.uniform1f(l.uDt, dt);
        gl.uniform1f(l.uDissipation, Math.pow(0.955, dt * 60));
        gl.uniform1f(l.uRelax, 1);
        gl.uniform1f(l.uFeed, 0);
      });
      vel.swap();
      // displacement: carried by the flow, fed by it, and springing back to rest
      draw(P.advect, disp.write, (l) => {
        gl.uniform2f(l.uTexel, ...tx);
        gl.uniform1i(l.uVelocity, bind(0, vel.read.tex));
        gl.uniform1i(l.uSource, bind(1, disp.read.tex));
        gl.uniform1f(l.uDt, dt);
        gl.uniform1f(l.uDissipation, 1);
        gl.uniform1f(l.uRelax, Math.pow(0.962, dt * 60));
        gl.uniform1f(l.uFeed, dt * 0.26);
      });
      disp.swap();
    }

    function render(heroP) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      draw(P.display, null, (l) => {
        gl.uniform2f(l.uTexel, 1 / canvas.width, 1 / canvas.height);
        gl.uniform1i(l.uText, bind(0, textTex));
        gl.uniform1i(l.uDisp, bind(1, disp.read.tex));
        gl.uniform3fv(l.uWeights, weights);
        gl.uniform3f(l.uBase, ...base);
        gl.uniform1f(l.uTime, t);
        gl.uniform2f(l.uAmount, 1 / simW, 1 / simH);
        gl.uniform1f(l.uFade, clamp(1 - heroP * 1.6));
      });
    }

    function frame(_, dtRaw) {
      if (!vel) return;
      const { mood, motion } = live.current;
      if (mood !== moodSeen) {
        moodSeen = mood;
        base = mood === "light" ? themeColors().fg.map((v) => v / 255) : DARK_BASE;
        dirty = true;
      }
      const heroP = parseFloat(document.documentElement.style.getPropertyValue("--hero-p")) || 0;
      if (heroP >= 1) return;
      const dt = Math.min(dtRaw || 1 / 60, 1 / 30);
      if (motion === "on") {
        t += dt;
        age += dt;
        step(dt);
      } else if (!dirty) return;
      dirty = false;
      render(heroP);
    }

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width) return;
      const x = (e.clientX - r.left) / r.width;
      const y = 1 - (e.clientY - r.top) / r.height;
      if (!pointer.init) {
        pointer.px = x;
        pointer.py = y;
        pointer.init = true;
      }
      pointer.x = x;
      pointer.y = y;
      pointer.moved = true;
    };
    const ro = new ResizeObserver(() => layout());
    window.addEventListener("pointermove", onMove, { passive: true });
    fontsReady().then(() => {
      ro.observe(wrap);
      unsub = subscribe(frame);
    });
    return () => {
      unsub?.();
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div ref={wrapRef} className="fluid-sign" aria-hidden="true">
      <canvas ref={canvasRef} />
      <span className="sign-text">{NAME}</span>
    </div>
  );
}
