# darian lalla

Portfolio of Darian Lalla: data science, machine learning and creative technology.
Live at **https://darskye.github.io/darian-lalla/**

Every image on the site is computed live in the browser. There are no image files.

- **Fluid sign**: the name is a WebGL2 stable-fluids simulation. The cursor pushes a velocity field whose accumulated flow displaces the letters, and an 8-sample spectral pass splits fast motion into RGB fringes.
- **ASCII sculpture**: a two-pass renderer. A raymarched SDF morphs through an ML pipeline (raw data → clustering → neural net → model → signal) and is drawn as density-sorted glyphs.
- **Viewfinder index**: a pinned, scroll-driven project browser with rulers, crosshair guides and a picker wheel. Each project's plate is a generative sketch (`src/sketches`) that can render as image, coloured ASCII or dithered pixels.
- **Concepts** (C01–C04) are clearly marked concept studies: imagined systems built on real methods.

## Develop

```bash
npm install
npm run dev
```

All copy lives in `src/content.js`. Pushing to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`).

URL params for screenshots: `?t=16` (animation clock), `?y=2400` (scroll), `?img=text`, `?mood=light`.

## Lab: Undertow, a data exhibit

`public/lab/undertow/` (served at `/lab/undertow/`) is a standalone, museum-style WebGL exhibit in three rooms:

- **Ocean**: 59 days of satellite-altimetry surface currents and NOAA OISST temperature for four western boundary currents, with automatically detected and tracked eddies, marine heatwaves against the 1991–2020 normal, and a 45-year warming record.
- **Forecast**: a Fourier neural operator trained on 2019–2024 satellite current maps, validated on 2025 and graded on 2026, shown side by side with what happened.
- **Wind**: NOAA GFS surface wind, jet stream, air temperature, rain and pressure on a globe, 72 hours ahead.

The page is plain ES modules (`js/`), no build step. Data comes from free public NOAA services; the tools in `tools/undertow/` rebuild everything:

```bash
pip install numpy scipy netCDF4 pygrib torch
python tools/undertow/fetch_data.py --days 60 --end 2026-09-28   # display window (ocean)
python tools/undertow/fetch_history.py --end 2026-09-28          # long records (cached, not committed)
python tools/undertow/fetch_data.py --days 60 --end 2026-09-28   # again, now with the anomaly layer
python tools/undertow/analyze.py                                 # eddies, heatwaves, trends
python tools/undertow/train_fno.py train --minutes 60            # CPU is enough
python tools/undertow/train_fno.py eval && python tools/undertow/train_fno.py export
python tools/undertow/fetch_wind.py                               # latest GFS run
```

The trained weights are kept in `tools/undertow/model/fno.pt`.

Fonts: Geist and Geist Mono (OFL), and a static wide instance of Anybody (OFL, see `src/fonts/OFL-Anybody.txt`).
