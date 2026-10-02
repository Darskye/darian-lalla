// A stylised LilyGo T-QT Pro, raymarched as a signed distance field: rounded aluminium
// body, recessed glass over a live 128×128 screen texture, side buttons, a USB-C port,
// a status LED and a soft contact shadow. The camera orbits; parts can be projected
// to screen space for the annotation layer.

const VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uRo;
uniform vec3 uUU;
uniform vec3 uVV;
uniform vec3 uWW;
uniform float uZoom;
uniform float uBob;
uniform sampler2D uScreen;
uniform vec3 uGlow;
uniform vec3 uLed;
out vec4 o;

float sdRB(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }

const float FLOOR = -1.32;

vec2 map(vec3 p) {
  p.y -= uBob;
  float body = sdRB(p, vec3(0.62, 1.0, 0.16), 0.14);
  // a fine seam around the case
  float seam = max(abs(p.z + 0.02) - 0.005, -sdRB(p, vec3(0.605, 0.985, 0.145), 0.125));
  body = max(body, -seam);
  vec3 sp = p - vec3(0.0, 0.28, 0.16);
  float recess = sdRB(sp, vec3(0.5, 0.5, 0.04), 0.07);
  vec2 res = vec2(max(body, -recess), 0.0);
  float glass = sdRB(sp + vec3(0.0, 0.0, 0.022), vec3(0.485, 0.485, 0.01), 0.06);
  if (glass < res.x) res = vec2(glass, 1.0);
  float bl = sdRB(p - vec3(-0.63, 0.55, 0.0), vec3(0.04, 0.11, 0.065), 0.035);
  float br = sdRB(p - vec3(0.63, 0.55, 0.0), vec3(0.04, 0.11, 0.065), 0.035);
  float bt = min(bl, br);
  if (bt < res.x) res = vec2(bt, 2.0);
  float port = sdRB(p - vec3(0.0, -1.0, 0.0), vec3(0.18, 0.09, 0.055), 0.055);
  res.x = max(res.x, -port);
  float plug = sdRB(p - vec3(0.0, -0.975, 0.0), vec3(0.13, 0.05, 0.014), 0.012);
  if (plug < res.x) res = vec2(plug, 3.0);
  float led = length(p - vec3(0.4, -0.74, 0.155)) - 0.028;
  if (led < res.x) res = vec2(led, 4.0);
  return res;
}

vec3 calcN(vec3 p) {
  const vec2 e = vec2(0.0012, -0.0012);
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < 32; i++) {
    float h = map(ro + rd * t).x;
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.25);
    if (res < 0.002 || t > 4.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

float ao(vec3 p, vec3 n) {
  float occ = 0.0;
  float sca = 1.0;
  for (int i = 0; i < 5; i++) {
    float h = 0.012 + 0.09 * float(i);
    occ += (h - map(p + n * h).x) * sca;
    sca *= 0.75;
  }
  return clamp(1.0 - 2.4 * occ, 0.0, 1.0);
}

vec3 sky(vec3 rd) {
  float y = rd.y * 0.5 + 0.5;
  vec3 c = mix(vec3(0.03, 0.035, 0.05), vec3(0.32, 0.36, 0.42), smoothstep(0.35, 1.0, y));
  // softbox strips
  c += vec3(1.0) * smoothstep(0.02, 0.0, abs(rd.x + 0.55) - 0.12) * smoothstep(0.1, 0.5, rd.y) * 1.4;
  c += vec3(0.9, 0.95, 1.0) * smoothstep(0.03, 0.0, abs(rd.x - 0.7) - 0.05) * smoothstep(-0.1, 0.4, rd.y) * 0.7;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uv.x * uUU + uv.y * uVV + uZoom * uWW);
  vec3 ro = uRo;
  vec3 L = normalize(vec3(-0.6, 0.85, 0.55));

  float t = 0.0;
  vec2 h = vec2(1.0, -1.0);
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    h = map(ro + rd * t);
    if (h.x < 0.0006 * (1.0 + t)) { hit = true; break; }
    t += h.x;
    if (t > 12.0) break;
  }

  if (!hit) {
    // floor: contact shadow plus the screen's glow, everything else transparent
    float tf = (FLOOR - ro.y) / rd.y;
    if (rd.y < 0.0 && tf > 0.0) {
      vec3 fp = ro + rd * tf;
      float sh = shadow(fp + vec3(0.0, 0.002, 0.0), normalize(vec3(-L.x * 0.3, 1.0, -L.z * 0.3)));
      float r = length(fp.xz);
      float fade = smoothstep(2.6, 0.2, r);
      float dark = (1.0 - sh) * 0.75 * fade;
      vec3 glow = uGlow * exp(-pow(length(fp.xz - vec2(0.0, 0.45)) / 0.75, 2.0)) * 0.55;
      float a = clamp(dark + length(glow) * 0.8, 0.0, 0.9);
      o = vec4(glow, a);
      return;
    }
    o = vec4(0.0);
    return;
  }

  vec3 p = ro + rd * t;
  vec3 n = calcN(p);
  vec3 lp = p - vec3(0.0, uBob, 0.0);
  float occ = ao(p, n);
  float sh = shadow(p + n * 0.003, L);
  float dif = clamp(dot(n, L), 0.0, 1.0) * mix(0.35, 1.0, sh);
  vec3 hv = normalize(L - rd);
  float fre = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 4.0);
  vec3 ref = sky(reflect(rd, n));
  vec3 col;

  if (h.y < 0.5) {
    // bead-blasted graphite aluminium
    float grain = fract(sin(dot(floor(lp.xy * 420.0), vec2(12.9898, 78.233))) * 43758.5453);
    vec3 base = vec3(0.075, 0.078, 0.088) * (0.94 + 0.12 * grain);
    float spec = pow(clamp(dot(n, hv), 0.0, 1.0), 38.0) * sh;
    col = base * (0.25 + 1.1 * dif) * occ + ref * (0.05 + 0.5 * fre) * occ + spec * 0.55;
  } else if (h.y < 1.5) {
    // glass over the panel
    vec3 sp = lp - vec3(0.0, 0.28, 0.16);
    vec2 suv = sp.xy / 0.47 * 0.5 + 0.5;
    vec3 scr = vec3(0.0);
    if (all(greaterThan(suv, vec2(0.0))) && all(lessThan(suv, vec2(1.0)))) scr = texture(uScreen, vec2(suv.x, 1.0 - suv.y)).rgb;
    float sheen = smoothstep(0.08, 0.0, abs(sp.x + sp.y * 0.8 - 0.1)) * 0.06;
    col = scr * 1.15 + ref * (0.03 + 0.6 * fre) + vec3(sheen) + pow(clamp(dot(n, hv), 0.0, 1.0), 120.0) * sh * 0.8;
  } else if (h.y < 2.5) {
    vec3 base = vec3(0.16, 0.165, 0.18);
    col = base * (0.3 + dif) * occ + ref * (0.15 + 0.6 * fre) * occ + pow(clamp(dot(n, hv), 0.0, 1.0), 60.0) * sh * 0.6;
  } else if (h.y < 3.5) {
    col = vec3(0.55, 0.56, 0.6) * (0.25 + dif) * occ + ref * 0.4 * occ;
  } else {
    col = uLed * (1.6 + 0.6 * sin(uTime * 3.0)) + ref * 0.2;
  }

  col = col / (1.0 + col * 0.45);
  col = pow(col, vec3(0.9));
  o = vec4(col, 1.0);
}`;

const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export class DeviceGL {
  constructor(canvas) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl) throw new Error("webgl2 unavailable");
    this.gl = gl;
    this.canvas = canvas;
    const prog = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VS],
      [gl.FRAGMENT_SHADER, FS],
    ]) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(prog, s);
    }
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    this.prog = prog;
    this.loc = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(prog, i).name;
      this.loc[name] = gl.getUniformLocation(prog, name);
    }
    this.vao = gl.createVertexArray();
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.zoom = 2.1;
  }

  resize(w, h, dpr) {
    // raymarching is per pixel, so cap the buffer resolution
    const s = Math.min(dpr, 1.5);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.max(1, Math.round(w * s));
    this.canvas.height = Math.max(1, Math.round(h * s));
  }

  camera(yaw, pitch, dist) {
    const ro = [Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist];
    const ww = norm([-ro[0], -ro[1] + 0.0, -ro[2]]);
    const uu = norm(cross(ww, [0, 1, 0]));
    const vv = cross(uu, ww);
    this.cam = { ro, uu, vv, ww };
    return this.cam;
  }

  /** Object-space point → CSS pixels of the canvas, plus whether its normal faces the camera. */
  project(p, nrm, bob) {
    const { ro, uu, vv, ww } = this.cam;
    const q = [p[0], p[1] + bob, p[2]];
    const d = [q[0] - ro[0], q[1] - ro[1], q[2] - ro[2]];
    const z = dot(d, ww);
    const x = (this.zoom * dot(d, uu)) / z;
    const y = (this.zoom * dot(d, vv)) / z;
    const facing = nrm ? -dot(norm(d), nrm) : 1;
    return { x: x * this.h + this.w / 2, y: this.h / 2 - y * this.h, facing };
  }

  render({ t, yaw, pitch, dist, bob, screen, glow, led }) {
    const gl = this.gl;
    const { ro, uu, vv, ww } = this.camera(yaw, pitch, dist);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, screen);
    const L = this.loc;
    gl.uniform1i(L.uScreen, 0);
    gl.uniform2f(L.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(L.uTime, t);
    gl.uniform3f(L.uRo, ...ro);
    gl.uniform3f(L.uUU, ...uu);
    gl.uniform3f(L.uVV, ...vv);
    gl.uniform3f(L.uWW, ...ww);
    gl.uniform1f(L.uZoom, this.zoom);
    gl.uniform1f(L.uBob, bob);
    gl.uniform3f(L.uGlow, ...glow);
    gl.uniform3f(L.uLed, ...led);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
