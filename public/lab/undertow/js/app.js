// Undertow exhibit: rooms, controls, callouts, timeline, tour.

import { $, $$, clamp, lerp, fmtDate, addDays, fmtN, sig2, signed, fmtLL, heading, DIRWORD, MONTHS, PALETTES, ramp, reduceMotion, escapeHTML } from "./util.js";
import { Flow } from "./flow.js";
import { loadManifests, oceanGeo, loadOcean, oceanField, samplePlane, maskAt, ANOM_RANGE, loadForecast, windGeo, loadWind, windField, rainMmh } from "./data.js";
import { Callouts } from "./callouts.js";
import { trendChart, skillChart, censusBar } from "./charts.js";
import { Explainer } from "./explainer.js";

const ui = {
  hud: $("#hud"), canvas: $("#sea"), loading: $("#loading"), loadingText: $("#loadingText"), loadingBar: $("#loadingBar"),
  eyebrow: $("#roomEyebrow"), title: $("#roomTitle"), lede: $("#roomLede"), hint: $("#hint"),
  regions: $("#regions"), regionControl: $("#regionControl"), runs: $("#runs"), runControl: $("#runControl"),
  modes: $("#modes"), modeLabel: $("#modeLabel"), modeControl: $("#modeControl"), layers: $("#layers"), layerControl: $("#layerControl"),
  legendTitle: $("#legendTitle"), legendBar: $("#legendBar"), legendTicks: $("#legendTicks"),
  right: $("#rightPanel"), date: $("#date"), dateSub: $("#dateSub"), scrubber: $("#scrubber"), rail: $("#rail"), marks: $("#marks"),
  fill: $("#fill"), knob: $("#knob"), play: $("#play"), playIcon: $("#playIcon"), rate: $("#rate"),
  probe: $("#probe"), intro: $("#intro"), about: $("#about"), tourChip: $("#tourChip"), tourBtn: $("#tourBtn"),
  splitLabels: $("#splitLabels"), splitHandle: $("#splitHandle"), insightsBtn: $("#insightsBtn"),
};

function showLoading(text, frac = 0) {
  ui.loading.classList.remove("is-done", "is-error");
  ui.loadingBar.parentElement.hidden = false;
  ui.loadingText.textContent = text;
  ui.loadingBar.style.width = `${(frac * 100).toFixed(1)}%`;
}
const loadingProgress = (f) => { ui.loadingBar.style.width = `${(f * 100).toFixed(1)}%`; };
const hideLoading = () => ui.loading.classList.add("is-done");
function fail(msg) {
  ui.loading.classList.remove("is-done");
  ui.loading.classList.add("is-error");
  ui.loadingText.textContent = msg;
  ui.loadingBar.parentElement.hidden = true;
}

let flow;
try {
  flow = new Flow(ui.canvas);
} catch (e) {
  console.error(e);
  fail(e.message === "webgl2"
    ? "This exhibit needs WebGL 2, which this browser has switched off or doesn't support. A recent Chrome, Firefox, Edge or Safari will run it."
    : "The graphics card refused one of the shaders, so the exhibit can't start. Details are in the browser console.");
  throw e;
}
const callouts = new Callouts($("#callouts"), flow);
let explainer = null;
let skill = null;

// ---------------------------------------------------------------- content
const ROOMS = {
  ocean: {
    n: "01", name: "Ocean", title: "The ocean's weather",
    lede: "Satellites measure the height of the sea to within centimetres, and its slopes give the currents. Here are 59 real days of jets, rings and spinning eddies.",
  },
  forecast: {
    n: "02", name: "Forecast", title: "A machine that forecasts the sea",
    lede: "A neural operator learned from seven years of satellite maps. It never saw 2026. Drag the divider to compare what happened with what it predicted.",
  },
  wind: {
    n: "03", name: "Wind", title: "The sky above",
    lede: "Winds push the ocean around. This is the whole planet's air from NOAA's weather model, every six hours for three days. Drag to spin the globe.",
  },
};
const OCEAN_MODES = [
  { id: "heat", label: "Heat", scalar: "sst", colorA: 0, rowA: 0, bgA: 0 },
  { id: "anomaly", label: "Vs normal", scalar: "anom", colorA: 0, rowA: 1, bgA: 0, contour: (2 + ANOM_RANGE) / (2 * ANOM_RANGE) },
  { id: "speed", label: "Speed", scalar: "sst", colorA: 1, rowA: 2, bgA: 1 },
  { id: "spin", label: "Spin", scalar: "sst", colorA: 2, rowA: 3, bgA: 2 },
];
const FC_VIEWS = [
  { id: "split", label: "Side by side" },
  { id: "error", label: "Where it missed" },
  { id: "model", label: "Model only" },
];
const WIND_LAYERS = [{ id: "surface", label: "Surface" }, { id: "jet", label: "Jet stream" }];
const WIND_COLORS = [{ id: "speed", label: "Speed" }, { id: "air", label: "Temperature" }];
const RATES = [0.5, 1, 2, 4];
const BASE_RATE = { ocean: 1, forecast: 0.8, wind: 0.8 };

const S = {
  M: null, room: "ocean", region: "gulf-stream", oceanMode: "heat",
  run: 2, fcView: "split", split: 0.5, windLayer: "surface", windColor: "speed", rain: true, pressure: true,
  t: 0, frames: 1, playing: !reduceMotion, rate: 1,
  ocean: new Map(), forecast: new Map(), wind: null, windTex: null,
  tex: [], ready: false, touring: false, tourStep: 0, tourUntil: 0, lastInput: performance.now(),
  hideUI: false, idleSpin: true,
};

// ---------------------------------------------------------------- data
async function ensureOcean(id) {
  if (S.ocean.has(id)) return S.ocean.get(id);
  const sc = S.M.scenes.scenes.find((s) => s.id === id);
  showLoading(`Downloading ${sc.name} · ${(sc.bytes / 1e6).toFixed(1)} MB`);
  const o = await loadOcean(sc, loadingProgress);
  S.ocean.set(id, o);
  return o;
}
async function ensureForecast(id) {
  if (S.forecast.has(id)) return S.forecast.get(id);
  const entry = S.M.forecast.regions[id];
  const sc = S.M.scenes.scenes.find((s) => s.id === id);
  showLoading(`Downloading the model's forecasts · ${(entry.bytes / 1e6).toFixed(1)} MB`);
  const runs = await loadForecast(entry, sc, loadingProgress);
  S.forecast.set(id, runs);
  return runs;
}
async function ensureWind() {
  if (S.wind) return S.wind;
  const w = S.M.wind;
  const mb = Object.values(w.files).reduce((s, f) => s + f.bytes, 0) / 1e6;
  showLoading(`Downloading the planet's winds · ${mb.toFixed(1)} MB`);
  const wd = await loadWind(w, loadingProgress);
  S.wind = wd;
  const g = w.grid, g1 = w.grid1;
  S.windTex = {
    surface: flow.textureArray(g.W, g.H, wd.S, windField(wd, w.scales, "surface"), true),
    jet: flow.textureArray(g1.W, g1.H, wd.S, windField(wd, w.scales, "jet"), true),
    rain: flow.textureArrayR8(g.W, g.H, wd.S, wd.rain, true),
    pres: flow.textureArrayR8(g1.W, g1.H, wd.S, wd.pres, true),
    land: flow.landTexture(g.W, g.H, wd.land.map((b) => (b ? 255 : 0))),
  };
  return wd;
}
function dropTextures() {
  S.tex.forEach((t) => flow.deleteTexture(t));
  S.tex = [];
}
const scene = (id = S.region) => S.M.scenes.scenes.find((s) => s.id === id);
const insight = (id = S.region) => S.M.insights && S.M.insights[id];

// ---------------------------------------------------------------- rooms
let loadToken = 0;
async function enterRoom(room, opts = {}) {
  const token = ++loadToken;
  S.room = room;
  Object.assign(S, opts);
  $$(".room").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.room === room)));
  const R = ROOMS[room];
  const sceneKey = `${room}|${S.region}|${S.run}|${S.windLayer}|${S.oceanMode}`;
  if (S.ready && sceneKey !== S.sceneKey && !reduceMotion) {
    ui.canvas.classList.add("is-switching");
    await new Promise((r) => setTimeout(r, 320));
    if (token !== loadToken) return;
  }
  S.sceneKey = sceneKey;
  if (room !== "forecast") { ui.splitLabels.hidden = true; ui.splitHandle.hidden = true; }
  ui.eyebrow.textContent = `Room ${R.n} · ${R.name}`;
  ui.title.textContent = R.title;
  ui.lede.textContent = R.lede;
  try {
    if (room === "ocean") await setupOcean(token);
    else if (room === "forecast") await setupForecast(token);
    else await setupWind(token);
  } catch (e) {
    console.error(e);
    if (token === loadToken) fail(`Couldn't load this room's data (${e.message}). Reload the page to try again.`);
    return;
  }
  if (token !== loadToken) return;
  renderControls();
  renderLegend();
  buildTimeline();
  refreshCallouts(true);
  hideLoading();
  S.ready = true;
  requestAnimationFrame(() => ui.canvas.classList.remove("is-switching"));
}

async function setupOcean(token) {
  const o = await ensureOcean(S.region);
  if (token !== loadToken) return;
  const mode = OCEAN_MODES.find((m) => m.id === S.oceanMode);
  dropTextures();
  const tex = flow.textureArray(o.W, o.H, o.N, oceanField(o, mode.scalar));
  S.tex.push(tex);
  flow.setScene(oceanGeo(o.sc), tex, o.N, o.sc.vmax);
  flow.style = { ...flow.style, colorA: mode.colorA, rowA: mode.rowA, bgA: mode.bgA, split: -1, contour: mode.contour || 0 };
  const sc = o.sc;
  focusRegion(sc);
  S.frames = o.N;
  if (!S.ready || S.t > o.N - 1) S.t = Math.max(0, o.N - 22);
  ui.hint.textContent = "Drag to move · scroll to zoom · hover to read the water";
  if (S.panelKey !== `ocean|${S.region}`) { S.panelKey = `ocean|${S.region}`; renderOceanPanel(o); } else renderOceanStats();
}

function freeCentre() {
  // horizontal centre of the map area left free by the side panels (CSS px)
  if (innerWidth < 900) return innerWidth / 2;
  const l = $("#leftPanel").getBoundingClientRect(), r = ui.right.getBoundingClientRect();
  const a = l.width ? l.right : 0, b = r.width ? r.left : innerWidth;
  return (a + b) / 2;
}
function focusRegion(sc) {
  flow.regionFocus(sc.focus[0], sc.focus[1], 1);
  flow.view.cx -= ((freeCentre() - innerWidth / 2) * flow.dpr) / flow.view.s;
  flow.clampView();
}
function forecastRun() {
  const runs = S.forecast.get(S.region);
  return runs && runs[clamp(S.run, 0, runs.length - 1)];
}
async function setupForecast(token) {
  const o = await ensureOcean(S.region);
  const runs = await ensureForecast(S.region);
  if (token !== loadToken) return;
  S.run = clamp(S.run, 0, runs.length - 1);
  const run = runs[S.run];
  const t0 = o.sc.dates.indexOf(run.start);
  const L = run.u.length / o.n;
  const frames = L + 1;
  // model frames: frame 0 is the real start day, then the forecast days
  const mu = new Float32Array(frames * o.n), mv = new Float32Array(frames * o.n);
  mu.set(o.u.subarray(t0 * o.n, (t0 + 1) * o.n), 0);
  mv.set(o.v.subarray(t0 * o.n, (t0 + 1) * o.n), 0);
  mu.set(run.u, o.n);
  mv.set(run.v, o.n);
  dropTextures();
  const model = flow.textureArray(o.W, o.H, frames, oceanField(o, "sst", Array(frames).fill(t0), { u: mu, v: mv }));
  S.tex.push(model);
  let truth = model;
  if (run.verify) {
    truth = flow.textureArray(o.W, o.H, frames, oceanField(o, "sst", [...Array(frames).keys()].map((k) => t0 + k)));
    S.tex.push(truth);
  }
  S.fc = { o, run, t0, frames, mu, mv };
  flow.setScene(oceanGeo(o.sc), truth, frames, o.sc.vmax, model);
  if (!run.verify && S.fcView !== "model") S.fcView = "model";
  applyForecastView();
  focusRegion(o.sc);
  S.frames = frames;
  S.t = 0;
  ui.hint.textContent = run.verify ? "Drag the white handle to compare · hover to read both" : "This forecast looks past the newest data";
  S.panelKey = "forecast";
  renderForecastPanel(o, run, t0);
}
function applyForecastView() {
  const v = S.fcView, run = S.fc && S.fc.run;
  const split = v === "split" && run && run.verify;
  flow.style = {
    ...flow.style, contour: 0,
    colorA: 1, rowA: 2, bgA: 1,
    colorB: v === "error" ? 3 : 1, rowB: v === "error" ? 7 : 2, bgB: v === "error" ? 3 : 1,
    split: split ? S.split * innerWidth : v === "error" || v === "model" ? 0 : -1,
  };
  ui.splitLabels.hidden = !split || S.hideUI;
  ui.splitHandle.hidden = !split || S.hideUI;
  placeSplit();
}
function placeSplit() {
  const x = S.split * innerWidth;
  ui.splitLabels.style.left = `${x}px`;
  ui.splitHandle.style.left = `${x}px`;
  if (S.room === "forecast" && S.fcView === "split") flow.style.split = x;
}

async function setupWind(token) {
  await ensureWind();
  if (token !== loadToken) return;
  const w = S.M.wind, wt = S.windTex;
  dropTextures();
  const jet = S.windLayer === "jet";
  const g = jet ? w.grid1 : w.grid;
  flow.setScene(windGeo(g, g.W, g.H), jet ? wt.jet : wt.surface, w.hours.length, jet ? w.scales.v250 * 0.8 : w.scales.v10);
  const g1 = w.grid1;
  flow.setOverlay({ rain: wt.rain, pres: wt.pres, land: wt.land, geo1: [g1.lon0 - g1.d / 2, g1.lat0 - g1.d / 2, g1.W * g1.d, g1.H * g1.d] });
  applyWindStyle();
  flow.globeX = freeCentre() / innerWidth;
  if (!S.windFocused) { flow.globeFocus(-45, 22, 1); S.windFocused = true; } else flow.clampView();
  S.frames = w.hours.length;
  S.t = clamp(S.t, 0, S.frames - 1);
  if (S.t > S.frames - 1 || !S.windStarted) { S.t = 0; S.windStarted = true; }
  ui.hint.textContent = "Drag to spin the globe · scroll to zoom · hover to read the air";
  if (S.panelKey !== "wind") { S.panelKey = "wind"; renderWindPanel(); } else renderWindStats();
}
function applyWindStyle() {
  const jet = S.windLayer === "jet", air = S.windColor === "air" && !jet;
  flow.style = {
    ...flow.style, split: -1, contour: 0,
    colorA: air ? 0 : 1, rowA: air ? 4 : jet ? 6 : 5, bgA: air ? 0 : 1, tint: air ? 0.16 : 0.06,
    rainOn: S.rain ? 1 : 0, presOn: S.pressure ? 1 : 0,
  };
  flow.life = jet ? 4.2 : 3.6;
}
function sunVector(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (date - start) / 864e5;
  const decl = ((-23.44 * Math.cos(((2 * Math.PI) / 365) * (doy + 10))) * Math.PI) / 180;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;
  const lon = (-(hours - 12) * 15 * Math.PI) / 180;
  return [Math.cos(decl) * Math.cos(lon), Math.cos(decl) * Math.sin(lon), Math.sin(decl)];
}
function windTime(t) {
  const w = S.M.wind, run = new Date(w.run.replace("Z", ":00Z").replace(/T(\d\d)Z?/, "T$1:00"));
  const i = Math.floor(t), j = Math.min(i + 1, w.hours.length - 1);
  const h = lerp(w.hours[i], w.hours[j], t - i);
  return new Date(run.getTime() + h * 3600e3);
}

// ---------------------------------------------------------------- controls
function chips(host, items, active, onPick, toggle = false) {
  host.innerHTML = items.map((it) => `<button class="chip${toggle ? " toggle" : ""}" id="${host.id}-${it.id}" data-id="${it.id}" aria-pressed="${toggle ? !!it.on : it.id === active}">${escapeHTML(it.label)}</button>`).join("");
  host.onclick = (e) => { const b = e.target.closest("[data-id]"); if (b) onPick(b.dataset.id); };
}
function renderControls() {
  const room = S.room;
  ui.regionControl.hidden = room === "wind";
  ui.runControl.hidden = room !== "forecast";
  ui.layerControl.hidden = room !== "wind";
  const regions = S.M.scenes.scenes.map((s) => ({ id: s.id, label: s.name.split(/[ –]/)[0] }));
  chips(ui.regions, regions, S.region, (id) => { stopTour(); enterRoom(S.room, { region: id }); });
  if (room === "ocean") {
    ui.modeLabel.textContent = "Colour by";
    chips(ui.modes, OCEAN_MODES, S.oceanMode, (id) => { stopTour(); enterRoom("ocean", { oceanMode: id }); });
  } else if (room === "forecast") {
    const runs = S.forecast.get(S.region) || [];
    chips(ui.runs, runs.map((r, i) => ({ id: String(i), label: r.verify ? fmtDate(r.start, false) : `${fmtDate(r.start, false)} → future` })), String(S.run),
      (id) => { stopTour(); enterRoom("forecast", { run: Number(id), fcView: runs[Number(id)].verify ? S.fcView === "model" ? "split" : S.fcView : "model" }); });
    ui.modeLabel.textContent = "View";
    const run = forecastRun();
    chips(ui.modes, FC_VIEWS.filter((v) => run.verify || v.id === "model"), S.fcView, (id) => { stopTour(); S.fcView = id; applyForecastView(); renderControls(); renderLegend(); refreshCallouts(true); });
  } else {
    ui.modeLabel.textContent = "Colour by";
    chips(ui.modes, WIND_COLORS.filter((c) => S.windLayer === "surface" || c.id === "speed"), S.windColor, (id) => { stopTour(); S.windColor = id; applyWindStyle(); renderControls(); renderLegend(); });
    const layers = [...WIND_LAYERS.map((l) => ({ ...l, on: S.windLayer === l.id })), { id: "rain", label: "Rain", on: S.rain }, { id: "pressure", label: "Pressure", on: S.pressure }];
    chips(ui.layers, layers, null, (id) => {
      stopTour();
      if (id === "rain") S.rain = !S.rain;
      else if (id === "pressure") S.pressure = !S.pressure;
      else { enterRoom("wind", { windLayer: id, windColor: id === "jet" ? "speed" : S.windColor }); return; }
      applyWindStyle(); renderControls(); refreshCallouts(true);
    }, true);
  }
}

function legendSpec() {
  const room = S.room;
  if (room === "ocean") {
    const sc = scene();
    if (S.oceanMode === "heat") {
      const ticks = [];
      for (let t = Math.ceil(sc.tmin / 5) * 5; t <= sc.tmax; t += 5) ticks.push([(t - sc.tmin) / (sc.tmax - sc.tmin), `${t}°`]);
      return { title: "Sea-surface temperature · °C", pal: "heat", ticks };
    }
    if (S.oceanMode === "anomaly") return { title: "Warmer or cooler than 1991–2020 · °C", pal: "anomaly", ticks: [-4, -2, 0, 2, 4].map((v) => [(v + ANOM_RANGE) / (2 * ANOM_RANGE), signed(v, 0).replace("+0", "0").replace("−0", "0")]) };
    if (S.oceanMode === "speed") return speedLegend("Current speed · m/s", "speed", sc.vmax, 0.5);
    return { title: "Eddy spin", pal: "spin", ticks: [[0, "Cyclonic"], [0.5, "Calm"], [1, "Anticyclonic"]] };
  }
  if (room === "forecast") {
    const sc = scene();
    if (S.fcView === "error") return { title: "Model error · m/s", pal: "error", ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => [Math.sqrt(f), (f * 0.5 * sc.vmax).toFixed(2)]) };
    return speedLegend("Current speed · m/s", "speed", sc.vmax, 0.5);
  }
  const w = S.M.wind;
  if (S.windLayer === "jet") return speedLegend("Jet stream speed · m/s", "jet", w.scales.v250 * 0.8, 20);
  if (S.windColor === "air") return { title: "Air temperature · °C", pal: "air", ticks: [-40, -20, 0, 20, 40].map((t) => [(t - w.scales.tmin) / (w.scales.tmax - w.scales.tmin), `${t}°`]) };
  return speedLegend("Wind speed · m/s", "wind", w.scales.v10, 5);
}
function speedLegend(title, pal, vmax, step) {
  const ticks = [];
  for (let v = 0; v <= vmax + 1e-6; v += step) ticks.push([Math.sqrt(v / vmax), step < 1 ? v.toFixed(1) : String(v)]);
  return { title, pal, ticks };
}
function renderLegend() {
  const spec = legendSpec();
  const c = ui.legendBar, ctx = c.getContext("2d");
  const img = ctx.createImageData(c.width, 1);
  img.data.set(ramp(PALETTES[spec.pal], c.width));
  for (let y = 0; y < c.height; y++) ctx.putImageData(img, 0, y);
  ui.legendTitle.textContent = spec.title;
  // drop labels that would collide with the one before (keep the last one)
  spec.ticks = spec.ticks.filter((t, i, a) => i === a.length - 1 ? true : a[i + 1][0] - t[0] > 0.16 || i === 0)
    .filter((t, i, a) => i === 0 || t[0] - a[i - 1][0] > 0.16);
  ui.legendTicks.innerHTML = spec.ticks.map(([x, l]) => `<span class="${x < 0.06 ? "l" : x > 0.94 ? "r" : ""}" style="left:${(x * 100).toFixed(2)}%">${escapeHTML(l)}</span>`).join("");
}

// ---------------------------------------------------------------- insight panels
function card(head, body, i = 0) {
  return `<section class="card glass" style="--d:${0.08 * i}s"><div class="card-head"><span>${head[0]}</span><span>${head[1] || ""}</span></div>${body}</section>`;
}
function renderOceanPanel(o) {
  const sc = o.sc, ins = insight(), tr = ins && ins.trend, ed = ins && ins.eddies;
  const warmed = tr ? tr.fit[1] - tr.fit[0] : 0;
  let html = "";
  if (tr) {
    html += card(["45-year record", sc.name], `<div class="big"><b>${signed(tr.perDecade, 2)} °C</b><span>per decade</span></div><div id="trendChart"></div>`
      + `<p>This patch of ocean has warmed about <strong>${warmed.toFixed(1)} °C</strong> since 1982. The warmest year so far was <strong>${tr.warmest}</strong>.</p>`, 0);
  }
  if (ed) {
    html += card(["Eddy census", `${sc.dates.length} days`], `<div class="big"><b>${ed.count}</b><span>eddies tracked</span></div><div id="census"></div>`
      + `<p>Cyclonic eddies turn with the Earth and usually hold cold water; anticyclonic ones turn against it and trap warm water.</p>`, 1);
  }
  html += card(["This window", `${fmtDate(sc.dates[0], false)} – ${fmtDate(sc.dates.at(-1), false)}`], `<dl class="stat-list" id="oceanStats"></dl>`, 2);
  ui.right.innerHTML = html;
  if (tr) trendChart($("#trendChart"), tr);
  if (ed) censusBar($("#census"), ed);
  renderOceanStats();
}
function renderOceanStats() {
  const el = $("#oceanStats");
  if (!el) return;
  const sc = scene(), ins = insight(), st = sc.stats;
  const rows = [
    ["Fastest 0.1%", `${st.topSpeed.toFixed(2)} m/s · ${(st.topSpeed * 1.944).toFixed(1)} kn`],
    ["Mean speed", `${st.meanSpeed.toFixed(2)} m/s`],
    ["Water", `${sc.tmin.toFixed(0)} to ${sc.tmax.toFixed(0)} °C`],
  ];
  if (ins && ins.windowAnomaly != null) rows.push(["Vs normal", `${signed(ins.windowAnomaly, 2)} °C`]);
  rows.push(["Tracers", fmtN(flow.parts ? flow.parts.N : 0)], ["Time-lapse", `×${fmtN(sig2(flow.timeLapse()))}`]);
  el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

function renderForecastPanel(o, run, t0) {
  const F = S.M.forecast, ev = F.model.eval.regions[S.region];
  const avg = { model: ev.model, persistence: ev.persistence };
  const err = run.error || avg;
  const k7 = Math.min(6, err.model.length - 1);
  const pct = Math.round((1 - err.model[k7] / err.persistence[k7]) * 100);
  const html = card(["How far ahead?", run.verify ? `From ${fmtDate(run.start, false)}` : "2026 average"],
    `<div class="big"><b>${pct >= 0 ? pct : -pct}%</b><span>${pct >= 0 ? "less" : "more"} error than “no change” at day 7</span></div>`
    + `<div id="skillChart"></div><div class="key"><span><i class="k-model"></i>Model</span><span><i class="k-persist"></i>Assume nothing changes</span></div>`
    + `<p>${run.verify ? "Bold: this forecast. Faint: average of " + ev.n + " forecasts across 2026." : "Average of " + ev.n + " forecasts across 2026, which the model never saw."}</p>`, 0)
    + card(["How the model sees", "Fourier neural operator"], `<canvas id="explainer" aria-label="Diagram: last three days, rewritten as waves, filtered, turned into tomorrow"></canvas>`, 1)
    + card(["The model", "Runs on a laptop"], `<dl class="stat-list">`
      + `<dt>Learned numbers</dt><dd>${(F.model.params / 1e6).toFixed(1)} million</dd>`
      + `<dt>Trained on</dt><dd>2019–2024 · 4 oceans</dd>`
      + `<dt>Tested on</dt><dd>2026 only</dd>`
      + `<dt>14 days ahead</dt><dd>${F.model.timing.seconds_14_days_cpu.toFixed(1)} s on a CPU</dd>`
      + `<dt>Time-lapse</dt><dd id="fcLapse">×${fmtN(sig2(flow.timeLapse()))}</dd></dl>`, 2);
  ui.right.innerHTML = html;
  skill = skillChart($("#skillChart"), err, run.verify ? avg : null);
  explainer = new Explainer($("#explainer"));
  explainer.setData(o, t0, { u: run.u, v: run.v });
}

function renderWindPanel() {
  const w = S.M.wind;
  const html = card(["Right now on Earth", "NOAA GFS"], `<dl class="stat-list" id="windStats"></dl>`, 0)
    + card(["Wind drives the ocean", "Why it's here"], `<p>Steady trade winds and westerlies drag on the sea surface and spin up the great ocean gyres. The Gulf Stream and Kuroshio are those gyres' fast western edges.</p>`
      + `<p>The <strong>jet stream</strong> flows about 10 km up and steers storms. Pressure lines crowd together where winds are strongest.</p>`, 1)
    + card(["The run", fmtDate(w.run.slice(0, 10))], `<dl class="stat-list"><dt>Model run</dt><dd>${w.run.slice(11, 13)}:00 UTC</dd><dt>Steps</dt><dd>${w.hours.length} · every 6 h</dd><dt>Grid</dt><dd>0.5° · ${fmtN(w.grid.W * w.grid.H)} points</dd><dt>Time-lapse</dt><dd id="windLapse">×${fmtN(sig2(flow.timeLapse()))}</dd></dl>`, 2);
  ui.right.innerHTML = html;
  explainer = null;
  renderWindStats();
}
function renderWindStats() {
  const el = $("#windStats");
  if (!el) return;
  const f = S.M.wind.features[Math.round(S.t)];
  const low = f.lows[0];
  const rows = [
    ["Strongest wind", `${f.gust.ms.toFixed(0)} m/s · ${Math.round(f.gust.ms * 3.6)} km/h`],
    ["Deepest low", low ? `${low.hPa.toFixed(0)} hPa · ${fmtLL(low.lon, low.lat)}` : "—"],
    ["Jet core", `${f.jet.ms.toFixed(0)} m/s · ${Math.round(f.jet.ms * 3.6)} km/h`],
    ["Heaviest rain", `${f.rain.mmh.toFixed(0)} mm/h`],
    ["Hottest · coldest", `${f.hot.toFixed(0)} · ${f.cold.toFixed(0)} °C`],
  ];
  el.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

// ---------------------------------------------------------------- callouts
const km = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180), a.lat - b.lat) * 111;

function eddyItems(n, t) {
  const ins = insight();
  if (!ins) return [];
  const N = ins.eddies.daily.length, d0 = clamp(Math.floor(t), 0, N - 1), d1 = Math.min(d0 + 1, N - 1), f = t - d0;
  return ins.eddies.daily[d0].slice(0, n).map(([rank, lon, lat, r, swirl]) => {
    const e1 = ins.eddies.daily[d1].find((e) => e[0] === rank);
    if (e1) { lon = lerp(lon, e1[1], f); lat = lerp(lat, e1[2], f); }
    const tr = ins.eddies.tracks[rank];
    const core = tr.core > 0.25 ? "Warm-core" : tr.core < -0.25 ? "Cold-core" : "A";
    return {
      id: `e${rank}`, lon, lat, code: `E${String(rank + 1).padStart(2, "0")}`,
      label: tr.cyclonic ? "Cyclonic eddy" : "Anticyclonic eddy", tone: tr.cyclonic ? "cold" : "warm",
      title: `${Math.round(2 * r)} km across`,
      metrics: [[swirl.toFixed(1), "m/s swirl"], [`${signed(tr.core, 1)}`, "°C core"]],
      text: `${core} ring tracked for ${tr.days} days, drifting ${DIRWORD[tr.heading]} about ${tr.drift} km a day.`,
    };
  });
}
function placeItems(which) {
  const ins = insight();
  if (!ins) return [];
  return which.map((i) => ins.places[i]).filter(Boolean).map((p, i) => ({ id: `p${which[i]}`, lon: p.lon, lat: p.lat, code: `P${which[i] + 1}`, label: "Landmark", title: p.title, text: p.text }));
}
function fastestItem(t) {
  const ins = insight();
  if (!ins) return [];
  const f = ins.fastest[clamp(Math.round(t), 0, ins.fastest.length - 1)];
  const kmh = f.ms * 3.6;
  return [{ id: "fast", lon: f.lon, lat: f.lat, code: "V", label: "Fastest water today", tone: "accent",
    title: `${f.ms.toFixed(2)} m/s`, metrics: [[kmh.toFixed(1), "km/h"], [(f.ms * 1.944).toFixed(1), "knots"]],
    text: kmh > 5 && kmh < 7.5 ? "About the pace of a brisk walk, carrying a river's worth of water many times over." : "The quickest surface current measured in this region today." }];
}
function heatItem(t) {
  const ins = insight();
  if (!ins || !ins.heatwave) return [];
  const h = ins.heatwave[clamp(Math.round(t), 0, ins.heatwave.length - 1)];
  if (!h) return [];
  return [{ id: "hw", lon: h.lon, lat: h.lat, code: "H", label: "Marine heatwave", tone: "warm",
    title: `Up to ${signed(h.peak)} °C above normal`, metrics: [[fmtN(h.km2), "km²"], [signed(h.mean), "°C average"]],
    spark: ins.heatwave.map((x) => (x ? x.km2 : 0)),
    text: "Water more than 2 °C warmer than the 1991–2020 average for this date. Near sharp fronts, part of it is the current running in a new place. The line shows its area over 59 days." }];
}
function oceanCallouts() {
  const t = S.t;
  switch (S.oceanMode) {
    case "anomaly": return [...heatItem(t), ...placeItems([0]), ...eddyItems(1, t)];
    case "speed": return [...fastestItem(t), ...placeItems([0, 1])];
    case "spin": return eddyItems(4, t);
    default: return [...placeItems([0, 1]), ...eddyItems(1, t), ...fastestItem(t)];
  }
}

let missCache = { key: "", item: null };
function forecastCallouts() {
  const fc = S.fc;
  if (!fc) return [];
  const { o, run, t0 } = fc;
  const k = clamp(Math.round(S.t), 0, fc.frames - 1);
  const items = [];
  if (run.verify && k > 0 && S.fcView !== "model") {
    const key = `${S.region}|${S.run}|${k}|${S.fcView}|${Math.round(S.split * 20)}`;
    if (missCache.key !== key) {
      const n = o.n, W = o.W, H = o.H, a = (t0 + k) * n, b = (k - 1) * n;
      let best = -1, bi = 0, bj = 0;
      for (let j = 3; j < H - 3; j += 2) for (let i = 3; i < W - 3; i += 2) {
        if (o.mask[j * W + i] < 128) continue;
        let e = 0;
        for (let dj = -2; dj <= 2; dj += 2) for (let di = -2; di <= 2; di += 2) {
          const q = (j + dj) * W + i + di;
          e += Math.hypot(o.u[a + q] - run.u[b + q], o.v[a + q] - run.v[b + q]);
        }
        const lon = o.sc.lon0 + i * o.sc.dlon, lat = o.sc.lat0 + j * o.sc.dlat;
        const p = flow.toScreen(lon, lat);
        if (!p.visible || (S.fcView === "split" && p.x < S.split * innerWidth + 30)) continue;
        if (e > best) { best = e; bi = i; bj = j; }
      }
      const lon = o.sc.lon0 + bi * o.sc.dlon, lat = o.sc.lat0 + bj * o.sc.dlat;
      const q = bj * W + bi;
      const err = Math.hypot(o.u[a + q] - run.u[b + q], o.v[a + q] - run.v[b + q]);
      missCache = { key, item: best < 0 ? null : { id: "miss", lon, lat, code: "Δ", label: "Biggest miss today", tone: "accent",
        title: `Off by ${err.toFixed(2)} m/s`,
        text: "Fast-changing meanders and newborn eddies are the hardest part to call, and the model softens them the further it looks ahead." } };
    }
    if (missCache.item) items.push(missCache.item);
  }
  if (!run.verify) {
    const end = addDays(run.start, fc.frames - 1);
    items.push({ id: "future", lon: o.sc.focus[0], lat: o.sc.focus[1], code: "F", label: "A real forecast", tone: "accent",
      title: `Through ${fmtDate(end)}`, text: `These days have not happened yet. Come back after ${fmtDate(end, false)} and compare it with the Ocean room.` });
  }
  const ins = insight();
  if (ins) {
    const d = ins.eddies.daily[t0] || [];
    const top = d[0];
    if (top) {
      const tr = ins.eddies.tracks[top[0]];
      items.push({ id: "watch", lon: top[1], lat: top[2], code: `E${String(top[0] + 1).padStart(2, "0")}`, label: "Watch this eddy",
        tone: tr.cyclonic ? "cold" : "warm", title: `${Math.round(2 * top[3])} km ${tr.cyclonic ? "cyclonic" : "anticyclonic"} ring`,
        text: `Where it sat on ${fmtDate(run.start, false)}. Follow it on both sides of the divider.` });
    }
  }
  return items;
}

function windCallouts() {
  const w = S.M.wind, f = w.features[clamp(Math.round(S.t), 0, w.features.length - 1)];
  const items = [];
  const nearRain = km(f.gust, f.rain) < 600;
  items.push({ id: "gust", lon: f.gust.lon, lat: f.gust.lat, code: "W", label: "Strongest surface wind", tone: "accent",
    title: `${f.gust.ms.toFixed(0)} m/s · ${Math.round(f.gust.ms * 3.6)} km/h`,
    metrics: nearRain ? [[f.rain.mmh.toFixed(0), "mm/h rain nearby"]] : [],
    text: nearRain && Math.abs(f.gust.lat) < 30 ? "Violent wind wrapped in heavy rain: the signature of a tropical cyclone." : "The fastest wind 10 m above the surface anywhere on the planet at this hour." });
  if (S.windLayer === "jet") {
    items.push({ id: "jet", lon: f.jet.lon, lat: f.jet.lat, code: "J", label: "Jet stream core", tone: "accent",
      title: `${f.jet.ms.toFixed(0)} m/s · ${Math.round(f.jet.ms * 3.6)} km/h`,
      text: "About 10 km up, near airliner cruising height. The jet steers storms around the planet." });
  }
  f.lows.slice(0, 4).forEach((l, i) => {
    if (km(l, f.gust) < 500) return;
    items.push({ id: `low${i}`, lon: l.lon, lat: l.lat, code: `L${i + 1}`, label: Math.abs(l.lat) < 25 ? "Tropical low" : Math.abs(l.lat) > 55 && l.lat < 0 ? "Southern Ocean storm" : "Storm", tone: "cold",
      title: `${l.hPa.toFixed(0)} hPa`, text: `Low pressure. Winds circle it ${l.lat > 0 ? "anticlockwise" : "clockwise"} and pull in toward the centre.` });
  });
  if (S.rain && !nearRain) {
    items.push({ id: "rain", lon: f.rain.lon, lat: f.rain.lat, code: "R", label: "Heaviest rain", tone: "cold", title: `${f.rain.mmh.toFixed(0)} mm an hour`, text: "The wettest spot on Earth at this hour in the model." });
  }
  return items;
}

function refreshCallouts() {
  if (!S.ready && !S.M) return;
  const items = S.room === "ocean" ? oceanCallouts() : S.room === "forecast" ? forecastCallouts() : windCallouts();
  callouts.max = innerWidth < 900 ? 2 : S.room === "wind" ? 5 : 4;
  callouts.set(S.hideUI ? [] : items);
}

// ---------------------------------------------------------------- timeline
function frameLabel(k) {
  const room = S.room;
  if (room === "ocean") {
    const d = scene().dates;
    return [fmtDate(d[k]), `Day ${k + 1} of ${d.length}`];
  }
  if (room === "forecast") {
    const run = S.fc.run;
    const date = addDays(run.start, k);
    return [fmtDate(date), k === 0 ? "Forecast starts" : `Day ${k} ahead${run.verify ? "" : " · not yet happened"}`];
  }
  const d = windTime(k), w = S.M.wind;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()];
  return [`${day} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} · ${String(d.getUTCHours()).padStart(2, "0")}:00 UTC`, k === 0 ? "Latest analysis" : `+${w.hours[k]} h forecast`];
}
function buildTimeline() {
  const N = S.frames;
  ui.scrubber.max = String(N - 1);
  let rail = "", marks = "";
  for (let k = 0; k < N; k++) {
    const x = ((k / Math.max(N - 1, 1)) * 100).toFixed(3);
    let major = false, mark = "";
    if (S.room === "ocean") {
      const d = scene().dates;
      major = k > 0 && d[k].slice(5, 7) !== d[k - 1].slice(5, 7);
      if (major) mark = MONTHS[Number(d[k].slice(5, 7)) - 1];
    } else if (S.room === "forecast") {
      major = k === 0 || k % 7 === 0;
      if (major) mark = k === 0 ? "Start" : `Day ${k}`;
    } else {
      major = windTime(k).getUTCHours() === 0;
      if (major || k === 0) mark = k === 0 ? "Now" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][windTime(k).getUTCDay()];
    }
    rail += `<i class="${major ? "m" : ""}" style="left:${x}%"></i>`;
    if (mark) marks += `<span class="${Number(x) > 92 ? "r" : ""}" style="left:${x}%">${mark}</span>`;
  }
  ui.rail.innerHTML = rail;
  ui.marks.innerHTML = marks;
  lastFrame = -1;
  renderTime();
}
let lastFrame = -1;
function renderTime() {
  const N = S.frames, x = (S.t / Math.max(N - 1, 1)) * 100;
  ui.fill.style.width = `${x}%`;
  ui.knob.style.left = `${x}%`;
  if (document.activeElement !== ui.scrubber) ui.scrubber.value = String(S.t);
  const k = clamp(Math.round(S.t), 0, N - 1);
  if (k !== lastFrame) {
    lastFrame = k;
    const [a, b] = frameLabel(k);
    ui.date.textContent = a;
    ui.dateSub.textContent = b;
    ui.scrubber.setAttribute("aria-valuetext", a);
    if (S.room === "wind") renderWindStats();
    if (skill) skill.setLead(S.room === "forecast" ? k : 0);
  }
}
function setPlaying(on) {
  S.playing = on;
  ui.play.setAttribute("aria-label", on ? "Pause" : "Play");
  ui.playIcon.innerHTML = on ? '<rect x="2" y="1" width="3" height="10"/><rect x="7" y="1" width="3" height="10"/>' : '<path d="M2.5 1 L11 6 L2.5 11 Z"/>';
}

// ---------------------------------------------------------------- probe
function showProbe(clientX, clientY, tap) {
  if (!S.ready) return;
  const ll = flow.pick(clientX, clientY);
  if (!ll) { ui.probe.hidden = true; return; }
  let body = "";
  if (S.room === "wind") {
    const w = S.M.wind, wd = S.wind, jet = S.windLayer === "jet";
    const g = jet ? w.grid1 : w.grid, W = g.W, H = g.H;
    const x = (((ll.lon - g.lon0) / g.d) % W + W) % W, y = clamp((ll.lat - g.lat0) / g.d, 0, H - 1);
    const i = Math.floor(x), j = Math.floor(y), s = clamp(Math.round(S.t), 0, wd.S - 1), n = W * H;
    const q = s * n + j * W + i;
    const u = jet ? wd.ju[q] : wd.u[q], v = jet ? wd.jv[q] : wd.v[q];
    const sp = Math.hypot(u, v);
    body = `<b>${sp.toFixed(1)} m/s</b> <span>· ${Math.round(sp * 3.6)} km/h from ${heading(-u, -v)}</span>`;
    if (!jet) {
      const q2 = s * wd.n + Math.round(y) * w.grid.W + Math.round(x) % w.grid.W;
      const mmh = rainMmh(wd.rain[q2], w.scales.rainMax);
      body += `<br><b>${wd.air[q2].toFixed(1)} °C</b> air${mmh > 0.2 ? ` <span>·</span> <b>${mmh.toFixed(1)} mm/h</b> rain` : ""}`;
    } else body += "<br><span>about 10 km up</span>";
  } else {
    const o = S.ocean.get(S.region), g = oceanGeo(o.sc);
    const ux = (ll.lon - g.lonEdge) / g.lonSpan, uy = (ll.lat - g.latEdge) / g.latSpan;
    if (!maskAt(o, ux, uy)) body = "<span>Land</span>";
    else if (S.room === "ocean") {
      const u = samplePlane(o.u, o, ux, uy, S.t), v = samplePlane(o.v, o, ux, uy, S.t), sp = Math.hypot(u, v);
      const temp = samplePlane(o.sst, o, ux, uy, S.t);
      const an = o.anom ? samplePlane(o.anom, o, ux, uy, S.t) : null;
      body = `<b>${temp.toFixed(1)} °C</b>${an != null ? ` <span>(${signed(an)} vs normal)</span>` : ""}<br><b>${sp.toFixed(2)} m/s</b> <span>toward ${heading(u, v)}</span>`;
    } else {
      const fc = S.fc, k = S.t, n = o.n;
      const tmp = { W: o.W, H: o.H, n, N: fc.frames };
      const mu = samplePlane(fc.mu, tmp, ux, uy, k), mv = samplePlane(fc.mv, tmp, ux, uy, k), ms = Math.hypot(mu, mv);
      if (fc.run.verify) {
        const tu = samplePlane(o.u, o, ux, uy, fc.t0 + k), tv = samplePlane(o.v, o, ux, uy, fc.t0 + k);
        body = `<span>Reality</span> <b>${Math.hypot(tu, tv).toFixed(2)} m/s</b> <span>toward ${heading(tu, tv)}</span><br><span>Model</span> <b>${ms.toFixed(2)} m/s</b> <span>toward ${heading(mu, mv)}</span>`;
      } else body = `<span>Model</span> <b>${ms.toFixed(2)} m/s</b> <span>toward ${heading(mu, mv)}</span>`;
    }
  }
  ui.probe.innerHTML = `<span>${fmtLL(ll.lon, ll.lat)}</span><br>${body}`;
  ui.probe.hidden = false;
  const pw = ui.probe.offsetWidth, ph = ui.probe.offsetHeight;
  const px = clientX + 16 + pw > innerWidth ? clientX - 16 - pw : clientX + 16;
  const py = clientY + 16 + ph > innerHeight ? clientY - 16 - ph : clientY + 16;
  ui.probe.style.transform = `translate(${px}px, ${py}px)`;
  ui.probe.classList.toggle("is-tap", !!tap);
  clearTimeout(showProbe.timer);
  if (tap) showProbe.timer = setTimeout(() => { ui.probe.hidden = true; }, 2600);
}

// ---------------------------------------------------------------- tour
// Compare an area with places people know (km²).
const AREAS = [["Greenland", 2166086], ["Mexico", 1964375], ["Egypt", 1002450], ["Texas", 695662], ["France", 551695], ["the UK", 243610]];
function heatwaveCaption(id, where) {
  const ins = insight(id), tr = ins && ins.trend;
  const hw = ins && ins.heatwave ? ins.heatwave.filter(Boolean) : [];
  if (!hw.length) return "Red is warmer than the 1991–2020 average for the date.";
  const big = Math.max(...hw.map((h) => h.km2));
  const ref = AREAS.find(([, a]) => big >= a);
  const size = ref ? `bigger than ${ref[0]}` : `${fmtN(sig2(big))} km² across`;
  return `At its largest in these 59 days, a marine heatwave ${where} grew ${size}.${tr ? ` This water warms ${signed(tr.perDecade, 2)} °C per decade.` : ""}`;
}
function tourSteps() {
  const w = S.M.wind, f0 = w && w.features[0];
  const tr = (id) => S.M.insights && S.M.insights[id] && S.M.insights[id].trend;
  const gs = tr("gulf-stream");
  const steps = [
    { room: "ocean", region: "gulf-stream", oceanMode: "heat", secs: 16,
      caption: "The Gulf Stream carries tropical heat north, then leaves the coast at Cape Hatteras and breaks into spinning rings." },
    { room: "ocean", region: "gulf-stream", oceanMode: "anomaly", secs: 15,
      caption: gs ? `Red is warmer than the 1991–2020 average. This water has warmed ${signed(gs.perDecade, 2)} °C per decade since 1982.` : "Red is warmer than the 1991–2020 average for the date." },
    { room: "ocean", region: "agulhas", oceanMode: "spin", secs: 15,
      caption: "Off South Africa the Agulhas Current turns back on itself. Blue eddies turn with the Earth, red ones against it." },
  ];
  if (S.M.forecast) steps.push({ room: "forecast", region: "gulf-stream", run: 2, fcView: "split", secs: 18,
    caption: "Left: what the ocean did. Right: what a neural network trained on seven years of satellite maps predicted, day by day." });
  if (w) {
    steps.push({ room: "wind", windLayer: "surface", windColor: "speed", rain: true, focus: [f0.gust.lon, f0.gust.lat], secs: 16,
      caption: `The strongest wind on Earth right now: ${Math.round(f0.gust.ms * 3.6)} km/h, wrapped in rain.` });
    steps.push({ room: "wind", windLayer: "jet", windColor: "speed", focus: [f0.jet.lon, Math.max(-60, Math.min(60, f0.jet.lat))], secs: 15,
      caption: `Ten kilometres up, the jet stream races at up to ${Math.round(f0.jet.ms * 3.6)} km/h and steers the storms below.` });
  }
  steps.push({ room: "ocean", region: "kuroshio", oceanMode: "heat", secs: 15,
    caption: "Japan's Kuroshio leaves the coast near Tokyo and snakes east as one of the most energetic currents on the planet." },
  { room: "ocean", region: "kuroshio", oceanMode: "anomaly", secs: 15,
    caption: heatwaveCaption("kuroshio", "east of Japan") });
  return steps;
}
async function runTourStep() {
  const steps = tourSteps();
  const st = steps[S.tourStep % steps.length];
  const { room, secs, focus, caption, ...opts } = st;
  S.tourUntil = performance.now() + secs * 1000;
  $("#tourCaption").textContent = caption || "Tour";
  await enterRoom(room, opts);
  if (focus && room === "wind") S.flyTo = { lon: focus[0], lat: clamp(focus[1], -55, 55) };
  setPlaying(true);
}
function startTour() {
  if (S.touring) return;
  S.touring = true;
  S.tourStep = 0;
  ui.tourBtn.setAttribute("aria-pressed", "true");
  ui.tourChip.hidden = false;
  hideIntro();
  closeAbout();
  runTourStep();
}
function stopTour() {
  if (!S.touring) return;
  S.touring = false;
  S.flyTo = null;
  ui.tourBtn.setAttribute("aria-pressed", "false");
  ui.tourChip.hidden = true;
}

// ---------------------------------------------------------------- frame loop
let prev = 0, frameNo = 0, calloutClock = 0;
window.__undertow = { S, flow, callouts };
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min((now - (prev || now)) / 1000, 1 / 20);
  prev = now;
  if (!S.ready) return;
  if (S.playing) {
    S.t += dt * S.rate * BASE_RATE[S.room];
    if (S.t > S.frames - 1) S.t = S.room === "forecast" ? S.frames - 1 : 0;
    if (S.room === "forecast" && S.t >= S.frames - 1) { S.hold = (S.hold || 0) + dt; if (S.hold > 2.5) { S.t = 0; S.hold = 0; } }
  }
  flow.t = clamp(S.t, 0, S.frames - 1);
  if (S.room === "wind") {
    flow.style.sun = sunVector(windTime(flow.t));
    if (S.flyTo) {
      const v = flow.view;
      const dl = ((S.flyTo.lon - v.lon + 540) % 360) - 180;
      v.lon += dl * Math.min(1, dt * 1.6);
      v.lat += (S.flyTo.lat - v.lat) * Math.min(1, dt * 1.6);
      if (Math.abs(dl) < 0.3 && Math.abs(S.flyTo.lat - v.lat) < 0.3) S.flyTo = null;
    } else if (S.idleSpin && now - S.lastInput > 6000 && !reduceMotion) flow.view.lon -= dt * 2.5;
  }
  flow.frame(dt, now);
  if (now - calloutClock > 160) { calloutClock = now; refreshCallouts(); }
  callouts.update(now);
  if (explainer && S.room === "forecast" && !S.hideUI) explainer.draw(now);
  if ((frameNo++ & 3) === 0) renderTime();
  if (S.touring && now > S.tourUntil) { S.tourStep++; runTourStep(); }
  if (!S.touring && now - S.lastInput > 90000 && ui.about.hidden) startTour();
}

// ---------------------------------------------------------------- UI wiring
function hideIntro() { document.body.classList.remove("intro-on"); ui.intro.classList.add("is-out"); setTimeout(() => { ui.intro.hidden = true; }, 900); }
function showIntro() { document.body.classList.add("intro-on"); ui.intro.hidden = false; requestAnimationFrame(() => ui.intro.classList.remove("is-out")); }
function openAbout() { ui.about.hidden = false; $("#aboutBtn").setAttribute("aria-expanded", "true"); $("#aboutClose").focus({ preventScroll: true }); }
function closeAbout() { if (ui.about.hidden) return; ui.about.hidden = true; $("#aboutBtn").setAttribute("aria-expanded", "false"); }
function setHideUI(on) {
  S.hideUI = on;
  ui.hud.classList.toggle("is-off", on);
  ui.probe.hidden = true;
  if (on) closeAbout();
  if (S.room === "forecast") applyForecastView();
  refreshCallouts();
  (on ? $("#reveal") : $("#hideBtn")).focus({ preventScroll: true });
}

$$(".room").forEach((b) => b.addEventListener("click", () => { stopTour(); enterRoom(b.dataset.room); }));
$$(".intro-card").forEach((b) => b.addEventListener("click", () => { stopTour(); hideIntro(); enterRoom(b.dataset.room); }));
$("#begin").addEventListener("click", () => { stopTour(); hideIntro(); enterRoom("ocean"); });
$("#markBtn").addEventListener("click", () => { stopTour(); showIntro(); });
$("#aboutBtn").addEventListener("click", () => (ui.about.hidden ? openAbout() : closeAbout()));
$("#aboutClose").addEventListener("click", closeAbout);
$("#hideBtn").addEventListener("click", () => setHideUI(true));
function toggleFullscreen() {
  const d = document;
  const req = d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen;
  const exit = d.exitFullscreen || d.webkitExitFullscreen;
  const on = d.fullscreenElement || d.webkitFullscreenElement;
  try {
    const p = on ? exit.call(d) : req.call(d.documentElement);
    if (p && p.catch) p.catch(() => { $("#fullBtn").hidden = true; });
  } catch { $("#fullBtn").hidden = true; }
}
$("#fullBtn").addEventListener("click", toggleFullscreen);
if (!document.fullscreenEnabled && !document.webkitFullscreenEnabled) $("#fullBtn").hidden = true;
document.addEventListener("fullscreenchange", () => { $("#fullBtn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen"; });
$("#reveal").addEventListener("click", () => setHideUI(false));
ui.tourBtn.addEventListener("click", () => (S.touring ? stopTour() : startTour()));
ui.insightsBtn.addEventListener("click", () => {
  const open = !ui.right.classList.contains("is-open");
  ui.right.classList.toggle("is-open", open);
  ui.insightsBtn.setAttribute("aria-expanded", String(open));
});
ui.play.addEventListener("click", () => setPlaying(!S.playing));
ui.rate.addEventListener("click", () => { S.rate = RATES[(RATES.indexOf(S.rate) + 1) % RATES.length]; ui.rate.textContent = `${S.rate}×`; });
ui.scrubber.addEventListener("input", () => { S.t = Number(ui.scrubber.value); renderTime(); });

function noteInput(e) {
  S.lastInput = performance.now();
  if (S.touring && e && e.isTrusted && !(e.target && e.target.closest && e.target.closest("#tourBtn"))) stopTour();
}
["pointerdown", "keydown", "wheel"].forEach((ev) => addEventListener(ev, noteInput, { capture: true, passive: true }));
addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") S.lastInput = performance.now(); }, { passive: true });

addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input")) { if (e.key === "Escape") e.target.blur(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === " " && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); setPlaying(!S.playing); }
  else if (k === "arrowright") { setPlaying(false); S.t = Math.min(Math.round(S.t) + 1, S.frames - 1); }
  else if (k === "arrowleft") { setPlaying(false); S.t = Math.max(Math.round(S.t) - 1, 0); }
  else if (k === "h") setHideUI(!S.hideUI);
  else if (k === "f") toggleFullscreen();
  else if (k === "escape") { closeAbout(); if (!ui.intro.hidden) { hideIntro(); enterRoom(S.room); } }
  else if (/^[1-3]$/.test(k)) { hideIntro(); enterRoom(["ocean", "forecast", "wind"][Number(k) - 1]); }
});

// pan / zoom / pinch on the map
const pointers = new Map();
let pinch = null, dragged = false;
ui.canvas.addEventListener("pointerdown", (e) => {
  ui.canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  dragged = false;
  S.flyTo = null;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
ui.canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) { if (e.pointerType === "mouse") showProbe(e.clientX, e.clientY, false); return; }
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2 && pinch) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    flow.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch);
    pinch = d;
    dragged = true;
    return;
  }
  if (!dragged && Math.abs(dx) + Math.abs(dy) < 2) return;
  dragged = true;
  ui.canvas.classList.add("is-grab");
  flow.panBy(dx, dy);
  ui.probe.hidden = true;
});
function endPointer(e) {
  const tap = pointers.has(e.pointerId) && !dragged && pointers.size === 1;
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinch = null;
  if (!pointers.size) ui.canvas.classList.remove("is-grab");
  if (tap && e.type === "pointerup" && e.pointerType !== "mouse") showProbe(e.clientX, e.clientY, true);
}
ui.canvas.addEventListener("pointerup", endPointer);
ui.canvas.addEventListener("pointercancel", endPointer);
ui.canvas.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") ui.probe.hidden = true; });
ui.canvas.addEventListener("wheel", (e) => { e.preventDefault(); flow.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
ui.canvas.addEventListener("dblclick", () => {
  if (S.room === "wind") flow.globeFocus(flow.view.lon, flow.view.lat, 1);
  else focusRegion(scene());
});

// the forecast divider
ui.splitHandle.addEventListener("pointerdown", (e) => {
  ui.splitHandle.setPointerCapture(e.pointerId);
  const move = (ev) => { S.split = clamp(ev.clientX / innerWidth, 0.08, 0.92); placeSplit(); };
  const up = () => { ui.splitHandle.removeEventListener("pointermove", move); ui.splitHandle.removeEventListener("pointerup", up); };
  ui.splitHandle.addEventListener("pointermove", move);
  ui.splitHandle.addEventListener("pointerup", up);
});
ui.splitHandle.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.stopPropagation(); S.split = clamp(S.split + (e.key === "ArrowLeft" ? -0.03 : 0.03), 0.08, 0.92); placeSplit(); }
});

let resizeTimer = 0;
addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    flow.resize();
    flow.globeX = freeCentre() / innerWidth;
    if (S.room === "forecast") applyForecastView();
    if (S.room === "ocean") renderOceanStats();
  }, 120);
});

function renderIntroStats(M) {
  const stats = [];
  if (M.forecast && M.forecast.model.maps) stats.push([M.forecast.model.maps, "satellite current maps"]);
  if (M.insights) {
    const ins = Object.values(M.insights);
    stats.push([ins.reduce((s, r) => s + r.eddies.count, 0), "eddies tracked"]);
    const tr = ins.find((r) => r.trend);
    if (tr) stats.push([tr.trend.years.length, "years of sea temperature"]);
  }
  if (M.forecast) stats.push([M.forecast.model.params, "numbers the model learned"]);
  if (M.wind) stats.push([M.wind.grid.W * M.wind.grid.H, "wind points every 6 h"]);
  const host = $("#introStats");
  host.innerHTML = stats.map(([v, l]) => `<div><dd data-v="${v}">0</dd><dt>${escapeHTML(l)}</dt></div>`).join("");
  const els = $$("dd", host), t0 = performance.now();
  const tick = (now) => {
    const f = reduceMotion ? 1 : clamp((now - t0 - 500) / 1800);
    els.forEach((el) => { el.textContent = fmtN(Number(el.dataset.v) * (1 - Math.pow(1 - f, 3))); });
    if (f < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- boot
async function boot() {
  document.body.classList.add("intro-on");
  setPlaying(S.playing);
  showLoading("Loading the exhibit");
  try {
    S.M = await loadManifests();
  } catch (e) {
    console.error(e);
    fail(`Couldn't load the exhibit's data list (${e.message}). Reload the page to try again.`);
    return;
  }
  const M = S.M;
  const last = M.scenes.scenes[0].dates.at(-1);
  $("#introNote").textContent = `Real data from NOAA · ocean to ${fmtDate(last)}${M.wind ? ` · winds from ${fmtDate(M.wind.run.slice(0, 10))}` : ""} · free and open`;
  const src = [...M.scenes.sources];
  if (M.wind) src.push(M.wind.source);
  $("#sources").innerHTML = src.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${escapeHTML(s.name)}</a></li>`).join("")
    + `<li>Eddy tracking, trends and the neural operator: built for this exhibit from those public records.</li>`;
  renderIntroStats(M);
  if (M.forecast) {
    const ev = Object.values(M.forecast.model.eval.regions);
    const k = 6, gain = ev.reduce((s, r) => s + (1 - r.model[k] / r.persistence[k]), 0) / ev.length;
    const k1 = ev.reduce((s, r) => s + (1 - r.model[0] / r.persistence[0]), 0) / ev.length;
    $("#aboutModel").insertAdjacentHTML("afterend", `<p>Graded on 2026, across all four oceans, its forecasts had <strong>${Math.round(k1 * 100)}% less error</strong> than "nothing changes" one day ahead and <strong>${Math.round(gain * 100)}% less</strong> a week ahead. Part of the long-range gain is hedging: when unsure, it softens eddies rather than guess their exact place, and a soft guess scores better on average than a sharp one in the wrong spot.</p>`);
  }
  if (!M.forecast) { $("#room-forecast").disabled = true; $$('.intro-card[data-room="forecast"]').forEach((b) => (b.disabled = true)); }
  if (!M.wind) { $("#room-wind").disabled = true; $$('.intro-card[data-room="wind"]').forEach((b) => (b.disabled = true)); }
  await enterRoom("ocean");
  requestAnimationFrame(loop);
}
boot();
