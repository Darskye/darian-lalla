import { useEffect, useRef } from "react";
import { useSettings } from "../lib/settings.jsx";

function Group({ title, value, options, onChange }) {
  return (
    <fieldset className="set-group">
      <legend>{title}</legend>
      {options.map(([v, label]) => (
        <label key={v} className={value === v ? "on" : ""}>
          <input type="radio" name={title} value={v} checked={value === v} onChange={() => onChange(v)} />
          <span className="dot" aria-hidden="true" />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export default function Settings({ open, onClose }) {
  const s = useSettings();
  const panel = useRef(null);

  useEffect(() => {
    document.body.classList.toggle("settings-open", open);
    if (!open) return;
    panel.current?.querySelector("button")?.focus();
    const key = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose]);

  return (
    <>
      <div className="dither" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panel}
        className={`settings ${open ? "open" : ""}`}
        aria-hidden={!open}
        aria-label="Display settings"
        inert={open ? undefined : ""}
      >
        <div className="settings-head">
          <span>Settings</span>
          <button type="button" className="ghost" onClick={onClose} tabIndex={open ? 0 : -1}>
            Close
          </button>
        </div>
        <Group title="Mood" value={s.mood} onChange={s.setMood} options={[["dark", "Dark"], ["light", "Light"]]} />
        <Group
          title="Img"
          value={s.img}
          onChange={s.setImg}
          options={[
            ["image", "Image"],
            ["text", "Text"],
            ["pixel", "Pixel"],
          ]}
        />
        <Group title="Motion" value={s.motion} onChange={s.setMotion} options={[["on", "On"], ["off", "Off"]]} />
        <p className="settings-note">
          Every image on this site is generated live from code. Switch Img to Text to read the data underneath.
        </p>
      </aside>
    </>
  );
}
