import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { PARAM_IMG, PARAM_MOOD } from "./debug.js";

const KEY = "dl-settings";
const reducedMotion =
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const saved = load();
  const [mood, setMood] = useState(PARAM_MOOD || saved.mood || "dark");
  const [img, setImg] = useState(PARAM_IMG || saved.img || "image");
  const [motion, setMotion] = useState(saved.motion || (reducedMotion ? "off" : "on"));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.mood = mood;
    root.dataset.img = img;
    root.dataset.motion = motion;
    try {
      localStorage.setItem(KEY, JSON.stringify({ mood, img, motion }));
    } catch {
      /* storage unavailable: settings just won't persist */
    }
  }, [mood, img, motion]);

  const value = useMemo(
    () => ({ mood, setMood, img, setImg, motion, setMotion }),
    [mood, img, motion]
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);

/** Reads the live theme colours from CSS so canvases follow the mood. */
export function themeColors() {
  const cs = getComputedStyle(document.documentElement);
  const parse = (name) => cs.getPropertyValue(name).trim().split(/\s+/).map(Number);
  return { fg: parse("--fg-rgb"), bg: parse("--bg-rgb") };
}
