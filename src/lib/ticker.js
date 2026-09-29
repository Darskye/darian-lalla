// One shared animation loop for every canvas on the page.
// Subscribers get (timeSeconds, dtSeconds). The loop sleeps when nobody listens.

const subs = new Set();
let raf = 0;
let last = 0;
let clock = 0;

function frame(now) {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  last = now;
  clock += dt;
  for (const fn of subs) fn(clock, dt);
  raf = subs.size ? requestAnimationFrame(frame) : 0;
  if (!raf) last = 0;
}

export function subscribe(fn) {
  subs.add(fn);
  if (!raf) raf = requestAnimationFrame(frame);
  return () => subs.delete(fn);
}

export const now = () => clock;

// Debug hook: advance every subscriber manually when rAF is throttled (hidden tabs, headless).
if (typeof window !== "undefined") {
  window.__DL = {
    step(ms = 16, steps = 1) {
      for (let i = 0; i < steps; i++) {
        clock += ms / 1000;
        for (const fn of subs) fn(clock, ms / 1000);
      }
      return subs.size;
    },
  };
}
