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

Fonts: Geist and Geist Mono (OFL), and a static wide instance of Anybody (OFL, see `src/fonts/OFL-Anybody.txt`).
