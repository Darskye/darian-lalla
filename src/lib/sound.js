// Tiny UI sounds, synthesised (no files). Off until the visitor switches them on.

let ctx = null;
let enabled = false;

export function setSound(on) {
  enabled = on;
  if (on && !ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      enabled = false;
    }
  }
  if (on) ctx?.resume?.();
  return enabled;
}

export const soundOn = () => enabled;

function blip(f0, f1, dur, gain) {
  if (!enabled || !ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = "square";
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3200;
  o.connect(filter).connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export const tick = () => blip(1900, 700, 0.05, 0.035);
export const hoverBlip = () => blip(2600, 2200, 0.025, 0.012);
