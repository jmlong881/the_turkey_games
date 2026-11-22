// Quick cross-check against the already-verified R output (test_scoring.R /
// the Rmd's demo dataset) -- same 10 rows, same expected numbers.
const fs = require("fs");
const path = require("path");

global.window = global;
window.COOKOFF_CONFIG = {
  CSV_URL: "",
  DEMO_CSV_PATH: "sample_scores.csv",
  REFRESH_SECONDS: 20,
  CATEGORY_WEIGHTS: { Taste: 0.40, Texture: 0.25, Presentation: 0.20, Creativity: 0.15 },
  FLAG_GAP: 3,
  EVENT_NAME: "test"
};
require("./scoring.js");
const { buildLeaderboard } = window.Scoring;

// minimal CSV parse (no quoted-comma fields in this sample, so simple split is fine)
function parseCSV(text) {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cells = line.split(",");
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = cells[i]; });
    return obj;
  });
}

const csvText = fs.readFileSync(path.join(__dirname, "sample_scores.csv"), "utf8");
const rows = parseCSV(csvText);
console.log(`Parsed ${rows.length} rows`);

const res = buildLeaderboard(rows);

console.log("\n---- LEADERBOARD ----");
console.table(res.leaderboard.map(r => ({
  Rank: r.Rank, Team: r.Team, Judges: r.JudgesScoring,
  Taste: r.Taste?.toFixed(3), Texture: r.Texture?.toFixed(3),
  Presentation: r.Presentation?.toFixed(3), Creativity: r.Creativity?.toFixed(3),
  WeightedTotal: r.WeightedTotal?.toFixed(3)
})));

console.log("\n---- FLAGS COUNT ----", res.flags.length);

// Expected from the already-verified R run (test_scoring.R):
//   Team 2 Weighted Total = 8.15 (rank 1), Team 1 = 7.80 (rank 2)
//   8 flagged/trimmed rows
const t1 = res.leaderboard.find(r => r.Team === "Team 1");
const t2 = res.leaderboard.find(r => r.Team === "Team 2");

function approxEqual(a, b, eps = 0.01) { return Math.abs(a - b) < eps; }

const checks = [
  ["Team 2 weighted total ~8.15", approxEqual(t2.WeightedTotal, 8.15)],
  ["Team 1 weighted total ~7.80", approxEqual(t1.WeightedTotal, 7.80)],
  ["Team 2 rank 1", t2.Rank === 1],
  ["Team 1 rank 2", t1.Rank === 2],
  ["8 flagged rows", res.flags.length === 8],
];

console.log("\n---- CHECKS vs R OUTPUT ----");
let allPass = true;
for (const [label, pass] of checks) {
  console.log((pass ? "PASS " : "FAIL ") + label);
  if (!pass) allPass = false;
}
if (!allPass) { console.error("\nSOME CHECKS FAILED"); process.exit(1); }
console.log("\nALL CHECKS PASSED -- JS matches the verified R output");
