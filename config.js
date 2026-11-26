// config.js
// -----------------------------------------------------------------------
// Everything you'd want to change without touching scoring.js or index.html
// lives here.
// -----------------------------------------------------------------------
window.COOKOFF_CONFIG = {
  // Paste your published Google Sheet CSV link here once it exists.
  // Google Sheet -> File -> Share -> Publish to web -> pick the responses
  // tab -> CSV -> Publish -> copy the link it gives you.
  //
  // Leave this EMPTY ("") to run the page against the bundled demo data
  // (sample_scores.csv) instead -- handy for testing before the event.
  CSV_URL: "https://docs.google.com/spreadsheets/d/e/2PACX-1vRhXOkkjPzW1h-VJ4nTe4dQ3ebQmhyFyQqiEMN6j7SQ-1Q3t1-kCKcG-tzUf1hJ_A3tyBm67iitFFcl/pub?gid=409080413&single=true&output=csv",

  // Local fallback/demo file, used only when CSV_URL is empty above.
  DEMO_CSV_PATH: "sample_scores.csv",

  // How often (seconds) the page re-fetches the CSV and recalculates.
  REFRESH_SECONDS: 20,

  // Must match the weights on the printed rubric.
  CATEGORY_WEIGHTS: {
    Taste: 0.40,
    Texture: 0.25,
    Presentation: 0.20,
    Creativity: 0.15
  },

  // A score this many points from its team's median gets flagged on the
  // Judge Calibration tab, even if it wasn't mathematically trimmed.
  FLAG_GAP: 3,

  EVENT_NAME: "The Long Family Turkey Games"
};
