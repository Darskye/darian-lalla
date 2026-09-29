// Two-pass ASCII renderer.
// Pass 1 raymarches a morphing SDF sculpture into a tiny buffer (one texel per character cell).
// Pass 2 turns that buffer into glyphs sampled from a density-sorted atlas.

export const VS = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export const SCENE_FS = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uAspect;
uniform float uTime;
uniform float uStage;
uniform vec2 uMouse;
uniform float uZoom;
uniform float uShift;
uniform vec3 uNodes[15];
uniform vec4 uBalls[6];
out vec4 fragColor;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float smin(float a, float b, float k) { float h = clamp(.5 + .5 * (b - a) / k, 0., 1.); return mix(b, a, h) - k * h * (1. - h); }
vec3 hash3(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
float sdCap(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }

// 01 RAW DATA: a jittered point cloud
float sData(vec3 p) {
  float bound = length(p) - 1.6;
  if (bound > .3) return bound;
  const float S = 3.0;
  vec3 q = p * S;
  vec3 id = floor(q);
  vec3 f = q - id;
  vec3 h = hash3(id + 7.);
  vec3 c = .3 + .4 * h + .08 * sin(uTime * .9 + h * 6.283);
  float r = .11 + .08 * h.z;
  bool keep = h.x > .42 && length((id + .5) / S) < 1.45;
  float wall = min(min(min(f.x, 1. - f.x), min(f.y, 1. - f.y)), min(f.z, 1. - f.z)) + .03;
  float dp = keep ? length(f - c) - r : 1e3;
  return min(dp, wall) / S;
}

// 02 CLUSTERING: metaballs finding their centroids
float sClusters(vec3 p) {
  float d = 1e3;
  for (int i = 0; i < 6; i++) d = smin(d, length(p - uBalls[i].xyz) - uBalls[i].w, .55);
  return d;
}

// 03 NEURAL NET: 3-5-5-2 layers, fully connected
float sNet(vec3 p) {
  float bound = length(p) - 1.95;
  if (bound > .4) return bound;
  float d = 1e3;
  for (int i = 0; i < 15; i++) d = min(d, length(p - uNodes[i]) - .16);
  for (int i = 0; i < 3; i++) for (int j = 3; j < 8; j++) d = min(d, sdCap(p, uNodes[i], uNodes[j], .024));
  for (int i = 3; i < 8; i++) for (int j = 8; j < 13; j++) d = min(d, sdCap(p, uNodes[i], uNodes[j], .024));
  for (int i = 8; i < 13; i++) for (int j = 13; j < 15; j++) d = min(d, sdCap(p, uNodes[i], uNodes[j], .024));
  return d;
}

// 04 MODEL: gyroid lattice bounded by a sphere
float sModel(vec3 p) {
  float sph = length(p) - 1.35;
  vec3 q = p * 2.8;
  q.xy *= rot(uTime * .12);
  float g = abs(dot(sin(q), cos(q.yzx))) - .38;
  return max(sph, g / (2.8 * 1.7));
}

// 05 SIGNAL: twisted ribbon torus
float sSignal(vec3 p) {
  p.xy *= rot(.5);
  float a = atan(p.z, p.x);
  vec2 q = vec2(length(p.xz) - 1.05, p.y);
  q *= rot(a * 1.5 + uTime * .7);
  vec2 b = abs(q) - vec2(.36, .09);
  return (length(max(b, 0.)) + min(max(b.x, b.y), 0.) - .03) * .6;
}

float shape(int i, vec3 p) {
  if (i == 0) return sData(p);
  if (i == 1) return sClusters(p);
  if (i == 2) return sNet(p);
  if (i == 3) return sModel(p);
  return sSignal(p);
}

int sa; int sb; float sf;
float map(vec3 p) {
  if (sf <= 0.) return shape(sa, p);
  if (sf >= 1.) return shape(sb, p);
  return mix(shape(sa, p), shape(sb, p), sf);
}

void main() {
  sa = int(floor(uStage)) % 5;
  sb = (sa + 1) % 5;
  sf = smoothstep(.72, 1., fract(uStage));

  vec2 uv = gl_FragCoord.xy / uRes * 2. - 1.;
  uv.x *= uAspect;
  uv *= max(1., 1.08 / uAspect);
  uv /= uZoom;
  uv.y += uShift; // sit the sculpture below the name

  vec3 ro = vec3(0., 0., 4.6);
  vec3 rd = normalize(vec3(uv, -2.15));
  float yaw = uTime * .18 + uMouse.x * .7;
  float pitch = .25 - uMouse.y * .45;

  float t = 0.;
  bool hit = false;
  float steps = 0.;
  vec3 q;
  for (int i = 0; i < 90; i++) {
    q = ro + rd * t;
    q.yz *= rot(pitch);
    q.xz *= rot(yaw);
    float d = map(q);
    if (d < .0015 * t) { hit = true; break; }
    t += d * .85;
    steps += 1.;
    if (t > 9.) break;
  }
  if (!hit) { fragColor = vec4(0.); return; }

  vec2 e = vec2(.002, -.002);
  vec3 n = normalize(e.xyy * map(q + e.xyy) + e.yyx * map(q + e.yyx) + e.yxy * map(q + e.yxy) + e.xxx * map(q + e.xxx));
  n.xz *= rot(-yaw);
  n.yz *= rot(-pitch);

  vec3 L = normalize(vec3(-.5, .7, .6));
  float dif = max(dot(n, L), 0.);
  float rim = pow(1. - max(dot(n, -rd), 0.), 2.5);
  float spec = pow(max(dot(reflect(rd, n), L), 0.), 20.);
  float ao = 1. - steps / 90. * .5;
  float lum = (.12 + dif * .7 + rim * .45 + spec * .5) * ao;

  // network: bright nodes, dim edges carrying activation pulses (a forward pass)
  float wNet = (sa == 2 ? 1. - sf : 0.) + (sb == 2 ? sf : 0.);
  if (wNet > 0.) {
    float dn = 1e3;
    for (int i = 0; i < 15; i++) dn = min(dn, length(q - uNodes[i]) - .16);
    float node = smoothstep(.04, 0., dn);
    float pulse = pow(.5 + .5 * sin(q.x * 4. - uTime * 4.), 10.);
    lum = mix(lum, mix(lum * .45 + pulse * .9, lum * 1.2, node), wNet);
  }

  lum *= smoothstep(7.5, 3., t);
  fragColor = vec4(lum, t / 9., 0., 1.);
}`;

export const ASCII_FS = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uAtlas;
uniform float uN;
uniform vec2 uCell;
uniform vec2 uGrid;
uniform vec2 uCanvas;
uniform float uTime;
uniform vec3 uMouse;
uniform vec4 uWaves[4];
uniform float uScroll;
uniform float uBoot;
uniform vec3 uFg;
out vec4 fragColor;

float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 px = vec2(gl_FragCoord.x, uCanvas.y - gl_FragCoord.y);
  vec2 cell = floor(px / uCell);
  vec2 inCell = fract(px / uCell);
  float h = hash(cell);
  float h2 = hash(cell + 91.7);
  float tick = floor(uTime * 12.);

  // click shockwaves push cells outward and scramble them
  vec2 sc = cell;
  float glitch = 0.;
  for (int i = 0; i < 4; i++) {
    vec4 w = uWaves[i];
    float age = uTime - w.z;
    if (w.w <= 0. || age < 0. || age > 2.2) continue;
    vec2 d = (cell - w.xy) * vec2(1., 2.);
    float r = length(d);
    float band = exp(-pow((r - age * 85.) / 7., 2.)) * (1. - age / 2.2) * w.w;
    sc -= (d / max(r, 1.)) * vec2(1., .5) * band * 5.;
    glitch = max(glitch, band);
  }
  sc.y -= uScroll * uGrid.y * .35 * h2 * h2;

  vec2 uv = vec2((sc.x + .5) / uGrid.x, 1. - (sc.y + .5) / uGrid.y);
  float l = 0.;
  if (uv.x >= 0. && uv.x <= 1. && uv.y >= 0. && uv.y <= 1.) l = texture(uScene, uv).r;

  vec2 md = (cell - uMouse.xy) * vec2(1., 2.);
  float lens = uMouse.z * smoothstep(16., 2., length(md));
  float rnd = hash(cell + tick * 1.37);

  l += glitch * .35;
  if (lens > 0.) l = l > .04 ? l + (rnd - .5) * .6 * lens : l + step(1. - lens * .18, rnd) * .25;

  float dust = step(.9965, hash(cell + floor(uTime * .4 + h * 3.) * 7.1));
  l = max(l, dust * .05);

  l *= step(h, uBoot * 1.15);
  l = min(l, .15 + uBoot * 1.2);
  l *= step(pow(uScroll, .8) * 1.05, h * .97 + .03);

  float gi = floor(clamp(l, 0., 1.) * (uN - 1.) + .5);
  if ((lens > .2 || glitch > .2) && gi > 0. && rnd < .35) gi = 1. + floor(hash(cell - tick) * (uN - 1.));
  if (gi < .5) { fragColor = vec4(0.); return; }

  vec2 auv = vec2((gi + inCell.x) / uN, inCell.y);
  float a = texture(uAtlas, auv).a;
  a *= mix(.42, 1., clamp(l * 1.25, 0., 1.)) * (1. - uScroll * .5);
  fragColor = vec4(uFg * a, a);
}`;
