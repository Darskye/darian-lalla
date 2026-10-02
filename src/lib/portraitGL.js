// A portrait built from ~7.7k glyphs in 3D. Each glyph is an instanced quad whose
// position, depth, character and colour come from a small data texture; the "medium"
// blends between chapters: assembled cloud → topographic contours → binary terraces →
// generative swirl. Two rings of glyphs orbit the head.

import { getAtlas } from "./glyphs.js";

const VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec2 aCell;
layout(location=2) in float aRand;
uniform sampler2D uData;
uniform sampler2D uColor;
uniform vec2 uGrid;
uniform vec2 uSize;
uniform mat4 uP;
uniform mat4 uV;
uniform mat4 uM;
uniform float uTime;
uniform float uAssemble;
uniform vec4 uW;
uniform vec4 uMouse;
uniform vec4 uWave;
uniform float uN;
uniform float uIdx0;
uniform float uIdx1;
uniform float uKind;
uniform float uRing;
uniform float uLight;
out vec2 vUv;
out vec3 vCol;
out float vA;
out float vGlyph;

float hash(float n) { return fract(sin(n) * 43758.5453); }
vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.28318 * (c * t + d)); }

void main() {
  float t = uTime;
  vec3 p;
  vec3 col;
  float a = 1.0;
  float gi = 1.0;
  float scale = 1.0;

  if (uKind < 0.5) {
    ivec2 c = ivec2(aCell);
    vec4 d = texelFetch(uData, c, 0);
    vec3 pc = texelFetch(uColor, c, 0).rgb;
    float lum = d.r, dep = d.g, edge = d.b, mask = d.a;
    vec2 g = (aCell + 0.5) / uGrid;
    vec3 base = vec3((g.x - 0.5) * uSize.x, (0.5 - g.y) * uSize.y, 0.0);

    // chapter depth fields
    float zIntro = dep * 0.42;
    float zEnv = dep * 0.5 + 0.045 * sin(base.x * 7.0 + t * 1.7 + base.y * 3.0) + 0.03 * sin(base.y * 11.0 - t * 1.2);
    float zData = floor(dep * 7.0 + 0.5) / 7.0 * 0.62;
    float sw = t * 0.5 + length(base.xy) * 2.4;
    float zArt = dep * 0.85 + 0.06 * sin(sw * 2.0 + aRand * 6.28);
    base.z = zIntro * uW.x + zEnv * uW.y + zData * uW.z + zArt * uW.w;
    base.y += uW.y * 0.012 * sin(base.x * 9.0 + t * 2.0);
    vec2 swirl = vec2(cos(sw + aRand * 6.0), sin(sw * 1.3 + aRand * 4.0)) * 0.035;
    base.xy += swirl * uW.w;

    // assemble from a slow vortex of glyphs
    float delay = g.y * 0.55 + aRand * 0.25;
    float k = smoothstep(delay, delay + 0.45, uAssemble);
    float th = aRand * 6.2831 + t * 0.35;
    float ph = hash(aRand * 91.0) * 3.1416;
    vec3 cloud = vec3(cos(th) * sin(ph), cos(ph) * 0.8, sin(th) * sin(ph)) * (1.6 + hash(aRand * 13.0) * 1.4);
    p = mix(cloud, base, k);

    // cursor ripple and click shockwave, measured in the portrait plane
    vec2 dm = p.xy - uMouse.xy;
    float r2 = dot(dm, dm);
    float bump = exp(-r2 / 0.05) * uMouse.z;
    p.z += bump * 0.3;
    p.xy += normalize(dm + 1e-4) * bump * 0.05;
    float age = t - uWave.z;
    if (uWave.w > 0.0 && age > 0.0 && age < 2.0) {
      float r = length(p.xy - uWave.xy);
      float band = exp(-pow((r - age * 1.6) / 0.12, 2.0)) * (1.0 - age / 2.0);
      p.z += band * 0.35;
      lum += band * 0.5;
    }

    // glyph choice
    float ramp = 1.0 + floor(clamp(lum, 0.0, 1.0) * (uN - 2.0) + 0.5);
    float binary = lum > 0.36 ? uIdx1 : uIdx0;
    float tick = floor(t * 7.0 + aRand * 5.0);
    float wild = hash(aRand * 37.0 + tick) < 0.16 ? 1.0 + floor(hash(aRand * 11.0 + tick) * (uN - 2.0)) : ramp;
    gi = ramp;
    if (aRand < uW.z) gi = binary;
    if (aRand < uW.w * 0.9) gi = wild;

    // colour per medium
    vec3 cIntro = mix(vec3(0.55, 0.62, 0.72), vec3(0.96, 0.96, 0.94), lum);
    float contour = smoothstep(0.1, 0.0, abs(fract(dep * 11.0 - t * 0.12) - 0.5) - 0.38);
    vec3 cEnv = mix(vec3(0.05, 0.32, 0.36), vec3(0.45, 0.95, 0.85), lum) + contour * vec3(0.55, 0.75, 0.7);
    float scan = exp(-pow((g.y - fract(t * 0.18)) * 18.0, 2.0));
    vec3 cData = mix(vec3(0.12, 0.2, 0.6), vec3(0.55, 0.75, 1.0), lum) + scan * vec3(0.6, 0.7, 1.0);
    vec3 cArt = mix(pal(lum * 0.6 + dep * 0.4 + t * 0.03, vec3(0.6, 0.35, 0.45), vec3(0.45, 0.35, 0.3), vec3(1.0), vec3(0.0, 0.18, 0.35)), pc * 1.25, 0.35);
    col = cIntro * uW.x + cEnv * uW.y + cData * uW.z + cArt * uW.w;
    if (scan > 0.6 && uW.z > 0.5) gi = 1.0 + floor(hash(aRand + tick) * (uN - 2.0));
    a = mask * (0.14 + 0.86 * pow(clamp(lum, 0.0, 1.0), 0.9)) * mix(0.35, 1.0, k);
    a = clamp(a + bump * 0.4, 0.0, 1.0);
  } else {
    // orbit rings
    float i = aCell.x;
    float ring = aCell.y;
    float speed = ring < 0.5 ? 0.22 : -0.15;
    float ang = aRand * 6.2831 + t * speed * (0.6 + hash(i) * 0.8);
    float rad = (ring < 0.5 ? 1.05 : 1.42) + (hash(i * 3.7) - 0.5) * 0.1;
    vec3 q = vec3(cos(ang) * rad, (hash(i * 1.3) - 0.5) * 0.05, sin(ang) * rad);
    float tilt = ring < 0.5 ? 1.18 : 1.36;
    float tz = ring < 0.5 ? 0.32 : -0.46;
    q = vec3(q.x, q.y * cos(tilt) - q.z * sin(tilt), q.y * sin(tilt) + q.z * cos(tilt));
    q = vec3(q.x * cos(tz) - q.y * sin(tz), q.x * sin(tz) + q.y * cos(tz), q.z);
    p = q + vec3(0.0, uSize.y * 0.2, 0.0);
    gi = 1.0 + floor(hash(i * 7.1 + floor(t * 3.0 + aRand * 9.0)) * (uN - 2.0));
    vec3 accent = vec3(0.85, 0.88, 0.95) * uW.x + vec3(0.4, 0.95, 0.85) * uW.y + vec3(0.45, 0.6, 1.0) * uW.z + vec3(0.98, 0.52, 0.4) * uW.w;
    col = accent;
    a = (0.35 + 0.65 * hash(i * 5.3)) * uRing * smoothstep(0.35, 1.0, uAssemble);
    scale = 1.25;
  }

  vec4 world = uM * vec4(p, 1.0);
  vec4 view = uV * world;
  vec2 cw = vec2(uSize.x / uGrid.x, uSize.y / uGrid.y) * scale * 1.04;
  view.xy += (aCorner - 0.5) * cw;
  gl_Position = uP * view;
  float fog = clamp((7.2 + view.z) / 3.4, 0.25, 1.0);
  vUv = vec2(aCorner.x, 1.0 - aCorner.y);
  // on light paper, ink instead of light: darken by brightness, keep the hue
  float lumc = dot(col, vec3(0.299, 0.587, 0.114));
  vCol = mix(col, col * (1.0 - lumc * 0.82), uLight);
  vA = a * fog;
  vGlyph = gi;
}`;

const FS = `#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform float uN;
in vec2 vUv;
in vec3 vCol;
in float vA;
in float vGlyph;
out vec4 o;
void main() {
  float a = texture(uAtlas, vec2((vGlyph + vUv.x) / uN, vUv.y)).a * vA;
  if (a < 0.01) discard;
  o = vec4(vCol * a, a);
}`;

function compile(gl) {
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
  const loc = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const name = gl.getActiveUniform(prog, i).name;
    loc[name] = gl.getUniformLocation(prog, name);
  }
  return { prog, loc };
}

function loadPixels(url) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(img, 0, 0);
      res({ img, w: img.width, h: img.height, data: x.getImageData(0, 0, img.width, img.height).data });
    };
    img.onerror = rej;
    img.src = url;
  });
}

const perspective = (fov, aspect, n, f) => {
  const t = 1 / Math.tan(fov / 2);
  return new Float32Array([t / aspect, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, (2 * f * n) / (n - f), 0]);
};

function rotYX(yaw, pitch, tx, ty) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  // M = T * Rx * Ry  (column-major)
  return new Float32Array([cy, sp * sy, -cp * sy, 0, 0, cp, sp, 0, sy, -sp * cy, cp * cy, 0, tx, ty, 0, 1]);
}

export class PortraitGL {
  static async create(canvas, dataUrl, colorUrl) {
    const [data, color] = await Promise.all([loadPixels(dataUrl), loadPixels(colorUrl)]);
    return new PortraitGL(canvas, data, color);
  }

  constructor(canvas, data, color) {
    const gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl) throw new Error("webgl2 unavailable");
    this.gl = gl;
    this.canvas = canvas;
    this.p = compile(gl);
    this.cols = data.w;
    this.rows = data.h;
    // cells are 0.6 wide : 1 tall, so the portrait keeps the photo's proportions
    const H = 3.0;
    this.size = [H * ((this.cols * 0.6) / this.rows), H];

    const tex = (img) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      return t;
    };
    this.dataTex = tex(data.img);
    this.colorTex = tex(color.img);

    const atlas = getAtlas(30, 50);
    this.atlasN = atlas.n;
    this.idx0 = Math.max(1, atlas.ramp.indexOf("0"));
    this.idx1 = Math.max(1, atlas.ramp.indexOf("1"));
    this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // instances: one per visible cell
    const cells = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const m = data.data[(r * this.cols + c) * 4 + 3];
        if (m > 90) cells.push(c, r, rnd());
      }
    this.count = cells.length / 3;
    const ring = [];
    for (let i = 0; i < 1100; i++) ring.push(i, i < 600 ? 0 : 1, rnd());
    this.ringCount = ring.length / 3;

    const quad = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const mkVao = (inst) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const qb = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, qb);
      gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      const ib = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, ib);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inst), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 12, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 12, 8);
      gl.vertexAttribDivisor(2, 1);
      gl.bindVertexArray(null);
      return vao;
    };
    this.vao = mkVao(cells);
    this.ringVao = mkVao(ring);
  }

  resize(w, h, dpr) {
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.aspect = w / Math.max(1, h);
  }

  /** Mouse in NDC of this canvas → point on the portrait plane (approximate, ignores the tilt). */
  planePoint(nx, ny) {
    const fov = this.fov || 0.62;
    const halfH = Math.tan(fov / 2) * this.dist;
    return [nx * halfH * this.aspect - this.offsetX, ny * halfH - this.offsetY];
  }

  render(s) {
    const gl = this.gl;
    const { t, assemble, w, yaw, pitch, mouse, wave, offsetX = 0, ring = 1, light = 0 } = s;
    this.offsetX = offsetX;
    this.offsetY = -0.3;
    this.dist = this.aspect < 0.9 ? 5.6 : 4.7;
    this.fov = 0.62;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.p.prog);
    const L = this.p.loc;
    gl.uniformMatrix4fv(L.uP, false, perspective(this.fov, this.aspect, 0.1, 30));
    gl.uniformMatrix4fv(L.uV, false, new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -this.dist, 1]));
    gl.uniformMatrix4fv(L.uM, false, rotYX(yaw, pitch, offsetX, this.offsetY));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex);
    gl.uniform1i(L.uData, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.colorTex);
    gl.uniform1i(L.uColor, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.uniform1i(L.uAtlas, 2);
    gl.uniform2f(L.uGrid, this.cols, this.rows);
    gl.uniform2f(L.uSize, this.size[0], this.size[1]);
    gl.uniform1f(L.uTime, t);
    gl.uniform1f(L.uAssemble, assemble);
    gl.uniform4f(L.uW, w[0], w[1], w[2], w[3]);
    gl.uniform4f(L.uMouse, mouse[0], mouse[1], mouse[2], 0);
    gl.uniform4f(L.uWave, wave[0], wave[1], wave[2], wave[3]);
    gl.uniform1f(L.uN, this.atlasN);
    gl.uniform1f(L.uIdx0, this.idx0);
    gl.uniform1f(L.uIdx1, this.idx1);
    gl.uniform1f(L.uRing, ring);
    gl.uniform1f(L.uLight, light);

    gl.uniform1f(L.uKind, 1);
    gl.bindVertexArray(this.ringVao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.ringCount);
    gl.uniform1f(L.uKind, 0);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.count);
    gl.bindVertexArray(null);
  }
}
