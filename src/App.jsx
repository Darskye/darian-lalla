import { useCallback, useEffect, useState } from "react";
import { START_Y } from "./lib/debug.js";
import { fontsReady } from "./lib/glyphs.js";
import AsciiHero from "./components/AsciiHero.jsx";
import Viewfinder from "./components/Viewfinder.jsx";
import AboutSignal from "./components/AboutSignal.jsx";
import Desktop from "./components/Desktop.jsx";
import AsciiPlate from "./components/AsciiPlate.jsx";
import Clock from "./components/Clock.jsx";
import Nav from "./components/Nav.jsx";
import Scramble from "./components/Scramble.jsx";
import Settings from "./components/Settings.jsx";
import SignalStrip from "./components/SignalStrip.jsx";
import SkillSpace from "./components/SkillSpace.jsx";
import { Fade, Words } from "./components/Reveal.jsx";
import { wordmark } from "./sketches/index.js";
import {
  CAPABILITIES,
  CLUSTERS,
  CONTACT,
  ORIGIN,
  STATEMENT,
} from "./content.js";

const ext = { target: "_blank", rel: "noreferrer" };
const SKILL_COUNT = CLUSTERS.reduce((n, c) => n + c.skills.length, 0);

function SectionHead({ title, count, note }) {
  return (
    <div className="sec-head">
      <h2>
        <Scramble text={title} trigger="view" />
      </h2>
      <span className="muted">{count}</span>
      <span className="muted sec-note">{note}</span>
    </div>
  );
}

export default function App() {
  const [settings, setSettings] = useState(false);
  const closeSettings = useCallback(() => setSettings(false), []);
  const half = Math.ceil(CAPABILITIES.length / 2);

  useEffect(() => {
    if (START_Y) fontsReady().then(() => setTimeout(() => window.scrollTo(0, START_Y), 200));
  }, []);

  return (
    <>
      <Nav onSettings={() => setSettings(true)} />
      <Settings open={settings} onClose={closeSettings} />
      <AsciiHero />

      <main className="page">
        <section className="statement">
          <Words text={STATEMENT} className="big" />
          <Words text={ORIGIN} className="mid statement-sub" />
          <Fade className="pills">
            <a className="pill" href="#work">
              Selected work
            </a>
            <a className="pill" href="#concepts">
              Concepts
            </a>
            <a className="pill" href="#contact">
              Get in touch
            </a>
          </Fade>
        </section>

        <Viewfinder />

        <section id="skills" className="block">
          <SectionHead title="Capabilities" count={`(${SKILL_COUNT})`} note="Where the tools cluster" />
          <SkillSpace />
          <div className="services">
            <h3>What I do</h3>
            {[CAPABILITIES.slice(0, half), CAPABILITIES.slice(half)].map((list, i) => (
              <ul key={i}>
                {list.map(([name, desc]) => (
                  <li key={name}>
                    <span>{name}</span>
                    <span className="muted">{desc}</span>
                  </li>
                ))}
              </ul>
            ))}
            <div className="services-cta">
              <p>
                Let&apos;s build something
                <br />
                that learns.
              </p>
              <a className="pill solid" href="#contact">
                Start a conversation
              </a>
            </div>
          </div>
        </section>

        <section id="papers" className="block">
          <SectionHead title="Papers & notes" count="(01 + 03)" note="A workspace: drag the windows, orbit the model" />
          <Desktop />
        </section>

        <section id="about" className="block">
          <SectionHead title="About" count="" note="No photo. Just signal." />
          <AboutSignal />
        </section>

        <section id="contact" className="contact">
          <Words as="h2" text="Have data that wants to become something?" className="contact-big" />
          <Fade className="contact-links">
            <a className="contact-mail" href={`mailto:${CONTACT.email}`}>
              {CONTACT.email}
            </a>
            <div className="pills">
              <a className="pill" href={CONTACT.linkedin} {...ext}>
                LinkedIn ↗
              </a>
              <a className="pill" href={CONTACT.github} {...ext}>
                GitHub ↗
              </a>
            </div>
          </Fade>
        </section>
      </main>

      <footer className="footer">
        <AsciiPlate sketch={wordmark} transparent seed={9} still={0} className="wordmark" label="darian lalla" />
        <div className="foot-row">
          <Clock />
          <div>
            <div className="muted">New projects</div>
            <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          </div>
          <div className="foot-links">
            <a href="#work">Work</a>
            <a href="#concepts">Concepts</a>
            <a href="#papers">Papers</a>
          </div>
          <div className="foot-links">
            <a href={CONTACT.linkedin} {...ext}>
              LinkedIn
            </a>
            <a href={CONTACT.github} {...ext}>
              GitHub
            </a>
            <span className="muted">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
      <SignalStrip />
    </>
  );
}
