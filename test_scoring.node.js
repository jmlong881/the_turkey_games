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
const { buildLeaderboard, reshapeWideForm } = window.Scoring;

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

// ---------------------------------------------------------------------------
// WIDE FORMAT: one row per judge, "<Team> - <Category>" columns -- what you
// get when a judge scores every team in a single Google Form submission.
// Same scores as above, reshaped -- must produce the exact same leaderboard.
// ---------------------------------------------------------------------------
console.log("\n\n==== WIDE FORMAT TEST ====");

const wideCsv = [
  "Judge,Team 1 - Taste,Team 1 - Texture,Team 1 - Presentation,Team 1 - Creativity,Team 2 - Taste,Team 2 - Texture,Team 2 - Presentation,Team 2 - Creativity",
  "Mom,8,7,9,6,7,9,6,9",
  "Dad,8,8,8,7,8,8,7,8",
  "Grandma,9,7,9,6,9,9,7,8",
  "Aunt Sue,8,8,9,7,8,8,7,8",
  "Uncle Dave,2,9,3,1,9,9,8,9",
].join("\n");

const wideRows = parseCSV(wideCsv);
console.log(`Parsed ${wideRows.length} wide rows`);

const resWide = buildLeaderboard(wideRows);
console.log("\n---- WIDE LEADERBOARD (should match the long-format one above) ----");
console.table(resWide.leaderboard.map(r => ({
  Rank: r.Rank, Team: r.Team, Judges: r.JudgesScoring,
  Taste: r.Taste?.toFixed(3), Texture: r.Texture?.toFixed(3),
  Presentation: r.Presentation?.toFixed(3), Creativity: r.Creativity?.toFixed(3),
  WeightedTotal: r.WeightedTotal?.toFixed(3)
})));

const wt1 = resWide.leaderboard.find(r => r.Team === "Team 1");
const wt2 = resWide.leaderboard.find(r => r.Team === "Team 2");

const wideChecks = [
  ["wide Team 2 weighted total ~8.15", approxEqual(wt2.WeightedTotal, 8.15)],
  ["wide Team 1 weighted total ~7.80", approxEqual(wt1.WeightedTotal, 7.80)],
  ["wide Team 2 rank 1", wt2.Rank === 1],
  ["wide Team 1 rank 2", wt1.Rank === 2],
  ["wide 8 flagged rows", resWide.flags.length === 8],
];

console.log("\n---- WIDE CHECKS vs LONG-FORMAT OUTPUT ----");
let wideAllPass = true;
for (const [label, pass] of wideChecks) {
  console.log((pass ? "PASS " : "FAIL ") + label);
  if (!pass) wideAllPass = false;
}
if (!wideAllPass) { console.error("\nSOME WIDE-FORMAT CHECKS FAILED"); process.exit(1); }
console.log("\nALL WIDE-FORMAT CHECKS PASSED -- reshape matches long format exactly");

// ---------------------------------------------------------------------------
// REAL-WORLD MESSY HEADERS: a stray extra column, a trailing colon on
// "Judge:", and real team names ("Team Mom" / "Team Dad") -- shaped exactly
// like an actual Google Forms export a user ran into. Same scores again,
// must produce the same leaderboard.
// ---------------------------------------------------------------------------
console.log("\n\n==== MESSY-HEADER TEST ====");

const messyCsv = [
  "Timestamp,Column 2,Judge:,Team Mom - Taste,Team Mom - Texture,Team Mom - Presentation,Team Mom - Creativity,Team Dad - Taste,Team Dad - Texture,Team Dad - Presentation,Team Dad - Creativity",
  "1,,Mom,8,7,9,6,7,9,6,9",
  "2,,Dad,8,8,8,7,8,8,7,8",
  "3,,Grandma,9,7,9,6,9,9,7,8",
  "4,,Aunt Sue,8,8,9,7,8,8,7,8",
  "5,,Uncle Dave,2,9,3,1,9,9,8,9",
].join("\n");

const messyRows = parseCSV(messyCsv);
console.log(`Parsed ${messyRows.length} messy-header rows`);

const resMessy = buildLeaderboard(messyRows);
console.log("\n---- MESSY-HEADER LEADERBOARD (Team Mom = old Team 1, Team Dad = old Team 2) ----");
console.table(resMessy.leaderboard.map(r => ({
  Rank: r.Rank, Team: r.Team, Judges: r.JudgesScoring,
  Taste: r.Taste?.toFixed(3), Texture: r.Texture?.toFixed(3),
  Presentation: r.Presentation?.toFixed(3), Creativity: r.Creativity?.toFixed(3),
  WeightedTotal: r.WeightedTotal?.toFixed(3)
})));

const mtMom = resMessy.leaderboard.find(r => r.Team === "Team Mom");
const mtDad = resMessy.leaderboard.find(r => r.Team === "Team Dad");

const messyChecks = [
  ["messy Team Dad weighted total ~8.15", approxEqual(mtDad.WeightedTotal, 8.15)],
  ["messy Team Mom weighted total ~7.80", approxEqual(mtMom.WeightedTotal, 7.80)],
  ["messy Team Dad rank 1", mtDad.Rank === 1],
  ["messy Team Mom rank 2", mtMom.Rank === 2],
  ["messy 8 flagged rows", resMessy.flags.length === 8],
];

console.log("\n---- MESSY-HEADER CHECKS ----");
let messyAllPass = true;
for (const [label, pass] of messyChecks) {
  console.log((pass ? "PASS " : "FAIL ") + label);
  if (!pass) messyAllPass = false;
}
if (!messyAllPass) { console.error("\nSOME MESSY-HEADER CHECKS FAILED"); process.exit(1); }
console.log("\nALL MESSY-HEADER CHECKS PASSED -- trailing colon / stray column / named teams all handled");
