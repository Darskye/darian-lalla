import { useEffect, useState } from "react";
import Scramble from "./Scramble.jsx";

const LINKS = [
  ["Work", "#work"],
  ["Concepts", "#concepts"],
  ["Lab", "#lab"],
  ["About", "#about"],
  ["Papers", "#papers"],
];

export default function Nav({ onSettings }) {
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menu);
  }, [menu]);

  const close = () => setMenu(false);

  return (
    <>
      <header className="nav">
        <a href="#top" className="nav-home" onClick={close}>
          <Scramble text="Darian Lalla" />
        </a>
        <nav className="nav-group" aria-label="Sections">
          {LINKS.slice(0, 3).map(([t, h]) => (
            <a key={h} href={h}>
              <Scramble text={t} />
            </a>
          ))}
        </nav>
        <nav className="nav-group" aria-label="More sections">
          {LINKS.slice(3).map(([t, h]) => (
            <a key={h} href={h}>
              <Scramble text={t} />
            </a>
          ))}
        </nav>
        <div className="nav-end">
          <button type="button" className="ghost" onClick={onSettings}>
            <Scramble text="Settings" />
          </button>
          <a href="#contact">
            <Scramble text="Contact" />
          </a>
        </div>
        <button type="button" className="ghost nav-menu" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
          {menu ? "Close" : "Menu"}
        </button>
      </header>
      <div className={`mobile-menu ${menu ? "open" : ""}`} aria-hidden={!menu} inert={menu ? undefined : ""}>
        {[...LINKS, ["Contact", "#contact"]].map(([t, h], i) => (
          <a key={h} href={h} onClick={close} tabIndex={menu ? 0 : -1}>
            <span className="mono muted">{String(i + 1).padStart(2, "0")}</span> {t}
          </a>
        ))}
        <button
          type="button"
          className="pill"
          tabIndex={menu ? 0 : -1}
          onClick={() => {
            close();
            onSettings();
          }}
        >
          Settings
        </button>
      </div>
    </>
  );
}
