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
    notes: [
      { at: [0.22, 0.5], side: "l", title: "Raw records", text: "Every dot is one line of a site's chemical inventory." },
      { at: [0.62, 0.56], side: "r", title: "Aggregation", text: "Quantities roll up by chemical and hazard class, not by spreadsheet." },
      { at: [0.8, 0.87], side: "r", title: "Hazard classes", text: "GHS categories mapped automatically onto Tier II fields." },
    ],
    spec: [
      ["Input", "Site chemical inventories"],
      ["Method", "Python + SQL consolidation, hazard mapping"],
      ["Output", "EPA Tier II-ready figures"],
    ],
    sketch: recordsToReport,
    alt: "A cloud of records flowing into a unit chart grouped by hazard class",
  },
  {
    code: "D002",
    aspect: 0.8,
    title: "SDS → Structured Data",
    tags: "NLP · Data modeling · ETL",
    body: "A schema and extraction pipeline that turns unstructured safety data sheets into normalized records ready for analytics and AI.",
    notes: [
      { at: [0.26, 0.34], side: "l", title: "Unstructured SDS", text: "Free-text safety data sheets: 16 sections, no consistent layout." },
      { at: [0.26, 0.64], side: "l", title: "Extraction pass", text: "A scan lifts entities (CAS numbers, hazards, PPE) out of the prose." },
      { at: [0.74, 0.45], side: "r", title: "Normalised schema", text: "Each sheet becomes one clean, queryable record." },
    ],
    spec: [
      ["Input", "Safety data sheets (PDF / text)"],
      ["Method", "Schema design, ETL, NLP extraction"],
      ["Output", "Normalised records for analytics & AI"],
    ],
    sketch: docToSchema,
    alt: "A document being scanned while extracted fields fly into a table",
  },
  {
    code: "D003",
    aspect: 0.8,
    title: "Environmental AI & Automation",
    tags: "LLMs · Retrieval · Automation",
    body: "LLM workflows that speed up document search, encode compliance logic and draft reports automatically, so specialists spend time on judgment instead of paperwork.",
    notes: [
      { at: [0.08, 0.45], side: "l", title: "The question", text: "A compliance query, split into tokens." },
      { at: [0.5, 0.5], side: "r", title: "Attention", text: "Brighter cells are the words the model leans on to answer." },
      { at: [0.82, 0.24], side: "r", title: "Causal mask", text: "Each token only looks backwards, the way text is written." },
    ],
    spec: [
      ["Input", "Regulations, permits, internal documents"],
      ["Method", "LLM workflows, retrieval, compliance logic"],
      ["Output", "Answers with sources, drafted reports"],
    ],
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
    notes: [
      { at: [0.5, 0.445], side: "r", title: "Asteroid belt", text: "Hundreds of bodies between Mars and Jupiter, each on its own orbit." },
      { at: [0.5, 0.54], side: "r", title: "Solved live", text: "Planet positions computed from Keplerian elements at today's date." },
      { at: [0.5, 0.893], side: "r", title: "Compressed scale", text: "Radius ∝ a^0.52, so Mercury and Neptune share one screen." },
    ],
    spec: [
      ["Input", "NASA NEO & DONKI feeds, CelesTrak orbits"],
      ["Method", "Orbital mechanics in the browser, three.js"],
      ["Output", "An interactive, live solar system"],
    ],
    sketch: orbits,
    alt: "Planets moving on Keplerian orbits around a glowing sun",
  },
  {
    code: "D005",
    aspect: 0.8,
    title: "Fable — Artificial Life",
    tags: "Simulation · Emergence · WebGL",
    body: "An artificial-life observatory. Organisms carry a seven-gene genome, compete for energy and reproduce with mutation. There is no fitness function: kinship, aggression and cooperation emerge from local rules. Built with React Three Fiber and instanced rendering.",
    notes: [
      { at: [0.28, 0.27], side: "l", title: "Resource niches", text: "Food drifts through genome space. There is no fitness function." },
      { at: [0.7, 0.25], side: "r", title: "Lineages", text: "Dashed hulls: families that drift, split and die out." },
      { at: [0.5, 0.83], side: "r", title: "Population", text: "Each band is one lineage's share of the living." },
    ],
    spec: [
      ["Input", "Seven-gene genomes, energy, weather"],
      ["Method", "Agent-based simulation, emergence"],
      ["Output", "Real-time 3D observatory"],
    ],
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
    notes: [
      { at: [0.11, 0.5], side: "l", title: "Boundary current", text: "Warm water racing north along the western edge." },
      { at: [0.58, 0.66], side: "r", title: "Subtropical gyre", text: "The surrogate learns this rotation from simulation runs." },
      { at: [0.88, 0.94], side: "r", title: "Sea-surface temp.", text: "Particles carry their temperature: heat, transported." },
    ],
    spec: [
      ["Input", "Ocean model runs (velocity, SST)"],
      ["Method", "Fourier neural-operator surrogate"],
      ["Output", "6-hourly heat-transport forecasts"],
    ],
    sketch: undertow,
    link: ["Explore the real-data exhibit", "lab/undertow/"],
    alt: "Thousands of particles tracing warm and cold ocean currents through gyres and a boundary current",
  },
  {
    code: "C02",
    aspect: 1,
    title: "Dawn Chorus",
    tags: "Bioacoustics · Audio ML · Biodiversity",
    body: "Listens to 24 hours of rainforest audio and folds it into one biodiversity fingerprint. Each ring is a frequency band; each spark is a call the model attributes to a species group.",
    notes: [
      { at: [0.745, 0.52], side: "r", title: "Dawn chorus", text: "05:30 to 07:00, birdsong floods 2 to 8 kHz." },
      { at: [0.5, 0.19], side: "r", title: "Night insects", text: "A steady high band from dusk to dawn." },
      { at: [0.38, 0.4], side: "l", title: "Frogs", text: "Low calls under 2 kHz after dark." },
      { at: [0.5, 0.52], side: "l", title: "Acoustic index", text: "ACI summarises how busy the soundscape is." },
    ],
    spec: [
      ["Input", "24 h of passive acoustic recordings"],
      ["Method", "Spectrogram CNN, call attribution"],
      ["Output", "A biodiversity fingerprint per site"],
    ],
    sketch: dawnChorus,
    alt: "A circular 24-hour spectrogram with a radar sweep lighting up detected animal calls",
  },
  {
    code: "C03",
    aspect: 1,
    title: "Thermal Memory",
    tags: "Transformers · Imputation · Climate",
    body: "Reconstructs 175 years of monthly temperature from digitised ship logbooks and weather diaries, with a transformer that treats missing data as something to learn rather than drop.",
    notes: [
      { at: [0.707, 0.44], side: "r", title: "One loop, one year", text: "Distance from the centre is the temperature anomaly." },
      { at: [0.5, 0.118], side: "r", title: "+1.5 °C", text: "The Paris Agreement threshold." },
      { at: [0.3, 0.89], side: "l", title: "Warming stripes", text: "One stripe per year, 1850 to 2025." },
    ],
    spec: [
      ["Input", "Ship logbooks, weather diaries"],
      ["Method", "Transformer with learned imputation"],
      ["Output", "Monthly temperature reconstruction"],
    ],
    sketch: thermalMemory,
    alt: "A climate spiral winding outward past the 1.5 degree ring above a band of warming stripes",
  },
  {
    code: "C04",
    aspect: 0.8,
    title: "Watershed",
    tags: "Graph neural nets · Hydrology · Water quality",
    body: "Treats a river basin as a graph. Every tributary is a node, and message passing carries rainfall and fertiliser runoff downstream to forecast nitrate at the gauge 48 hours ahead.",
    notes: [
      { at: [0.3, 0.22], side: "l", title: "Sources", text: "Land use sets the runoff: farmland, forest, urban." },
      { at: [0.5, 0.62], side: "r", title: "Message passing", text: "Each junction mixes what flows in from upstream." },
      { at: [0.5, 0.9], side: "l", title: "Gauge", text: "Where the model forecasts nitrate 48 h ahead." },
    ],
    spec: [
      ["Input", "Rainfall, land use, river network"],
      ["Method", "Graph neural network on the basin"],
      ["Output", "48 h nitrate forecast at the gauge"],
    ],
    sketch: watershed,
    alt: "A branching river network coloured by nitrate, with pulses flowing to a gauge and a forecast sparkline",
  },
];

export const BUDDY = {
  title: "Claude Buddy",
  body: "Desk-companion firmware for a LilyGo T-QT Pro (ESP32-S3, 0.85″ 128×128 display) that shows an AI coding agent's live state and token usage.",
  tags: "Embedded · IoT · C++",
  link: ["Source", "https://github.com/Darskye/claude-buddy"],
};

export const CAPABILITIES = [
  ["Machine learning", "Predictive models, classification, NLP"],
  ["LLM workflows", "Retrieval, agents, document automation"],
  ["Data engineering", "Pipelines, ETL, warehousing"],
  ["Analytics", "Statistics, dashboards, storytelling"],
  ["Creative technology", "WebGL, shaders, generative visuals"],
  ["Interactive prototypes", "Apps, tools, installations"],
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
  kind: "Peer-reviewed · Book chapter",
  title:
    "Performance evaluation of cognitive sensor frameworks for IoT applications in healthcare and environment monitoring",
  authors: ["Amitabh Mishra", "Darian S. Lalla", "John Compo"],
  meta: [
    ["Book", "Cognitive Sensing Technologies and Applications"],
    ["Publisher", "The Institution of Engineering and Technology (IET)"],
    ["Chapter", "3"],
    ["Pages", "73–97"],
    ["Year", "2023"],
    ["ISBN", "978-1-83953-689-2"],
    ["DOI", "10.1049/PBCE135E_ch3"],
  ],
  bibtex: `@incollection{mishra2023cognitive,
  title     = {Performance evaluation of cognitive sensor frameworks
               for IoT applications in healthcare and environment monitoring},
  author    = {Mishra, Amitabh and Lalla, Darian S. and Compo, John},
  booktitle = {Cognitive Sensing Technologies and Applications},
  publisher = {The Institution of Engineering and Technology},
  chapter   = {3},
  pages     = {73--97},
  year      = {2023},
  doi       = {10.1049/PBCE135E_ch3}
}`,
  links: [
    ["DOI", "https://doi.org/10.1049/PBCE135E_ch3"],
    ["IET Digital Library", "https://digital-library.theiet.org/doi/10.1049/pbce135e_ch3"],
  ],
};

export const NOTES = [
  { file: "compliance-is-a-data-problem.md", title: "Why environmental compliance is fundamentally a data problem" },
  { file: "automation-as-a-climate-tool.md", title: "Automation as a climate tool for reporting workflows" },
  { file: "a-non-traditional-path.md", title: "From environmental specialist to data & AI: a non-traditional path" },
];

export const ABOUT = [
  "I came to data through the environment. My bachelor's is in Environmental Science and Sustainable Technology and my master's is in Data Science. Along the way I learned that compliance, safety and sustainability are really data problems: messy, high-stakes, and full of patterns waiting to be found.",
  "Today I work across the whole arc, from SQL and statistics to machine learning and LLM workflows, and out the other side into WebGL, generative visuals and interactive prototypes. I care about rigor and I care about beauty. The best work has both.",
];

// About, told as a signal path: one line that changes character with each chapter.
export const CHAPTERS = [
  {
    code: "01",
    label: "Environment",
    word: "SENSE",
    style: "Organic",
    text: "I came to data through the environment: air, water, chemicals and the rules wrapped around them. My bachelor's is in Environmental Science and Sustainable Technology, and my first published work was on sensor frameworks for environmental monitoring.",
  },
  {
    code: "02",
    label: "Data",
    word: "MEASURE",
    style: "Quantised",
    text: "Along the way I learned that compliance, safety and sustainability are really data problems: messy, high-stakes and full of patterns waiting to be found. A master's in Data Science turned that into pipelines, models and tools.",
  },
  {
    code: "03",
    label: "AI + Art",
    word: "IMAGINE",
    style: "Generative",
    text: "Now I work across the whole arc: machine learning and LLM workflows, and out the other side into WebGL, generative visuals and interactive prototypes. I care about rigor and I care about beauty. The best work has both.",
  },
];

export const FACTS = [
  ["Name", "Darian Lalla"],
  ["Class", "Data scientist × creative technologist"],
  ["Education", "M.S. Data Science\nB.S. Environmental Science & Sustainable Technology"],
  ["Path", "Environment → Data → AI"],
  ["Focus", "Machine learning, data science, creative technology"],
  ["Open to", "Roles, research and collaborations"],
];
