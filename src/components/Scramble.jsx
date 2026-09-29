import { useCallback, useEffect, useRef } from "react";
import { SCRAMBLE } from "../lib/glyphs.js";

const motionOff = () => document.documentElement.dataset.motion === "off";

/**
 * Mono text that decodes through random glyphs, left to right.
 * trigger="hover" runs on hover of the nearest link/button (or the span itself);
 * trigger="view" runs once when scrolled into view.
 */
export default function Scramble({ text, trigger = "hover", duration = 420, className = "" }) {
  const ref = useRef(null);
  const raf = useRef(0);

  const run = useCallback(() => {
    const el = ref.current;
    if (!el || motionOff()) return;
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const chars = [...text];
    const step = (now) => {
      const p = (now - start) / duration;
      if (p >= 1) {
        el.textContent = text;
        return;
      }
      el.textContent = chars
        .map((c, i) => {
          if (c === " ") return " ";
          const at = i / chars.length;
          if (at < p - 0.15) return c;
          if (at < p + 0.2) return SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
          return trigger === "hover" ? c : " ";
        })
        .join("");
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, [text, duration, trigger]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (trigger === "change") {
      run();
      return () => cancelAnimationFrame(raf.current);
    }
    if (trigger === "hover") {
      const host = el.closest("a, button, [data-scramble-host]") || el;
      host.addEventListener("mouseenter", run);
      return () => {
        host.removeEventListener("mouseenter", run);
        cancelAnimationFrame(raf.current);
      };
    }
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          run();
          io.disconnect();
        }
      },
      { threshold: 0.6 }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
    };
  }, [run, trigger]);

  return (
    <span ref={ref} className={`scramble ${className}`}>
      {text}
    </span>
  );
}
