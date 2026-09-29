// All site copy lives here so it can be edited without touching layout code.

import { attention, docToSchema, genomeSpace, orbits, recordsToReport } from "./sketches/index.js";
import { dawnChorus, thermalMemory, undertow, watershed } from "./sketches/concepts.js";

export const CONTACT = {
  email: "darianslalla@gmail.com",
  linkedin: "https://www.linkedin.com/in/darian-lalla-a1b16311b/",
  github: "https://github.com/Darskye",
};

export const STATEMENT =
  "I'm Darian, a data scientist and creative technologist. I build machine learning systems, automation, and interactive work where rigorous data meets visual imagination.";

export const ORIGIN =
  "Trained in environmental science, sharpened by a master's in Data Science. I turn messy, high-stakes data into models, pipelines and tools, and sometimes into art.";

export const WORK = [
  {
    code: "D001",
    aspect: 0.8,
    title: "Tier II Data Automation",
    tags: "Data engineering · Regulatory tech",
    body: "Python + SQL tooling that consolidates chemical inventories, computes reportable quantities and maps hazard classifications for EPA Tier II reporting.",
    sketch: recordsToReport,
    alt: "A cloud of records flowing into a unit chart grouped by hazard class",
  },
  {
    code: "D002",
    aspect: 0.8,
    title: "SDS → Structured Data",
    tags: "NLP · Data modeling · ETL",
    body: "A schema and extraction pipeline that turns unstructured safety data sheets into normalized records ready for analytics and AI.",
    sketch: docToSchema,
    alt: "A document being scanned while extracted fields fly into a table",
  },
  {
    code: "D003",
    aspect: 0.8,
    title: "Environmental AI & Automation",
    tags: "LLMs · Retrieval · Automation",
    body: "LLM workflows that speed up document search, encode compliance logic and draft reports automatically, so specialists spend time on judgment instead of paperwork.",
    sketch: attention,
    alt: "A causal self-attention heatmap over a compliance question",
  },
  {
    code: "D004",
    aspect: 2.33,
    title: "HELIOS",
    tags: "Data viz · WebGL · Live APIs",
    body: "A live WebGL solar system. Planets are solved from Keplerian elements in the browser and fed by NASA near-Earth-object and solar-flare data plus live satellite orbits.",
    link: ["Source", "https://github.com/Darskye/helios-terminal"],
    sketch: orbits,
    alt: "Planets moving on Keplerian orbits around a glowing sun",
  },
  {
    code: "D005",
    aspect: 0.8,
    title: "Fable — Artificial Life",
    tags: "Simulation · Emergence · WebGL",
    body: "An artificial-life observatory. Organisms carry a seven-gene genome, compete for energy and reproduce with mutation. There is no fitness function: kinship, aggression and cooperation emerge from local rules. Built with React Three Fiber and instanced rendering.",
    sketch: genomeSpace,
    alt: "Organisms plotted in genome space, drifting and branching into lineages, above a population streamgraph",
  },
];

export const CONCEPTS_INTRO =
  "Some of the most interesting systems don't exist yet. These are concept studies: imagined models, built on real methods, for questions I'd love to answer.";

export const CONCEPTS = [
  {
    code: "C01",
    aspect: 2.33,
    title: "Undertow",
    tags: "Neural operators · Ocean · Forecasting",
    body: "A neural-operator surrogate for ocean heat transport. It learns the physics of currents from simulation runs, then forecasts sea-surface temperature a thousand times faster than the solver it was trained on.",
    sketch: undertow,
    alt: "Thousands of particles tracing warm and cold ocean currents through gyres and a boundary current",
  },
  {
    code: "C02",
    aspect: 1,
    title: "Dawn Chorus",
    tags: "Bioacoustics · Audio ML · Biodiversity",
    body: "Listens to 24 hours of rainforest audio and folds it into one biodiversity fingerprint. Each ring is a frequency band; each spark is a call the model attributes to a species group.",
    sketch: dawnChorus,
    alt: "A circular 24-hour spectrogram with a radar sweep lighting up detected animal calls",
  },
  {
    code: "C03",
    aspect: 1,
    title: "Thermal Memory",
    tags: "Transformers · Imputation · Climate",
    body: "Reconstructs 175 years of monthly temperature from digitised ship logbooks and weather diaries, with a transformer that treats missing data as something to learn rather than drop.",
    sketch: thermalMemory,
    alt: "A climate spiral winding outward past the 1.5 degree ring above a band of warming stripes",
  },
  {
    code: "C04",
    aspect: 0.8,
    title: "Watershed",
    tags: "Graph neural nets · Hydrology · Water quality",
    body: "Treats a river basin as a graph. Every tributary is a node, and message passing carries rainfall and fertiliser runoff downstream to forecast nitrate at the gauge 48 hours ahead.",
    sketch: watershed,
    alt: "A branching river network coloured by nitrate, with pulses flowing to a gauge and a forecast sparkline",
  },
];

export const LAB = [
  {
    code: "L01",
    title: "OSHA Inspection Pulse",
    body: "Python pipeline that pulls the last 30 days of OSHA inspections and violations from the DOL API, decodes and geocodes them with pandas, and builds a standalone Plotly dashboard.",
    tags: "Data engineering · Public data",
  },
  {
    code: "L02",
    title: "Crownfall Tactics",
    body: "Tactics-RPG prototype built on an AI-generated pixel-art pipeline and a hand-rolled isometric canvas engine.",
    tags: "Game · AI art pipeline",
    link: ["Play", "https://merry-tribe-527.higgsfield.app/"],
  },
  {
    code: "L03",
    title: "The Drowned Courier",
    body: "Narrative detective RPG: a 45-node branching dialogue graph, dice-driven skill checks and AI-painted scenes.",
    tags: "Game · Narrative systems",
    link: ["Play", "https://stellar-warbler-708.higgsfield.app/"],
  },
  {
    code: "L04",
    title: "Claude Buddy",
    body: "ESP32-S3 desk-companion firmware that visualises an AI coding agent's live state and token usage on a 0.85″ round display.",
    tags: "Embedded · IoT",
    link: ["Source", "https://github.com/Darskye/claude-buddy"],
  },
  {
    code: "L05",
    title: "This site",
    body: "A raymarched ASCII sculpture, a fluid-simulated name sign and nine generative data plates in a viewfinder index. No images, no templates; every pixel is computed.",
    tags: "WebGL2 · Generative",
    link: ["Source", "https://github.com/Darskye/darian-lalla"],
  },
];

export const CAPABILITIES = [
  ["Machine learning", "Predictive models, classification, NLP"],
  ["LLM workflows", "Retrieval, agents, document automation"],
  ["Data engineering", "Pipelines, ETL, warehousing"],
  ["Analytics", "Statistics, dashboards, storytelling"],
  ["Creative technology", "WebGL, shaders, generative visuals"],
  ["Interactive prototypes", "Apps, games, installations"],
  ["Environmental data", "Tier II, SDS/GHS, OSHA, IoT sensing"],
];

export const CLUSTERS = [
  {
    name: "MACHINE LEARNING",
    at: [0.2, 0.3],
    label: [0.05, 0.1],
    skills: ["scikit-learn", "TensorFlow", "NLP", "LLMs", "Generative AI", "Simulation"],
  },
  {
    name: "DATA ENGINEERING",
    at: [0.66, 0.27],
    label: [0.56, 0.08],
    skills: ["Python", "SQL", "PostgreSQL", "Snowflake", "dbt", "Airflow", "Pandas", "NumPy"],
  },
  {
    name: "ANALYTICS & VIZ",
    at: [0.72, 0.74],
    label: [0.64, 0.96],
    skills: ["Tableau", "Power BI", "Excel", "Statistics", "Dashboards"],
  },
  {
    name: "CREATIVE TECH",
    at: [0.24, 0.74],
    label: [0.05, 0.96],
    skills: ["Three.js", "WebGL / GLSL", "React", "React Native", "Blender", "Godot"],
  },
  {
    name: "ENVIRONMENT & SAFETY",
    at: [0.46, 0.52],
    label: [0.36, 0.38],
    skills: ["Tier II / EPCRA", "SDS / GHS", "OSHA", "IoT sensing", "Compliance"],
  },
];

export const PAPER = {
  code: "P01",
  venue: "Chapter 3 · Cognitive Sensing Technologies and Applications · IET",
  title:
    "Performance evaluation of cognitive sensor frameworks for IoT applications in healthcare and environment monitoring",
  authors: "Amitabh Mishra, Darian S. Lalla, John Compo",
  links: [
    ["DOI", "https://doi.org/10.1049/PBCE135E_ch3"],
    ["IET Digital Library", "https://digital-library.theiet.org/doi/10.1049/pbce135e_ch3"],
  ],
};

export const NOTES = [
  "Why environmental compliance is fundamentally a data problem",
  "Automation as a climate tool for reporting workflows",
  "From environmental specialist to data & AI: a non-traditional path",
];

export const ABOUT = [
  "I came to data through the environment. My bachelor's is in Environmental Science and Sustainable Technology and my master's is in Data Science. Along the way I learned that compliance, safety and sustainability are really data problems: messy, high-stakes, and full of patterns waiting to be found.",
  "Today I work across the whole arc, from SQL and statistics to machine learning and LLM workflows, and out the other side into WebGL, generative visuals and interactive prototypes. I care about rigor and I care about beauty. The best work has both.",
];

export const FACTS = [
  ["Education", "M.S. Data Science\nB.S. Environmental Science & Sustainable Technology"],
  ["Focus", "Machine learning, data science, creative technology"],
  ["Path", "Environment → data → AI"],
  ["Open to", "Roles, research and collaborations"],
];
