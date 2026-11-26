// ---------------------------------------------------------------------------
// scoring.js
// A JavaScript port of scoring_logic.R -- same weights, same outlier-trimming
// rule. Kept as close to the R version's structure and comments as possible
// so the two stay easy to compare. Turkey only this year -- one dish, no
// separate courses to average together.
// ---------------------------------------------------------------------------

const CFG = window.COOKOFF_CONFIG;
const CATEGORIES = Object.keys(CFG.CATEGORY_WEIGHTS);

function median(nums) {
  const a = [...nums].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return NaN;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (a[mid - 1] + a[mid]) / 2 : a[mid];
}

function mean(nums) {
  return nums.reduce((s, x) => s + x, 0) / nums.length;
}

// Robust average for one team's scores in one category.
//   n <= 2  : plain mean (not enough scores to safely drop anything)
//   n == 3  : median (the middle score already neutralizes one outlier)
//   n >= 4  : drop the single highest AND single lowest score, average the
//             rest (same trick Olympic diving/gymnastics judging uses)
function robustScore(values) {
  const x = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
  const n = x.length;
  if (n === 0) return NaN;
  if (n <= 2) return mean(x);
  if (n === 3) return median(x);
  const sorted = [...x].sort((a, b) => a - b);
  return mean(sorted.slice(1, n - 1)); // drop one min, one max
}

// Rank descending by value, ties share the minimum rank (same as R's
// rank(-value, ties.method = "min")). Entries with a non-finite value get
// rank = null and sort last.
function rankDescending(items, valueFn) {
  const withIdx = items.map((item, i) => ({ item, i, v: valueFn(item) }));
  const valid = withIdx.filter(e => Number.isFinite(e.v)).sort((a, b) => b.v - a.v);
  const invalid = withIdx.filter(e => !Number.isFinite(e.v));
  const ranks = new Map();
  valid.forEach((e) => {
    // min-rank: count how many have a strictly greater value, +1
    const rank = valid.filter(o => o.v > e.v).length + 1;
    ranks.set(e.i, rank);
  });
  invalid.forEach(e => ranks.set(e.i, null));
  return items.map((item, i) => ranks.get(i));
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

// Individual scores worth a second look, per Team x Category. Two
// independent checks, both purely informational:
//   - "trimmed": the exact score(s) excluded by robustScore() when n >= 4
//   - "flagged": any score more than flagGap points from the team's median
//                for that category, regardless of n
function flagOutliers(longRows, flagGap) {
  const groups = groupBy(longRows, r => `${r.Team}\u0001${r.Category}`);
  const out = [];
  for (const rows of groups.values()) {
    const scores = rows.map(r => r.Score);
    const n = scores.length;
    const med = median(scores);
    const minVal = Math.min(...scores);
    const maxVal = Math.max(...scores);
    const minCount = scores.filter(s => s === minVal).length;
    const maxCount = scores.filter(s => s === maxVal).length;
    for (const row of rows) {
      const isMin = n >= 4 && row.Score === minVal && minCount === 1;
      const isMax = n >= 4 && row.Score === maxVal && maxCount === 1;
      const trimmed = isMin || isMax;
      const flagged = Math.abs(row.Score - med) >= flagGap;
      if (!trimmed && !flagged) continue;
      let reason;
      if (trimmed && flagged) reason = "Trimmed from average + far from median";
      else if (trimmed) reason = "Trimmed from average (min/max of the group)";
      else reason = "Far from team median (kept in average)";
      out.push({
        Team: row.Team, Judge: row.Judge, Category: row.Category,
        Score: row.Score, TeamMedian: med, Reason: reason
      });
    }
  }
  out.sort((a, b) => {
    if (a.Team !== b.Team) return a.Team < b.Team ? -1 : 1;
    if (a.Category !== b.Category) return a.Category < b.Category ? -1 : 1;
    return Math.abs(b.Score - b.TeamMedian) - Math.abs(a.Score - a.TeamMedian);
  });
  return out;
}

// Reshape a "wide" Google Form export into the long Judge/Team/Category/Score
// shape the rest of this file works with.
//
// Some Forms ask a judge to score every team in a single submission, which
// produces one row per judge with each team's categories as their own
// columns, e.g. "Team 1 - Taste", "Team 1 - Texture", ..., "Team 2 - Taste".
// Any column whose name ends in " - <Category>" (case-insensitive; the part
// before it, trimmed, is the team name) is picked up automatically -- any
// number of teams, whatever they're named.
//
// Returns null if no columns match that pattern (i.e. this isn't wide-shaped
// data), so the caller can fall back to the plain long-format path.
function reshapeWideForm(rows) {
  const sample = rows[0] || {};
  const colRegex = new RegExp(`^(.*) - (${CATEGORIES.join("|")})$`, "i");
  const teamCols = Object.keys(sample).filter(c => colRegex.test(c));
  if (teamCols.length === 0) return null;

  const longRows = [];
  for (const row of rows) {
    const judge = String(row.Judge || "").trim();
    for (const col of teamCols) {
      const m = col.match(colRegex);
      const team = m[1].trim();
      // normalize the matched category token to its canonical CATEGORIES casing
      const category = CATEGORIES.find(c => c.toLowerCase() === m[2].toLowerCase());
      const raw = row[col];
      const score = raw === "" || raw == null ? NaN : Number(raw);
      if (!Number.isNaN(score)) {
        longRows.push({ Judge: judge, Team: team, Category: category, Score: score });
      }
    }
  }
  return longRows;
}

// Build the leaderboard from raw judge scores.
//
// Accepts either shape:
//   - long: one row per judge per team, columns Judge, Team, Taste, Texture,
//     Presentation, Creativity
//   - wide: one row per judge, columns Judge plus "<Team> - Taste",
//     "<Team> - Texture", etc. repeated per team (what you get when a judge
//     scores every team in a single Form submission)
// Extra columns (Timestamp, Notes, ...) are ignored either way.
//
// Google Form question titles often pick up a trailing colon and/or stray
// whitespace (e.g. "Judge:") -- strip that and canonicalize "Judge"/"Team"
// case so a cosmetic habit in how you title questions doesn't block real
// data. Returns new row objects; doesn't mutate the input.
function normalizeHeaders(rows) {
  if (rows.length === 0) return rows;
  const keyMap = {};
  for (const key of Object.keys(rows[0])) {
    let clean = key.trim().replace(/:\s*$/, "");
    if (clean.toLowerCase() === "judge") clean = "Judge";
    else if (clean.toLowerCase() === "team") clean = "Team";
    keyMap[key] = clean;
  }
  return rows.map(row => {
    const out = {};
    for (const [key, value] of Object.entries(row)) out[keyMap[key]] = value;
    return out;
  });
}

// Returns { leaderboard, flags, longRows }
function buildLeaderboard(rows, weights = CFG.CATEGORY_WEIGHTS, flagGap = CFG.FLAG_GAP) {
  rows = normalizeHeaders(rows);
  const sample = rows[0] || {};
  if (rows.length > 0 && !("Judge" in sample)) {
    throw new Error(
      "Your data is missing required column(s): Judge. " +
      "Expected either: Judge, Team, Taste, Texture, Presentation, Creativity " +
      "or: Judge, <Team> - Taste, <Team> - Texture, <Team> - Presentation, <Team> - Creativity (repeated per team)."
    );
  }

  let longRows;
  if ("Team" in sample) {
    const missing = CATEGORIES.filter(c => !(c in sample));
    if (rows.length > 0 && missing.length > 0) {
      throw new Error(
        `Your data is missing required column(s): ${missing.join(", ")}. ` +
        `Expected columns are: Judge, Team, ${CATEGORIES.join(", ")}.`
      );
    }
    const clean = rows
      .map(r => ({
        Judge: String(r.Judge || "").trim(),
        Team: String(r.Team || "").trim(),
        ...Object.fromEntries(CATEGORIES.map(c => [c, r[c] === "" || r[c] == null ? NaN : Number(r[c])]))
      }))
      .filter(r => r.Team !== "");

    longRows = [];
    for (const r of clean) {
      for (const cat of CATEGORIES) {
        if (!Number.isNaN(r[cat])) {
          longRows.push({ Judge: r.Judge, Team: r.Team, Category: cat, Score: r[cat] });
        }
      }
    }
  } else {
    longRows = reshapeWideForm(rows);
    if (longRows === null) {
      throw new Error(
        "Your data has no 'Team' column, and no columns matching the " +
        "'<Team> - <Category>' pattern (e.g. 'Team 1 - Taste') were found either. " +
        "Expected either: Judge, Team, Taste, Texture, Presentation, Creativity " +
        "or: Judge, <Team> - Taste, <Team> - Texture, <Team> - Presentation, <Team> - Creativity (repeated per team)."
      );
    }
  }

  const flags = flagOutliers(longRows, flagGap);

  // Team x Category -> robust score
  const byTC = groupBy(longRows, r => `${r.Team}\u0001${r.Category}`);
  const robustMap = new Map(); // "Team" -> { Category: score }
  const judgeSets = new Map(); // "Team" -> Set(judge)
  for (const [key, group] of byTC) {
    const [team, category] = key.split("\u0001");
    if (!robustMap.has(team)) robustMap.set(team, { Team: team });
    robustMap.get(team)[category] = robustScore(group.map(r => r.Score));
    if (!judgeSets.has(team)) judgeSets.set(team, new Set());
    group.forEach(r => judgeSets.get(team).add(r.Judge));
  }

  let leaderboard = Array.from(robustMap.values()).map(row => {
    const weightedTotal = CATEGORIES.reduce((sum, cat) => sum + (row[cat] || 0) * weights[cat], 0);
    return {
      ...row,
      WeightedTotal: weightedTotal,
      JudgesScoring: judgeSets.get(row.Team).size
    };
  });

  const ranks = rankDescending(leaderboard, r => r.WeightedTotal);
  leaderboard.forEach((row, i) => { row.Rank = ranks[i]; });
  leaderboard.sort((a, b) => (a.Rank ?? 999) - (b.Rank ?? 999));

  return { leaderboard, flags, longRows };
}

window.Scoring = {
  CATEGORIES, median, mean, robustScore,
  rankDescending, flagOutliers, reshapeWideForm, normalizeHeaders, buildLeaderboard
};
