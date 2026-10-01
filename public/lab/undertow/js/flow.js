// WebGL2 flow renderer: GPU tracers advected through gridded velocity fields,
// drawn as fading light trails over a flat regional map or an orthographic globe.
//
// Fields are RGBA16F texture arrays, one layer per time step:
//   r, g = east / north velocity (m/s), b = a 0..1 scalar for colour, a = 1 where valid.
// A second field (B) can be shown to the right of a vertical divider (forecast vs reality).

import { PALETTES, PAL_ROWS, ramp, clamp } from "./util.js";

const R_EARTH = 6371000;

const COMMON = `
precision highp float;
precision highp sampler2DArray;
uniform sampler2DArray u_fieldA, u_fieldB;
uniform float u_day0, u_day1, u_mix;
uniform vec4 u_geo;        // lon edge, lat edge, lon span, lat span (degrees)
uniform vec2 u_res;        // device px
uniform float u_split;     // divider x in device px, < 0 when off
// region view
uniform vec2 u_D, u_c;
uniform float u_s;
// globe view
uniform vec2 u_rot, u_ctr;
uniform float u_rad;

vec4 fieldA(vec2 uv) { return mix(texture(u_fieldA, vec3(uv, u_day0)), texture(u_fieldA, vec3(uv, u_day1)), u_mix); }
vec4 fieldB(vec2 uv) { return mix(texture(u_fieldB, vec3(uv, u_day0)), texture(u_fieldB, vec3(uv, u_day1)), u_mix); }
vec4 fieldAt(vec2 uv, float sx) { return (u_split >= 0.0 && sx > u_split) ? fieldB(uv) : fieldA(uv); }

float h21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 lonlat(vec2 uv) { return radians(u_geo.xy + uv * u_geo.zw); }

vec3 projR(vec2 uv, vec2 c, float s) { return vec3(((uv - 0.5) * u_D - c) * s + 0.5 * u_res, 1.0); }
vec2 unprojR(vec2 px, vec2 c, float s) { return (c + (px - 0.5 * u_res) / s) / u_D + 0.5; }

vec3 projG(vec2 uv, vec2 rot, float rad, vec2 ctr) {
  vec2 ll = lonlat(uv);
  float cl = cos(ll.y), sl = sin(ll.y), c0 = cos(rot.y), s0 = sin(rot.y), dl = ll.x - rot.x;
  vec3 p = vec3(cl * sin(dl), c0 * sl - s0 * cl * cos(dl), s0 * sl + c0 * cl * cos(dl));
  return vec3(ctr + rad * p.xy, p.z);
}
bool unprojG(vec2 px, vec2 rot, float rad, vec2 ctr, out vec2 uv) {
  vec2 p = (px - ctr) / rad;
  float r2 = dot(p, p);
  if (r2 >= 1.0) return false;
  float z = sqrt(1.0 - r2), c0 = cos(rot.y), s0 = sin(rot.y);
  float lat = asin(clamp(p.y * c0 + z * s0, -1.0, 1.0));
  float lon = rot.x + atan(p.x, z * c0 - p.y * s0);
  vec2 ll = degrees(vec2(lon, lat));
  uv = (ll - u_geo.xy) / u_geo.zw;
  uv.x = fract(uv.x);
  return true;
}
#ifdef GLOBE
vec3 project(vec2 uv) { return projG(uv, u_rot, u_rad, u_ctr); }
bool unproject(vec2 px, out vec2 uv) { return unprojG(px, u_rot, u_rad, u_ctr, uv); }
#else
vec3 project(vec2 uv) { return projR(uv, u_c, u_s); }
bool unproject(vec2 px, out vec2 uv) { uv = unprojR(px, u_c, u_s); return true; }
#endif
`;

const UPDATE_VS = `
layout(location = 0) in vec4 a_state;     // uv position, age (s), id
out vec4 v_state;
uniform float u_step, u_dt, u_life, u_seed, u_wrapX;

vec2 vel(vec2 p, float sx) {
  float lat = lonlat(p).y;
  return fieldAt(p, sx).xy / vec2(111320.0 * u_geo.z * max(cos(lat), 0.05), 110574.0 * u_geo.w);
}
vec2 spawn(float id, float i) {
  vec2 r = vec2(h21(vec2(id, u_seed + i * 1.37)), h21(vec2(u_seed * 1.91 + i, id * 0.73)));
#ifdef GLOBE
  float a = r.x * 6.2831853, rr = sqrt(r.y) * 0.985;
  vec2 uv = vec2(0.5);
  unproject(u_ctr + u_rad * rr * vec2(cos(a), sin(a)), uv);
  return uv;
#else
  vec2 lo, hi;
  unproject(vec2(0.0), lo);
  unproject(u_res, hi);
  return clamp(mix(lo, hi, r), 0.0, 1.0);
#endif
}
void main() {
  vec2 p = a_state.xy;
  float age = a_state.z, id = a_state.w;
  float sx = project(p).x;
  vec2 k1 = vel(p, sx) * u_step;
  p += vel(p + 0.5 * k1, sx) * u_step;
  if (u_wrapX > 0.5) p.x = fract(p.x);
  age += u_dt;
  float life = u_life * (0.5 + h21(vec2(id, 7.1)));
  vec3 q = project(p);
  bool off = q.z <= 0.0 || q.x < -24.0 || q.y < -24.0 || q.x > u_res.x + 24.0 || q.y > u_res.y + 24.0;
  bool outside = p.y < 0.0 || p.y > 1.0 || (u_wrapX < 0.5 && (p.x < 0.0 || p.x > 1.0));
  if (age > life || off || outside || fieldAt(p, q.x).a < 0.5) {
    for (int i = 0; i < 8; i++) {
      p = spawn(id, float(i));
      if (fieldAt(p, project(p).x).a > 0.5) break;
    }
    age = 0.0;
  }
  v_state = vec4(p, age, id);
}`;

const UPDATE_FS = `out vec4 o; void main() { o = vec4(0.0); }`;

const DRAW_VS = `
layout(location = 0) in vec4 a_prev;
layout(location = 1) in vec4 a_cur;
layout(location = 2) in float a_end;
uniform int u_colorA, u_colorB;
uniform float u_rowA, u_rowB, u_vmax, u_gain, u_life;
uniform vec2 u_cell;
uniform sampler2D u_pal;
out vec3 v_col;

float spinAt(vec2 p, float sx) {
  vec2 ll = lonlat(p);
  vec2 e = u_cell;
  float mx = 111320.0 * u_geo.z * u_cell.x * max(cos(ll.y), 0.05), my = 110574.0 * u_geo.w * u_cell.y;
  float dvdx = (fieldAt(p + vec2(e.x, 0.0), sx).y - fieldAt(p - vec2(e.x, 0.0), sx).y) / (2.0 * mx);
  float dudy = (fieldAt(p + vec2(0.0, e.y), sx).x - fieldAt(p - vec2(0.0, e.y), sx).x) / (2.0 * my);
  float f = 2.0 * 7.2921e-5 * sin(ll.y);
  return clamp((dvdx - dudy) / f / 0.35, -1.0, 1.0);           // Rossby number: cyclonic > 0 in both hemispheres
}
void main() {
  bool fresh = a_cur.z < a_prev.z || a_cur.z < 1e-4;
  vec3 q0 = project(a_prev.xy), q1 = project(a_cur.xy);
  vec3 q = (a_end < 0.5 && !fresh) ? q0 : q1;
  gl_Position = vec4(q.xy / u_res * 2.0 - 1.0, 0.0, 1.0);
  bool sideB = u_split >= 0.0 && q1.x > u_split;
  vec4 f = sideB ? fieldB(a_cur.xy) : fieldA(a_cur.xy);
  int mode = sideB ? u_colorB : u_colorA;
  float sn = sqrt(clamp(length(f.xy) / u_vmax, 0.0, 1.0));
  float x, bright;
  if (mode == 0) { x = f.z; bright = 0.16 + 0.84 * sn * sn; }
  else if (mode == 1) { x = sn; bright = 0.14 + 0.86 * sn * sn; }
  else if (mode == 2) { float r = spinAt(a_cur.xy, q1.x); x = 0.5 - 0.5 * r; bright = 0.12 + 0.88 * abs(r); }
  else {
    float e = clamp(length(fieldB(a_cur.xy).xy - fieldA(a_cur.xy).xy) / (0.5 * u_vmax), 0.0, 1.0);
    x = sqrt(e); bright = 0.18 + 0.82 * sqrt(e);
  }
  vec3 col = texture(u_pal, vec2(x, ((sideB ? u_rowB : u_rowA) + 0.5) / 8.0)).rgb;
  float life = u_life * (0.5 + h21(vec2(a_cur.w, 7.1)));
  float fade = smoothstep(0.0, 0.5, a_cur.z) * (1.0 - smoothstep(life - 0.6, life, a_cur.z));
  float vis = step(0.0, min(q0.z, q1.z));
#ifdef GLOBE
  vis *= smoothstep(0.0, 0.18, q1.z);
#endif
  v_col = fresh ? vec3(0.0) : col * bright * fade * step(0.5, f.a) * vis * u_gain;
}`;

const DRAW_FS = `in vec3 v_col; out vec4 o; void main() { o = vec4(v_col, 1.0); }`;

const QUAD_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FADE_FS = `
uniform sampler2D u_prev;
uniform float u_fade;
uniform bool u_q8;
uniform vec2 u_c0, u_rot0, u_ctr0;
uniform float u_s0, u_rad0;
out vec4 o;
void main() {
  // Re-project last frame's trails into the current view, so pans, zooms and spins keep them.
  vec2 uv;
  vec4 c = vec4(0.0);
  if (unproject(gl_FragCoord.xy, uv)) {
#ifdef GLOBE
    vec3 q = projG(uv, u_rot0, u_rad0, u_ctr0);
#else
    vec3 q = projR(uv, u_c0, u_s0);
#endif
    vec2 t = q.xy / u_res;
    if (q.z > 0.0 && all(greaterThanEqual(t, vec2(0.0))) && all(lessThanEqual(t, vec2(1.0)))) c = texture(u_prev, t);
  }
  c *= u_fade;
  if (u_q8) c = floor(c * 255.0) / 255.0;
  o = c;
}`;

const COMPOSE_FS = `
uniform sampler2D u_trail, u_pal;
uniform vec2 u_tex, u_cell;
uniform float u_dpr, u_exposure, u_time, u_vmax;
uniform int u_bgA, u_bgB;
uniform float u_rowA, u_rowB, u_contour;
// globe extras
uniform sampler2D u_land;
uniform sampler2DArray u_rain, u_pres;
uniform vec4 u_geo1;
uniform float u_rainOn, u_presOn, u_tint;
uniform vec3 u_sun;
out vec4 o;

vec4 cubicW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) / 6.0;
}
vec4 bicubic(sampler2DArray t, vec2 uv, float layer) {
  vec2 q = uv * u_tex - 0.5, f = fract(q);
  q -= f;
  vec4 xc = cubicW(f.x), yc = cubicW(f.y);
  vec4 c = q.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 off = (c + vec4(xc.yw, yc.yw) / s) / u_tex.xxyy;
  vec4 a = texture(t, vec3(off.xz, layer)), b = texture(t, vec3(off.yz, layer));
  vec4 d = texture(t, vec3(off.xw, layer)), e = texture(t, vec3(off.yw, layer));
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(e, d, sx), mix(b, a, sx), sy);
}
vec4 smoothA(vec2 uv) { return mix(bicubic(u_fieldA, uv, u_day0), bicubic(u_fieldA, uv, u_day1), u_mix); }
vec4 smoothB(vec2 uv) { return mix(bicubic(u_fieldB, uv, u_day0), bicubic(u_fieldB, uv, u_day1), u_mix); }
vec3 pal(float x, float row) { return texture(u_pal, vec2(x, (row + 0.5) / 8.0)).rgb; }

vec3 tint(int bg, float row, vec4 f, vec2 uv, bool sideB) {
  if (bg == 0) return pal(f.z, row);
  if (bg == 1) return pal(sqrt(clamp(length(f.xy) / u_vmax, 0.0, 1.0)), row) * 0.8;
  if (bg == 2) {
    vec2 ll = lonlat(uv), e = u_cell;
    float mx = 111320.0 * u_geo.z * e.x * max(cos(ll.y), 0.05), my = 110574.0 * u_geo.w * e.y;
    float sx = sideB ? u_res.x : 0.0;
    float dvdx = (fieldAt(uv + vec2(e.x, 0.0), sx).y - fieldAt(uv - vec2(e.x, 0.0), sx).y) / (2.0 * mx);
    float dudy = (fieldAt(uv + vec2(0.0, e.y), sx).x - fieldAt(uv - vec2(0.0, e.y), sx).x) / (2.0 * my);
    float r = clamp((dvdx - dudy) / (2.0 * 7.2921e-5 * sin(ll.y)) / 0.35, -1.0, 1.0);
    return pal(0.5 - 0.5 * r, row) * abs(r);
  }
  if (bg == 3) {
    float e = clamp(length(smoothB(uv).xy - smoothA(uv).xy) / (0.5 * u_vmax), 0.0, 1.0);
    return pal(sqrt(e), row) * sqrt(e) * 1.6;
  }
  return vec3(0.0);
}

float gridLine(float v, float step, float pxPer) {
  float d = abs(fract(v / step + 0.5) - 0.5) * step * pxPer;
  return 1.0 - smoothstep(0.0, u_dpr, d);
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec3 abyss = vec3(0.016, 0.027, 0.051);
  vec3 col = abyss;
  vec2 uv;
#ifdef GLOBE
  vec2 pp = (px - u_ctr) / u_rad;
  float rr = length(pp);
  vec3 space = mix(vec3(0.02, 0.03, 0.06), vec3(0.008, 0.01, 0.02), clamp(length(px / u_res - 0.5) * 1.4, 0.0, 1.0));
  col = space;
  if (unproject(px, uv)) {
    float z = sqrt(max(1.0 - rr * rr, 0.0));
    vec2 ll = lonlat(uv);
    vec3 n = vec3(cos(ll.y) * cos(ll.x), cos(ll.y) * sin(ll.x), sin(ll.y));
    float land = texture(u_land, uv).r;
    vec4 f = smoothA(uv);
    vec3 sea = vec3(0.018, 0.035, 0.07) + tint(u_bgA, u_rowA, f, uv, false) * u_tint;
    vec3 ground = vec3(0.07, 0.075, 0.085) + tint(u_bgA, u_rowA, f, uv, false) * u_tint * 0.8;
    col = mix(sea, ground, smoothstep(0.35, 0.65, land));
    float w = max(fwidth(land), 1e-4);
    col += (1.0 - smoothstep(0.0, 1.4 * w, abs(land - 0.5))) * 0.22;
    if (u_rainOn > 0.5) {
      float r = texture(u_rain, vec3(uv, u_day0)).r * (1.0 - u_mix) + texture(u_rain, vec3(uv, u_day1)).r * u_mix;
      col += vec3(0.45, 0.78, 1.0) * smoothstep(0.05, 0.5, r) * 0.7;
    }
    if (u_presOn > 0.5) {
      vec2 uv1 = (degrees(ll) - u_geo1.xy) / u_geo1.zw;
      uv1.x = fract(uv1.x);
      float p = (texture(u_pres, vec3(uv1, u_day0)).r * (1.0 - u_mix) + texture(u_pres, vec3(uv1, u_day1)).r * u_mix) * 110.0 + 940.0;
      float fw = max(fwidth(p), 1e-3);
      float d4 = abs(fract(p / 4.0 + 0.5) - 0.5) * 4.0 / fw;
      float d20 = abs(fract(p / 20.0 + 0.5) - 0.5) * 20.0 / fw;
      col += (1.0 - smoothstep(0.0, 1.0, d4)) * 0.1 + (1.0 - smoothstep(0.0, 1.3, d20)) * 0.16;
    }
    vec2 lld = degrees(ll);
    float pxPerDeg = u_rad * 0.01745 * max(z, 0.2);
    col += min(gridLine(lld.x, 15.0, pxPerDeg * cos(ll.y)) + gridLine(lld.y, 15.0, pxPerDeg), 1.0) * 0.035;
    float day = smoothstep(-0.12, 0.18, dot(n, u_sun));
    col *= mix(0.42, 1.0, day);
    col *= 0.55 + 0.45 * pow(z, 0.6);
    col += vec3(0.25, 0.5, 0.95) * pow(1.0 - z, 3.0) * 0.35;                       // rim light
  }
  float glow = exp(-max(rr - 1.0, 0.0) * u_rad / (22.0 * u_dpr)) * step(1.0, rr);
  col += vec3(0.22, 0.45, 0.95) * glow * 0.32;
#else
  unproject(px, uv);
  if (all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)))) {
    bool sideB = u_split >= 0.0 && px.x > u_split;
    vec4 f = sideB ? smoothB(uv) : smoothA(uv);
    vec3 sea = abyss + tint(sideB ? u_bgB : u_bgA, sideB ? u_rowB : u_rowA, f, uv, sideB) * 0.1;
    vec2 g = mod(px, 8.0 * u_dpr) - 4.0 * u_dpr;
    vec3 ground = vec3(0.045, 0.052, 0.066) + (1.0 - smoothstep(0.6 * u_dpr, 0.6 * u_dpr + 1.0, length(g))) * 0.05;
    col = mix(ground, sea, smoothstep(0.4, 0.6, f.a));
    float w = max(fwidth(f.a), 1e-4);
    col += (1.0 - smoothstep(0.0, 1.3 * w, abs(f.a - 0.5))) * 0.26;
    if (u_contour > 0.0 && f.a > 0.5) {                                             // +2 degC heatwave outline
      float fw = max(fwidth(f.z), 1e-4);
      float line = 1.0 - smoothstep(0.0, 1.2 * fw, abs(f.z - u_contour));
      float dash = step(0.5, fract((px.x + px.y) / (10.0 * u_dpr)));
      col += vec3(1.0, 0.62, 0.45) * line * dash * 0.55;
    }
    vec2 ll = degrees(lonlat(uv));
    float cosc = u_D.x / max(u_geo.z, 1e-3);
    col += min(gridLine(ll.x, 5.0, u_s * cosc) + gridLine(ll.y, 5.0, u_s), 1.0) * 0.045;
  }
  if (u_split >= 0.0) col += vec3(0.95) * (1.0 - smoothstep(0.0, 1.5 * u_dpr, abs(px.x - u_split))) * 0.8;
#endif
  vec3 tr = texture(u_trail, px / u_res).rgb;
  col += 1.0 - exp(-tr * u_exposure);
  vec2 q = px / u_res - 0.5;
  col *= 1.0 - 0.34 * smoothstep(0.3, 0.8, length(q));
  col += (fract(sin(dot(px + fract(u_time) * 97.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.02;
  o = vec4(col, 1.0);
}`;

function header(globe) {
  return `#version 300 es\n${globe ? "#define GLOBE\n" : ""}${COMMON}`;
}

export class Flow {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance", preserveDrawingBuffer: false });
    if (!gl) throw new Error("webgl2");
    this.gl = gl;
    this.floatTrails = !!gl.getExtension("EXT_color_buffer_float");
    this.progs = {};
    for (const g of [false, true]) {
      const k = g ? "G" : "R";
      this.progs["update" + k] = this.program(header(g) + UPDATE_VS, header(g) + UPDATE_FS, ["v_state"]);
      this.progs["draw" + k] = this.program(header(g) + DRAW_VS, header(g) + DRAW_FS);
      this.progs["fade" + k] = this.program(QUAD_VS, header(g) + FADE_FS);
      this.progs["compose" + k] = this.program(QUAD_VS, header(g) + COMPOSE_FS);
    }
    this.pal = this.texture2D(256, PAL_ROWS.length, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, (() => {
      const rows = new Uint8Array(256 * 4 * PAL_ROWS.length);
      PAL_ROWS.forEach((name, i) => rows.set(ramp(PALETTES[name]), i * 256 * 4));
      return rows;
    })(), gl.LINEAR, gl.CLAMP_TO_EDGE);
    this.emptyVAO = gl.createVertexArray();
    this.endBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.endBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    // 1x1 placeholders so every sampler always has something bound
    this.blankArray = this.textureArray(1, 1, 1, new Float32Array(4));
    this.blankR8 = this.textureArrayR8(1, 1, 1, new Uint8Array(1));
    this.blank2D = this.texture2D(1, 1, gl.R8, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(1), gl.LINEAR, gl.CLAMP_TO_EDGE);

    this.globe = false;
    this.fieldA = this.fieldB = this.blankArray;
    this.frames = 1;
    this.tex = [1, 1];
    this.geo = { lonEdge: 0, latEdge: 0, lonSpan: 1, latSpan: 1 };
    this.overlay = { rain: this.blankR8, pres: this.blankR8, land: this.blank2D, geo1: [0, 0, 1, 1] };
    this.view = { cx: 0, cy: 0, z: 1, s: 1, lon: 0, lat: 0, zoom: 1 };
    this.last = null;
    this.style = { colorA: 0, colorB: 0, rowA: 0, rowB: 0, bgA: 0, bgB: 0, split: -1, contour: 0, rainOn: 0, presOn: 0, tint: 0.1, sun: [1, 0, 0] };
    this.t = 0;
    this.vmax = 1;
    this.pxPerSec = 150;
    this.life = 3.6;
    this.fade = 0.955;
    this.gain = 0.13;
    this.exposure = 2.1;
    this.density = 1;
    this.wrapX = 0;
    this.parts = null;
    this.trails = [];
    this.cur = 0;
    this.tcur = 0;
    this.seed = 0;
    this.resize();
  }

  // ---------------------------------------------------------------- GL plumbing
  program(vs, fs, varyings) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const lines = src.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
        throw new Error(gl.getShaderInfoLog(s) + "\n" + lines.slice(0, 4000));
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    if (varyings) gl.transformFeedbackVaryings(p, varyings, gl.SEPARATE_ATTRIBS);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
  texture2D(w, h, internal, format, type, data, filter, wrap) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  textureArray(w, h, n, rgbaFloat, wrapX = false) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA16F, w, h, n, 0, gl.RGBA, gl.FLOAT, rgbaFloat);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, wrapX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  textureArrayR8(w, h, n, bytes, wrapX = false) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.R8, w, h, n, 0, gl.RED, gl.UNSIGNED_BYTE, bytes);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, wrapX ? gl.REPEAT : gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }
  landTexture(w, h, bytes) {
    const gl = this.gl;
    return this.texture2D(w, h, gl.R8, gl.RED, gl.UNSIGNED_BYTE, bytes, gl.LINEAR, gl.REPEAT);
  }
  deleteTexture(t) {
    if (t && t !== this.blankArray && t !== this.blankR8 && t !== this.blank2D) this.gl.deleteTexture(t);
  }

  // ---------------------------------------------------------------- scene setup
  /** geo: { W, H, lonEdge, latEdge, lonSpan, latSpan, global } */
  setScene(geo, fieldA, frames, vmax, fieldB = null) {
    this.globe = !!geo.global;
    this.wrapX = geo.global ? 1 : 0;
    this.geo = geo;
    this.fieldA = fieldA;
    this.fieldB = fieldB || fieldA;
    this.frames = frames;
    this.tex = [geo.W, geo.H];
    this.vmax = vmax;
    const latc = geo.latEdge + geo.latSpan / 2;
    this.cosc = Math.cos((latc * Math.PI) / 180);
    this.D = [geo.lonSpan * this.cosc, geo.latSpan];
    this.clearTrails();
    this.last = null;
    this.makeParticles();
  }
  setFieldB(tex) { this.fieldB = tex || this.fieldA; }
  setOverlay(o) { Object.assign(this.overlay, o); }

  // region view: centre (map degrees, lon scaled by cos(latc)) + zoom; globe view: centre lon/lat + zoom
  regionFocus(lon, lat, zoom = 1) {
    const g = this.geo;
    this.view.cx = (lon - (g.lonEdge + g.lonSpan / 2)) * this.cosc;
    this.view.cy = lat - (g.latEdge + g.latSpan / 2);
    this.view.z = zoom;
    this.clampView();
  }
  globeFocus(lon, lat, zoom = 1) {
    this.view.lon = lon;
    this.view.lat = lat;
    this.view.zoom = zoom;
    this.clampView();
  }
  clampView() {
    const v = this.view;
    if (this.globe) {
      v.zoom = clamp(v.zoom, 0.7, 4);
      v.lat = clamp(v.lat, -75, 75);
      v.lon = ((v.lon + 540) % 360) - 180;
      this.rad = Math.min(this.W, this.H) * 0.42 * v.zoom;
      this.ctr = [this.W * this.globeX, this.H * 0.5];
      return;
    }
    v.z = clamp(v.z, 1, 6);
    const base = Math.max(this.W / this.D[0], this.H / this.D[1]);
    v.s = base * v.z;
    const hx = this.W / (2 * v.s), hy = this.H / (2 * v.s);
    v.cx = hx >= this.D[0] / 2 ? 0 : clamp(v.cx, -this.D[0] / 2 + hx, this.D[0] / 2 - hx);
    v.cy = hy >= this.D[1] / 2 ? 0 : clamp(v.cy, -this.D[1] / 2 + hy, this.D[1] / 2 - hy);
  }
  panBy(dxCss, dyCss) {
    const v = this.view, d = this.dpr;
    if (this.globe) {
      v.lon -= ((dxCss * d) / this.rad) * (180 / Math.PI);
      v.lat += ((dyCss * d) / this.rad) * (180 / Math.PI);
    } else {
      v.cx -= (dxCss * d) / v.s;
      v.cy += (dyCss * d) / v.s;
    }
    this.clampView();
  }
  zoomAt(clientX, clientY, factor) {
    const v = this.view;
    if (this.globe) { v.zoom *= factor; this.clampView(); return; }
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * this.dpr - this.W / 2, py = (r.height - (clientY - r.top)) * this.dpr - this.H / 2;
    const mx = v.cx + px / v.s, my = v.cy + py / v.s;
    v.z *= factor;
    this.clampView();
    v.cx = mx - px / v.s;
    v.cy = my - py / v.s;
    this.clampView();
  }

  /** lon/lat (degrees) -> CSS px, with a visibility flag (globe back side, off screen). */
  toScreen(lon, lat) {
    const d = this.dpr, g = this.geo;
    if (this.globe) {
      const v = this.view, rl = (lon * Math.PI) / 180, rp = (lat * Math.PI) / 180;
      const l0 = (v.lon * Math.PI) / 180, p0 = (v.lat * Math.PI) / 180;
      const x = Math.cos(rp) * Math.sin(rl - l0);
      const y = Math.cos(p0) * Math.sin(rp) - Math.sin(p0) * Math.cos(rp) * Math.cos(rl - l0);
      const z = Math.sin(p0) * Math.sin(rp) + Math.cos(p0) * Math.cos(rp) * Math.cos(rl - l0);
      return { x: (this.ctr[0] + this.rad * x) / d, y: (this.H - (this.ctr[1] + this.rad * y)) / d, visible: z > 0.15, z };
    }
    const v = this.view;
    const mx = (lon - (g.lonEdge + g.lonSpan / 2)) * this.cosc, my = lat - (g.latEdge + g.latSpan / 2);
    const x = ((mx - v.cx) * v.s + this.W / 2) / d, y = (this.H - ((my - v.cy) * v.s + this.H / 2)) / d;
    return { x, y, visible: x > -40 && y > -40 && x < this.W / d + 40 && y < this.H / d + 40, z: 1 };
  }
  /** CSS client px -> { lon, lat } or null */
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = (clientX - r.left) * this.dpr, py = (r.height - (clientY - r.top)) * this.dpr;
    const g = this.geo;
    if (this.globe) {
      const v = this.view, p = [(px - this.ctr[0]) / this.rad, (py - this.ctr[1]) / this.rad];
      const r2 = p[0] * p[0] + p[1] * p[1];
      if (r2 >= 1) return null;
      const z = Math.sqrt(1 - r2), p0 = (v.lat * Math.PI) / 180;
      const lat = Math.asin(p[1] * Math.cos(p0) + z * Math.sin(p0));
      const lon = (v.lon * Math.PI) / 180 + Math.atan2(p[0], z * Math.cos(p0) - p[1] * Math.sin(p0));
      return { lon: ((((lon * 180) / Math.PI) + 540) % 360) - 180, lat: (lat * 180) / Math.PI };
    }
    const v = this.view;
    const mx = v.cx + (px - this.W / 2) / v.s, my = v.cy + (py - this.H / 2) / v.s;
    const lon = g.lonEdge + g.lonSpan / 2 + mx / this.cosc, lat = g.latEdge + g.latSpan / 2 + my;
    if (lon < g.lonEdge || lon > g.lonEdge + g.lonSpan || lat < g.latEdge || lat > g.latEdge + g.latSpan) return null;
    return { lon, lat };
  }
  /** tracer speed-up relative to real water (ocean seconds per real second) */
  timeLapse() {
    const pxPerMetre = this.globe ? this.rad / R_EARTH : (this.view.s / 110574);
    return (this.pxPerSec * this.dpr) / pxPerMetre / this.vmax;
  }

  // ---------------------------------------------------------------- buffers
  resize() {
    const c = this.canvas;
    const w = c.clientWidth || 1, h = c.clientHeight || 1;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w * h * dpr * dpr > 5.2e6) dpr = Math.sqrt(5.2e6 / (w * h));
    this.dpr = dpr;
    this.W = c.width = Math.max(1, Math.round(w * dpr));
    this.H = c.height = Math.max(1, Math.round(h * dpr));
    this.globeX = w > 900 ? 0.56 : 0.5;
    this.makeTrails();
    if (this.D) { this.clampView(); this.last = null; this.makeParticles(); }
  }
  makeTrails() {
    const gl = this.gl;
    this.trails.forEach((t) => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); });
    this.trails = [0, 1].map(() => {
      const tex = this.floatTrails
        ? this.texture2D(this.W, this.H, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT, null, gl.LINEAR, gl.CLAMP_TO_EDGE)
        : this.texture2D(this.W, this.H, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, null, gl.LINEAR, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return { tex, fbo };
    });
    this.clearTrails();
  }
  clearTrails() {
    const gl = this.gl;
    this.trails.forEach((t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
  particleCount() {
    const css = (this.W * this.H) / (this.dpr * this.dpr);
    return Math.round(clamp((css / 7) * this.density, 12000, 220000));
  }
  makeParticles() {
    const gl = this.gl;
    const N = this.particleCount();
    if (this.parts) {
      this.parts.bufs.forEach((b) => gl.deleteBuffer(b));
      this.parts.upd.concat(this.parts.draw).forEach((v) => gl.deleteVertexArray(v));
      this.parts.tf.forEach((t) => gl.deleteTransformFeedback(t));
    }
    const init = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      init[i * 4] = Math.random();
      init[i * 4 + 1] = Math.random();
      init[i * 4 + 2] = 99;                         // start "dead" so the first update spawns them in view
      init[i * 4 + 3] = Math.random() * 1000;
    }
    const bufs = [0, 1].map(() => {
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, init, gl.DYNAMIC_COPY);
      return b;
    });
    const upd = bufs.map((b) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      return vao;
    });
    const draw = [0, 1].map((i) => {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[i]);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(0, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, bufs[1 - i]);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(1, 1);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.endBuf);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
      return vao;
    });
    const tf = bufs.map((b) => {
      const t = gl.createTransformFeedback();
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, t);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, b);
      return t;
    });
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.parts = { N, bufs, upd, draw, tf };
    this.cur = 0;
  }

  // ---------------------------------------------------------------- per-frame
  common(P) {
    const gl = this.gl, u = P.u, v = this.view, g = this.geo;
    const d0 = Math.floor(this.t), d1 = Math.min(d0 + 1, this.frames - 1);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.fieldA);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.fieldB);
    gl.uniform1i(u.u_fieldA, 0);
    gl.uniform1i(u.u_fieldB, 1);
    gl.uniform1f(u.u_day0, d0);
    gl.uniform1f(u.u_day1, d1);
    gl.uniform1f(u.u_mix, this.t - d0);
    gl.uniform4f(u.u_geo, g.lonEdge, g.latEdge, g.lonSpan, g.latSpan);
    gl.uniform2f(u.u_res, this.W, this.H);
    gl.uniform1f(u.u_split, this.style.split >= 0 ? this.style.split * this.dpr : -1);
    gl.uniform2f(u.u_D, this.D[0], this.D[1]);
    gl.uniform2f(u.u_c, v.cx, v.cy);
    gl.uniform1f(u.u_s, v.s);
    gl.uniform2f(u.u_rot, (v.lon * Math.PI) / 180, (v.lat * Math.PI) / 180);
    gl.uniform2f(u.u_ctr, this.ctr ? this.ctr[0] : 0, this.ctr ? this.ctr[1] : 0);
    gl.uniform1f(u.u_rad, this.rad || 1);
  }

  frame(dt, now) {
    if (!this.parts || !this.D) return;
    const gl = this.gl, k = this.globe ? "G" : "R", st = this.style, v = this.view;
    this.clampView();
    if (!this.last) this.last = { cx: v.cx, cy: v.cy, s: v.s, lon: v.lon, lat: v.lat, rad: this.rad, ctr: this.ctr && [...this.ctr] };
    this.seed = (this.seed + 0.6180339) % 97;

    // 1. advect tracers (transform feedback, buffer cur -> 1-cur)
    let P = this.progs["update" + k];
    gl.useProgram(P.p);
    this.common(P);
    gl.uniform1f(P.u.u_step, this.timeLapse() * dt);
    gl.uniform1f(P.u.u_dt, dt);
    gl.uniform1f(P.u.u_life, this.life);
    gl.uniform1f(P.u.u_seed, this.seed);
    gl.uniform1f(P.u.u_wrapX, this.wrapX);
    gl.bindVertexArray(this.parts.upd[this.cur]);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.parts.tf[1 - this.cur]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.parts.N);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);

    // 2. fade + re-project last frame's trails
    gl.viewport(0, 0, this.W, this.H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.trails[1 - this.tcur].fbo);
    gl.bindVertexArray(this.emptyVAO);
    P = this.progs["fade" + k];
    gl.useProgram(P.p);
    this.common(P);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.trails[this.tcur].tex);
    gl.uniform1i(P.u.u_prev, 2);
    gl.uniform1f(P.u.u_fade, Math.pow(this.fade, dt * 60));
    gl.uniform1i(P.u.u_q8, this.floatTrails ? 0 : 1);
    const L = this.last;
    gl.uniform2f(P.u.u_c0, L.cx, L.cy);
    gl.uniform1f(P.u.u_s0, L.s);
    gl.uniform2f(P.u.u_rot0, (L.lon * Math.PI) / 180, (L.lat * Math.PI) / 180);
    gl.uniform1f(P.u.u_rad0, L.rad || 1);
    gl.uniform2f(P.u.u_ctr0, L.ctr ? L.ctr[0] : 0, L.ctr ? L.ctr[1] : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.last = { cx: v.cx, cy: v.cy, s: v.s, lon: v.lon, lat: v.lat, rad: this.rad, ctr: this.ctr && [...this.ctr] };

    // 3. draw each tracer's latest step as a line, added on top
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    P = this.progs["draw" + k];
    gl.useProgram(P.p);
    this.common(P);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(P.u.u_pal, 3);
    gl.uniform1i(P.u.u_colorA, st.colorA);
    gl.uniform1i(P.u.u_colorB, st.colorB);
    gl.uniform1f(P.u.u_rowA, st.rowA);
    gl.uniform1f(P.u.u_rowB, st.rowB);
    gl.uniform1f(P.u.u_vmax, this.vmax);
    gl.uniform1f(P.u.u_gain, this.gain * Math.pow(this.dpr, 0.6) * Math.sqrt(dt * 60));
    gl.uniform1f(P.u.u_life, this.life);
    gl.uniform2f(P.u.u_cell, 1 / this.tex[0], 1 / this.tex[1]);
    gl.bindVertexArray(this.parts.draw[this.cur]);
    gl.drawArraysInstanced(gl.LINES, 0, 2, this.parts.N);
    gl.disable(gl.BLEND);

    // 4. compose to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(this.emptyVAO);
    P = this.progs["compose" + k];
    gl.useProgram(P.p);
    this.common(P);
    const u = P.u;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.trails[1 - this.tcur].tex);
    gl.uniform1i(u.u_trail, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.pal);
    gl.uniform1i(u.u_pal, 3);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.overlay.land);
    gl.uniform1i(u.u_land, 4);
    gl.activeTexture(gl.TEXTURE5);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.overlay.rain);
    gl.uniform1i(u.u_rain, 5);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.overlay.pres);
    gl.uniform1i(u.u_pres, 6);
    gl.uniform4f(u.u_geo1, ...this.overlay.geo1);
    gl.uniform2f(u.u_tex, this.tex[0], this.tex[1]);
    gl.uniform2f(u.u_cell, 1 / this.tex[0], 1 / this.tex[1]);
    gl.uniform1f(u.u_dpr, this.dpr);
    gl.uniform1f(u.u_exposure, this.exposure);
    gl.uniform1f(u.u_time, now / 1000);
    gl.uniform1f(u.u_vmax, this.vmax);
    gl.uniform1i(u.u_bgA, st.bgA);
    gl.uniform1i(u.u_bgB, st.bgB);
    gl.uniform1f(u.u_rowA, st.rowA);
    gl.uniform1f(u.u_rowB, st.rowB);
    gl.uniform1f(u.u_contour, st.contour);
    gl.uniform1f(u.u_rainOn, st.rainOn);
    gl.uniform1f(u.u_presOn, st.presOn);
    gl.uniform1f(u.u_tint, st.tint);
    gl.uniform3f(u.u_sun, ...st.sun);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    this.cur = 1 - this.cur;
    this.tcur = 1 - this.tcur;
  }
}
