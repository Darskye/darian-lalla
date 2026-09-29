// Fluid sign: a small stable-fluids solver drives a displacement field that warps the
// name texture; the final pass splits it spectrally so fast motion throws RGB fringes.

export const VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const HEAD = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 o;
uniform vec2 uTexel;
`;

export const SPLAT = HEAD + /* glsl */ `
uniform sampler2D uTarget;
uniform vec2 uPoint;
uniform vec2 uForce;
uniform float uRadius;
uniform float uAspect;
void main() {
  vec2 d = vUv - uPoint;
  d.x *= uAspect;
  float g = exp(-dot(d, d) / uRadius);
  o = vec4(texture(uTarget, vUv).xy + uForce * g, 0.0, 1.0);
}`;

export const ADVECT = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform float uDt;
uniform float uDissipation;
uniform float uRelax;
uniform float uFeed;
void main() {
  vec2 vel = texture(uVelocity, vUv).xy;
  vec2 coord = vUv - uDt * vel * uTexel;
  vec4 src = texture(uSource, coord);
  // uFeed > 0 turns this into the displacement integrator: drag with the flow, relax to rest
  src.xy = src.xy * uDissipation + vel * uFeed;
  src.xy *= uRelax;
  o = vec4(src.xy, 0.0, 1.0);
}`;

export const CURL = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.)).y;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.)).y;
  float B = texture(uVelocity, vUv - vec2(0., uTexel.y)).x;
  float T = texture(uVelocity, vUv + vec2(0., uTexel.y)).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

export const VORTICITY = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main() {
  float L = texture(uCurl, vUv - vec2(uTexel.x, 0.)).x;
  float R = texture(uCurl, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uCurl, vUv - vec2(0., uTexel.y)).x;
  float T = texture(uCurl, vUv + vec2(0., uTexel.y)).x;
  float C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= uCurlStrength * C;
  f.y *= -1.0;
  o = vec4(texture(uVelocity, vUv).xy + f * uDt, 0.0, 1.0);
}`;

export const DIVERGENCE = HEAD + /* glsl */ `
uniform sampler2D uVelocity;
void main() {
  float L = texture(uVelocity, vUv - vec2(uTexel.x, 0.)).x;
  float R = texture(uVelocity, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uVelocity, vUv - vec2(0., uTexel.y)).y;
  float T = texture(uVelocity, vUv + vec2(0., uTexel.y)).y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

export const PRESSURE = HEAD + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uPressure, vUv - vec2(0., uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
  float div = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`;

export const GRADIENT = HEAD + /* glsl */ `
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main() {
  float L = texture(uPressure, vUv - vec2(uTexel.x, 0.)).x;
  float R = texture(uPressure, vUv + vec2(uTexel.x, 0.)).x;
  float B = texture(uPressure, vUv - vec2(0., uTexel.y)).x;
  float T = texture(uPressure, vUv + vec2(0., uTexel.y)).x;
  o = vec4(texture(uVelocity, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0);
}`;

export const SCALE = HEAD + /* glsl */ `
uniform sampler2D uSource;
uniform float uValue;
void main() { o = vec4(texture(uSource, vUv).xy * uValue, 0.0, 1.0); }`;

export const DISPLAY = HEAD + /* glsl */ `
uniform sampler2D uText;
uniform sampler2D uDisp;
uniform vec3 uWeights[8];
uniform vec3 uBase;
uniform float uTime;
uniform vec2 uAmount; // displacement (in sim texels) -> uv
uniform float uFade;
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec2 d = texture(uDisp, vUv).xy * uAmount;
  vec3 col = vec3(0.);
  float core = 1.0;
  for (int i = 0; i < 8; i++) {
    float s = 1.0 + (float(i) / 7.0 - 0.5) * 0.5; // whole word bends; the prism only spreads the edges
    float a = texture(uText, vUv - d * s).a;
    col += a * uWeights[i];
    core = min(core, a);
  }
  // where every spectral sample agrees the letter is solid; the rest is prismatic fringe
  vec3 fringe = max(col - vec3(core), 0.);
  vec3 rgb = uBase * core + fringe;
  float alpha = max(core, max(fringe.r, max(fringe.g, fringe.b)));
  float g = 0.9 + 0.16 * hash(gl_FragCoord.xy + fract(uTime * 7.3) * 91.7);
  rgb *= g;
  o = vec4(rgb * uFade, alpha * uFade);
}`;
