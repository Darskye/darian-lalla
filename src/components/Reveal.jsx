import { useEffect, useRef } from "react";

/** Adds .in when the element scrolls into view (CSS handles the motion). */
export function useInView(threshold = 0.2) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add("in");
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** Large statement text that rises in word by word. */
export function Words({ text, as: Tag = "p", className = "" }) {
  const ref = useInView(0.25);
  const words = text.split(" ");
  return (
    <Tag ref={ref} className={`words ${className}`} aria-label={text}>
      {words.map((w, i) => (
        <span key={i}>
          <span className="w" aria-hidden="true" style={{ "--i": i }}>
            <span>{w}</span>
          </span>{" "}
        </span>
      ))}
    </Tag>
  );
}

export function Fade({ as: Tag = "div", className = "", children, ...rest }) {
  const ref = useInView(0.15);
  return (
    <Tag ref={ref} className={`fade ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
