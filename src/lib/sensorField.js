// Sensor field: a small WebGL2 scene for the IoT-sensing paper.
// Nodes sit on an animated terrain (environment) or wrap a body-area sphere (healthcare),
// link to neighbours within a radio radius, and route packets hop by hop to a gateway.
// "Cognitive" routing lets isolated nodes adapt their range to reach the network.

import { rng } from "./math.js";

const MAX_NODES = 360;
const MAX_PACKETS = 700;
const G = 46; // terrain grid resolution
const SPAN = 10;

const LINE_VS = `#version 300 es
in vec3 aPos; in vec4 aCol;
uniform mat4 uP; uniform mat4 uV;
out vec4 vCol;
void main() {
  vec4 v = uV * vec4(aPos, 1.0);
  gl_Position = uP * v;
  float fog = clamp((21.0 + v.z) / 13.0, 0.0, 1.0);
  vCol = vec4(aCol.rgb * aCol.a * fog, aCol.a * fog);
}`;
const LINE_FS = `#version 300 es
precision mediump float;
in vec4 vCol; out vec4 o;
void main() { o = vCol; }`;

const PT_VS = `#version 300 es
in vec3 aPos; in float aSize; in vec4 aCol;
uniform mat4 uP; uniform mat4 uV; uniform float uScale;
out vec4 vCol;
void main() {
  vec4 v = uV * vec4(aPos, 1.0);
  gl_Position = uP * v;
  gl_PointSize = clamp(aSize * uScale / -v.z, 1.0, 72.0);
  float fog = clamp((21.0 + v.z) / 13.0, 0.0, 1.0);
  vCol = vec4(aCol.rgb, aCol.a * fog);
}`;
const PT_FS = `#version 300 es
precision mediump float;
in vec4 vCol; out vec4 o;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r = dot(c, c);
  if (r > 1.0) discard;
  float a = (smoothstep(0.24, 0.0, r) + exp(-r * 3.6) * 0.55) * vCol.a;
  o = vec4(vCol.rgb * a, a);
}`;

function program(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [t, src] of [
    [gl.VERTEX_SHADER, vs],
    [gl.FRAGMENT_SHADER, fs],
  ]) {
    const s = gl.createShader(t);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function lookAt(e, t, u) {
  const z = norm(sub(e, t));
  const x = norm(cross(u, z));
  const y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, e), -dot(y, e), -dot(z, e), 1]);
}

function perspective(fov, aspect, near, far) {
  const f = 1 / Math.tan(fov / 2);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0]);
}

export const terrain = (x, z, t) =>
  -1.25 + 0.34 * Math.sin(x * 0.72 + t * 0.35) * Math.cos(z * 0.6 - t * 0.2) + 0.2 * Math.sin((x + z) * 1.05 - t * 0.28) + 0.08 * Math.cos(x * 2.1 + z * 1.7);

const ENV = [53, 183, 121];
const CARE = [229, 80, 100];
const mix3 = (a, b, m) => [a[0] + (b[0] - a[0]) * m, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m];

export class SensorField {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: true });
    if (!gl) throw new Error("webgl2 unavailable");
    this.gl = gl;
    this.lp = program(gl, LINE_VS, LINE_FS);
    this.pp = program(gl, PT_VS, PT_FS);
    this.lu = { P: gl.getUniformLocation(this.lp, "uP"), V: gl.getUniformLocation(this.lp, "uV") };
    this.pu = { P: gl.getUniformLocation(this.pp, "uP"), V: gl.getUniformLocation(this.pp, "uV"), S: gl.getUniformLocation(this.pp, "uScale") };

    this.lineData = new Float32Array(64000 * 7);
    this.ptData = new Float32Array((MAX_NODES + MAX_PACKETS + 8) * 8);
    this.lineVao = this.vao(this.lp, this.lineBuf = gl.createBuffer(), [["aPos", 3], ["aCol", 4]]);
    this.ptVao = this.vao(this.pp, this.ptBuf = gl.createBuffer(), [["aPos", 3], ["aSize", 1], ["aCol", 4]]);

    const r = rng(2026);
    this.r = r;
    this.seed = Array.from({ length: MAX_NODES }, (_, i) => {
      const a = r() * Math.PI * 2;
      const d = 4.4 * Math.sqrt(r());
      return { ex: Math.cos(a) * d, ez: Math.sin(a) * d, ph: r() * 6.28, sp: 0.6 + r() * 0.8, i };
    });
    this.pos = new Float32Array(MAX_NODES * 3);
    this.inited = false;
    this.flash = new Float32Array(MAX_NODES);
    this.parent = new Int32Array(MAX_NODES).fill(-2);
    this.adapt = new Int32Array(MAX_NODES).fill(-1);
    this.hops = new Int32Array(MAX_NODES);
    this.packets = [];
    this.links = [];
    this.t = 0;
    this.m = 0; // 0 environment, 1 healthcare
    this.yaw = 0.6;
    this.pitch = 0.42;
    this.dist = 10.5;
    this.drag = null;
    this.gw = [0, 0.9, 0];
    this.gwFlash = 0;
    this.stats = { window: [], ok3: [], drop3: [], links: 0, coverage: 0, hops: 0 };
    this.params = { nodes: 180, radius: 1.25, rate: 26, mode: "environment", cognitive: true, rotate: true };
    this.routeTick = 0;
    this.ringT = 0;
  }

  vao(prog, buf, attrs) {
    const gl = this.gl;
    const v = gl.createVertexArray();
    gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    const stride = attrs.reduce((a, [, n]) => a + n, 0) * 4;
    let off = 0;
    for (const [name, n] of attrs) {
      const loc = gl.getAttribLocation(prog, name);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off);
      off += n * 4;
    }
    gl.bindVertexArray(null);
    return v;
  }

  set(p) {
    Object.assign(this.params, p);
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
  }

  pointerDown(x, y) {
    this.drag = { x, y, yaw: this.yaw, pitch: this.pitch };
  }
  pointerMove(x, y) {
    if (!this.drag) return;
    this.yaw = this.drag.yaw - (x - this.drag.x) * 0.008;
    this.pitch = Math.min(1.25, Math.max(0.08, this.drag.pitch + (y - this.drag.y) * 0.006));
  }
  pointerUp() {
    this.drag = null;
  }

  targetFor(i, n, t) {
    const s = this.seed[i];
    // environment: on the terrain
    const ey = terrain(s.ex, s.ez, t) + 0.14;
    // healthcare: a body-area sphere (fibonacci lattice) breathing slowly
    const k = i + 0.5;
    const phi = Math.acos(1 - (2 * k) / n);
    const th = Math.PI * (1 + Math.sqrt(5)) * k;
    const R = 2.1 * (1 + 0.025 * Math.sin(t * 1.4 + s.ph));
    const cx = Math.cos(th) * Math.sin(phi) * R;
    const cy = Math.cos(phi) * R * 1.12 + 0.3;
    const cz = Math.sin(th) * Math.sin(phi) * R;
    const m = this.m;
    return [s.ex + (cx - s.ex) * m, ey + (cy - ey) * m, s.ez + (cz - s.ez) * m];
  }

  route(n) {
    const R = this.params.radius;
    const R2 = R * R;
    const P = this.pos;
    const adj = Array.from({ length: n }, () => []);
    const links = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = P[i * 3] - P[j * 3];
        const dy = P[i * 3 + 1] - P[j * 3 + 1];
        const dz = P[i * 3 + 2] - P[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < R2) {
          adj[i].push(j);
          adj[j].push(i);
          links.push(i, j);
        }
      }
    }
    // BFS from the gateway (it hears anything within 1.5 × radius)
    this.parent.fill(-2);
    this.adapt.fill(-1);
    const q = [];
    const gw = this.gw;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(P[i * 3] - gw[0], P[i * 3 + 1] - gw[1], P[i * 3 + 2] - gw[2]);
      if (d < R * 1.5) {
        this.parent[i] = -1;
        this.hops[i] = 1;
        q.push(i);
      }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (const j of adj[i]) {
        if (this.parent[j] !== -2) continue;
        this.parent[j] = i;
        this.hops[j] = this.hops[i] + 1;
        q.push(j);
      }
    }
    // cognitive mode: stranded nodes boost range to the nearest connected node
    if (this.params.cognitive) {
      let changed = true;
      while (changed) {
        changed = false;
        for (let i = 0; i < n; i++) {
          if (this.parent[i] !== -2) continue;
          let best = -1;
          let bd = 1e9;
          for (let j = 0; j < n; j++) {
            if (this.parent[j] === -2) continue;
            const d = Math.hypot(P[i * 3] - P[j * 3], P[i * 3 + 1] - P[j * 3 + 1], P[i * 3 + 2] - P[j * 3 + 2]);
            if (d < bd) {
              bd = d;
              best = j;
            }
          }
          const dg = Math.hypot(P[i * 3] - gw[0], P[i * 3 + 1] - gw[1], P[i * 3 + 2] - gw[2]);
          if (best < 0 || dg < bd) {
            this.parent[i] = -1;
            this.hops[i] = 1;
          } else {
            this.parent[i] = best;
            this.hops[i] = this.hops[best] + 1;
          }
          this.adapt[i] = best < 0 || dg < bd ? -3 : best;
          changed = true;
        }
      }
    }
    this.links = links;
    let reached = 0;
    let hopSum = 0;
    for (let i = 0; i < n; i++)
      if (this.parent[i] !== -2) {
        reached++;
        hopSum += this.hops[i];
      }
    this.stats.links = links.length / 2;
    this.stats.coverage = n ? reached / n : 0;
    this.stats.hops = reached ? hopSum / reached : 0;
  }

  frame(dt) {
    const gl = this.gl;
    const p = this.params;
    const n = Math.min(MAX_NODES, p.nodes | 0);
    this.t += dt;
    const t = this.t;
    const mT = p.mode === "healthcare" ? 1 : 0;
    this.m += (mT - this.m) * Math.min(1, dt * 1.6);
    const m = this.m;
    if (p.rotate && !this.drag) this.yaw += dt * 0.12;

    this.gw = [0, 0.3, 0];
    const k = Math.min(1, dt * 3.5);
    for (let i = 0; i < n; i++) {
      const tg = this.targetFor(i, n, t);
      if (!this.inited) {
        this.pos[i * 3] = tg[0];
        this.pos[i * 3 + 1] = tg[1];
        this.pos[i * 3 + 2] = tg[2];
      } else {
        this.pos[i * 3] += (tg[0] - this.pos[i * 3]) * k;
        this.pos[i * 3 + 1] += (tg[1] - this.pos[i * 3 + 1]) * k;
        this.pos[i * 3 + 2] += (tg[2] - this.pos[i * 3 + 2]) * k;
      }
      this.flash[i] *= Math.exp(-dt * 3);
    }
    if (!this.inited || ++this.routeTick % 6 === 0 || this.lastN !== n || this.lastR !== p.radius || this.lastC !== p.cognitive) {
      this.route(n);
      this.lastN = n;
      this.lastR = p.radius;
      this.lastC = p.cognitive;
    }
    this.inited = true;

    // packets
    const spawn = p.rate * dt;
    let toSpawn = Math.floor(spawn) + (this.r() < spawn % 1 ? 1 : 0);
    while (toSpawn-- > 0 && this.packets.length < MAX_PACKETS && n) {
      const i = Math.floor(this.r() * n);
      this.flash[i] = 1;
      this.packets.push({ at: i, f: 0 });
    }
    const now = performance.now();
    this.packets = this.packets.filter((pk) => {
      if (pk.at >= n) return false;
      const par = this.parent[pk.at];
      if (par === -2) {
        this.stats.drop3.push(now);
        return false;
      }
      pk.f += dt * 2.6;
      if (pk.f >= 1) {
        if (par === -1) {
          this.stats.window.push(now);
          this.stats.ok3.push(now);
          this.gwFlash = 1;
          return false;
        }
        pk.at = par;
        pk.f -= 1;
      }
      return true;
    });
    while (this.stats.window.length && now - this.stats.window[0] > 1000) this.stats.window.shift();
    while (this.stats.ok3.length && now - this.stats.ok3[0] > 3000) this.stats.ok3.shift();
    while (this.stats.drop3.length && now - this.stats.drop3[0] > 3000) this.stats.drop3.shift();
    this.gwFlash *= Math.exp(-dt * 4);

    // ---- build geometry
    const L = this.lineData;
    let li = 0;
    const line = (a, b, c, alpha, c2 = c, alpha2 = alpha) => {
      if (li + 14 > L.length) return;
      L[li++] = a[0]; L[li++] = a[1]; L[li++] = a[2];
      L[li++] = c[0] / 255; L[li++] = c[1] / 255; L[li++] = c[2] / 255; L[li++] = alpha;
      L[li++] = b[0]; L[li++] = b[1]; L[li++] = b[2];
      L[li++] = c2[0] / 255; L[li++] = c2[1] / 255; L[li++] = c2[2] / 255; L[li++] = alpha2;
    };
    const terrA = 0.34 * (1 - m * 0.8);
    const step = SPAN / (G - 1);
    const tc = [70, 160, 210];
    const heights = new Float32Array(G * G);
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const x = -SPAN / 2 + i * step;
        const z = -SPAN / 2 + j * step;
        heights[j * G + i] = terrain(x, z, t) - m * 0.6;
      }
    const fade = (x, z) => Math.max(0, 1 - Math.hypot(x, z) / (SPAN * 0.5));
    for (let j = 0; j < G; j++) {
      for (let i = 0; i < G; i++) {
        const x = -SPAN / 2 + i * step;
        const z = -SPAN / 2 + j * step;
        const a = [x, heights[j * G + i], z];
        const fa = fade(x, z);
        if (fa <= 0) continue;
        if (i < G - 1) line(a, [x + step, heights[j * G + i + 1], z], tc, terrA * fa, tc, terrA * fade(x + step, z));
        if (j < G - 1) line(a, [x, heights[(j + 1) * G + i], z + step], tc, terrA * fa, tc, terrA * fade(x, z + step));
      }
    }
    // sensing pulse rings expanding from the gateway across the ground
    this.ringT = (this.ringT + dt / 4.5) % 1;
    for (const off of [0, 0.5]) {
      const rt = (this.ringT + off) % 1;
      const rad = 0.3 + rt * 4.6;
      const ra = (1 - rt) * 0.55 * (1 - m * 0.85);
      let prev = null;
      for (let s = 0; s <= 72; s++) {
        const a = (s / 72) * Math.PI * 2;
        const x = Math.cos(a) * rad;
        const z = Math.sin(a) * rad;
        const pt = [x, terrain(x, z, t) - m * 0.6 + 0.02, z];
        if (prev) line(prev, pt, [120, 230, 220], ra);
        prev = pt;
      }
    }
    // mast from ground to gateway
    line([0, terrain(0, 0, t), 0], this.gw, [252, 190, 120], 0.6 * (1 - m), [252, 190, 120], 0.9 * (1 - m));
    // mesh links
    const P = this.pos;
    const nc = mix3(ENV, CARE, m);
    for (let e = 0; e < this.links.length; e += 2) {
      const i = this.links[e];
      const j = this.links[e + 1];
      const onTree = this.parent[i] === j || this.parent[j] === i;
      line([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], [P[j * 3], P[j * 3 + 1], P[j * 3 + 2]], onTree ? nc : [200, 210, 220], onTree ? 0.5 : 0.12);
    }
    // gateway uplinks + adaptive (cognitive) long links
    for (let i = 0; i < n; i++) {
      const a = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      if (this.parent[i] === -1) line(a, this.gw, [252, 190, 120], 0.32);
      const ad = this.adapt[i];
      if (ad >= 0) line(a, [P[ad * 3], P[ad * 3 + 1], P[ad * 3 + 2]], [255, 170, 60], 0.85);
      else if (ad === -3) line(a, this.gw, [255, 170, 60], 0.85);
    }

    const D = this.ptData;
    let pi = 0;
    const point = (q, size, c, a) => {
      D[pi++] = q[0]; D[pi++] = q[1]; D[pi++] = q[2]; D[pi++] = size;
      D[pi++] = c[0] / 255; D[pi++] = c[1] / 255; D[pi++] = c[2] / 255; D[pi++] = a;
    };
    for (let i = 0; i < n; i++) {
      const stranded = this.parent[i] === -2;
      const f = this.flash[i];
      const c = stranded ? [235, 70, 60] : this.adapt[i] !== -1 ? [255, 175, 70] : nc;
      point([P[i * 3], P[i * 3 + 1], P[i * 3 + 2]], 0.085 + f * 0.07, mix3(c, [255, 255, 255], f * 0.6), 0.75 + f * 0.25);
    }
    for (const pk of this.packets) {
      const i = pk.at;
      const par = this.parent[i];
      const b = par === -1 ? this.gw : [P[par * 3], P[par * 3 + 1], P[par * 3 + 2]];
      const a = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
      point([a[0] + (b[0] - a[0]) * pk.f, a[1] + (b[1] - a[1]) * pk.f, a[2] + (b[2] - a[2]) * pk.f], 0.06, [255, 250, 225], 0.95);
    }
    point(this.gw, 0.32 + this.gwFlash * 0.18, [252, 190, 120], 1);
    point(this.gw, 0.9 + this.gwFlash * 0.5, [252, 160, 90], 0.18);

    // ---- draw
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.024, 0.028, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    const aspect = this.canvas.width / this.canvas.height;
    // keep the horizontal field of view in portrait so the whole field stays in frame
    const fov = aspect >= 1 ? 0.72 : Math.min(1.3, 2 * Math.atan(Math.tan(0.36) / aspect));
    const Pm = perspective(fov, aspect, 0.1, 60);
    const target = [0, -0.6 + m * 0.85, 0];
    const eye = [
      target[0] + this.dist * Math.cos(this.pitch) * Math.sin(this.yaw),
      target[1] + this.dist * Math.sin(this.pitch),
      target[2] + this.dist * Math.cos(this.pitch) * Math.cos(this.yaw),
    ];
    const V = lookAt(eye, target, [0, 1, 0]);

    gl.useProgram(this.lp);
    gl.uniformMatrix4fv(this.lu.P, false, Pm);
    gl.uniformMatrix4fv(this.lu.V, false, V);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.bufferData(gl.ARRAY_BUFFER, L.subarray(0, li), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.LINES, 0, li / 7);

    gl.useProgram(this.pp);
    gl.uniformMatrix4fv(this.pu.P, false, Pm);
    gl.uniformMatrix4fv(this.pu.V, false, V);
    gl.uniform1f(this.pu.S, (this.canvas.height / 2) / Math.tan(fov / 2));
    gl.bindVertexArray(this.ptVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ptBuf);
    gl.bufferData(gl.ARRAY_BUFFER, D.subarray(0, pi), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.POINTS, 0, pi / 8);
    gl.bindVertexArray(null);

    const s = this.stats;
    const total = s.ok3.length + s.drop3.length;
    return {
      nodes: n,
      links: s.links,
      coverage: s.coverage,
      hops: s.hops,
      throughput: s.window.length,
      pdr: total ? s.ok3.length / total : 1,
      inflight: this.packets.length,
    };
  }
}
