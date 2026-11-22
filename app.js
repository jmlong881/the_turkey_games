// ---------------------------------------------------------------------------
// app.js -- data loading, rendering, and tab wiring for the Turkey Games
// leaderboard page. All the scoring math lives in scoring.js; this file is
// purely about getting data in and painting the DOM.
// ---------------------------------------------------------------------------

const APPCFG = window.COOKOFF_CONFIG;
const { CATEGORIES: CATS, buildLeaderboard: scoreAll } = window.Scoring;

const TEAM_PALETTE = ["#C9A227", "#8A1F1F", "#5D7A9E", "#7A9E5D", "#9E5D7A", "#5D9E8F", "#9E8F5D", "#7A5D9E"];

function teamColor(team, allTeams) {
  const idx = allTeams.indexOf(team);
  return TEAM_PALETTE[idx % TEAM_PALETTE.length];
}

function fmt(n, digits = 2) {
  return Number.isFinite(n) ? n.toFixed(digits) : "–";
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

async function loadRows() {
  const useDemo = !APPCFG.CSV_URL;
  const url = useDemo ? APPCFG.DEMO_CSV_PATH : APPCFG.CSV_URL;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const text = await res.text();
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (parsed.errors && parsed.errors.length) {
    console.warn("CSV parse warnings:", parsed.errors);
  }
  return { rows: parsed.data, useDemo, url };
}

// ---------------------------------------------------------------------------
// Tiny inline SVG radar chart
// ---------------------------------------------------------------------------

function radarSVG(teams, getValue, size = 280, maxValue = 10) {
  const cx = size / 2, cy = size / 2, r = size / 2 - 42;
  const n = CATS.length;
  const angle = i => (Math.PI * 2 * i) / n - Math.PI / 2;
  const point = (i, value) => {
    const radius = (Math.max(0, Math.min(value, maxValue)) / maxValue) * r;
    return [cx + radius * Math.cos(angle(i)), cy + radius * Math.sin(angle(i))];
  };

  let svg = `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">`;

  // grid rings
  for (const frac of [0.25, 0.5, 0.75, 1]) {
    const pts = CATS.map((_, i) => point(i, maxValue * frac).join(",")).join(" ");
    svg += `<polygon points="${pts}" fill="none" stroke="#6b4a1e" stroke-width="1" opacity="0.5"/>`;
  }
  // spokes + labels
  CATS.forEach((cat, i) => {
    const [x, y] = point(i, maxValue);
    svg += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#6b4a1e" stroke-width="1" opacity="0.5"/>`;
    const lx = cx + (r + 26) * Math.cos(angle(i));
    const ly = cy + (r + 26) * Math.sin(angle(i));
    svg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" class="radar-label">${cat}</text>`;
  });
  // one polygon per team
  teams.forEach(team => {
    const pts = CATS.map((cat, i) => point(i, getValue(team, cat)).join(",")).join(" ");
    const color = teamColor(team, teams);
    svg += `<polygon points="${pts}" fill="${color}" fill-opacity="0.12" stroke="${color}" stroke-width="2"/>`;
    CATS.forEach((cat, i) => {
      const [x, y] = point(i, getValue(team, cat));
      svg += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>`;
    });
  });
  svg += `</svg>`;
  return svg;
}

// ---------------------------------------------------------------------------
// Renderers
// ---------------------------------------------------------------------------

function renderStatus(root, { useDemo, url, error, fetchedAt }) {
  const banner = root.querySelector("#status-banner");
  banner.classList.toggle("status-demo", !!useDemo && !error);
  banner.classList.toggle("status-error", !!error);
  if (error) {
    banner.innerHTML = `<strong>Couldn't load live data</strong> — ${error.message}. Showing the last successful load, if any.`;
  } else if (useDemo) {
    banner.innerHTML = `<strong>Demo data</strong> — no CSV_URL configured in config.js yet, showing <code>${APPCFG.DEMO_CSV_PATH}</code>. Last loaded ${fetchedAt.toLocaleTimeString()}.`;
  } else {
    banner.innerHTML = `<strong>Live data</strong> from your Google Sheet. Last loaded ${fetchedAt.toLocaleTimeString()} — refreshing every ${APPCFG.REFRESH_SECONDS}s.`;
  }
}

function valueBox(value, caption, accent) {
  return el("div", { class: "vbox", style: `border-color:${accent}` }, [
    el("div", { class: "vbox-value", style: `color:${accent}` }, String(value)),
    el("div", { class: "vbox-caption" }, caption)
  ]);
}

function renderLeaderboardTab(root, res) {
  const panel = root.querySelector("#panel-leaderboard");
  panel.innerHTML = "";

  const lb = res.leaderboard;
  const winner = lb.find(r => r.Rank === 1);
  const nTeams = lb.length;
  const nJudges = new Set(res.longRows.map(r => r.Judge)).size;
  const nFlags = res.flags.length;

  const row1 = el("div", { class: "vbox-row" }, [
    valueBox(winner ? winner.Team : "TBD", `Winner${winner ? ` — ${fmt(winner.WeightedTotal)} / 10` : ""}`, "#C9A227"),
    valueBox(nTeams, "Teams Competing", "#7A2E2E"),
    valueBox(nJudges, "Judges Scoring", "#595959"),
    valueBox(nFlags, "Scores Trimmed / Flagged", nFlags > 0 ? "#C0392B" : "#2E7D32"),
  ]);

  const maxScore = Math.max(10, ...lb.map(r => r.WeightedTotal || 0));
  const bars = el("div", { class: "card" }, [
    el("h3", {}, "Ranked Results"),
    el("div", { class: "barlist" }, lb.map(r => el("div", { class: "barrow" }, [
      el("div", { class: "barrow-label" }, r.Team),
      el("div", { class: "barrow-track" }, [
        el("div", {
          class: "barrow-fill",
          style: `width:${(100 * (r.WeightedTotal || 0)) / maxScore}%; background:${r.Rank === 1 ? "linear-gradient(90deg,#8a1f1f,#c8952f)" : "#5a3d1c"}`
        })
      ]),
      el("div", { class: "barrow-value" }, fmt(r.WeightedTotal))
    ])))
  ]);

  const table = el("div", { class: "card" }, [
    el("h3", {}, "Full Leaderboard"),
    buildTable(
      ["Rank", "Team", "Judges Scoring", ...CATS, "Weighted Total"],
      lb.map(r => [r.Rank ?? "–", r.Team, r.JudgesScoring, ...CATS.map(c => fmt(r[c])), fmt(r.WeightedTotal)]),
      row => row[0] === 1
    )
  ]);

  panel.append(row1, bars, table);
}

function renderCategoryTab(root, res) {
  const panel = root.querySelector("#panel-category");
  panel.innerHTML = "";
  const lb = res.leaderboard;
  const teams = lb.map(r => r.Team);

  const getValue = (team, cat) => {
    const row = lb.find(r => r.Team === team);
    return row ? row[cat] : 0;
  };

  const radarCard = el("div", { class: "card radar-card" }, [
    el("h3", {}, "How Each Team Scored, by Category"),
    el("div", { class: "radar-svg", html: radarSVG(teams, getValue) }),
    el("div", { class: "radar-legend" }, teams.map(t => el("span", { class: "legend-chip" }, [
      el("span", { class: "legend-swatch", style: `background:${teamColor(t, teams)}` }), t
    ])))
  ]);

  const tableCard = el("div", { class: "card" }, [
    el("h3", {}, "Category Averages (outlier-adjusted)"),
    buildTable(
      ["Team", ...CATS],
      lb.map(r => [r.Team, ...CATS.map(c => fmt(r[c]))]),
      () => false
    )
  ]);

  panel.append(el("div", { class: "radar-grid" }, [radarCard]), tableCard);
}

function renderCalibrationTab(root, res) {
  const panel = root.querySelector("#panel-calibration");
  panel.innerHTML = "";

  const note = el("div", { class: "card note-card" }, [
    el("strong", {}, "Outlier protection, explained: "),
    `Any score ≥ ${APPCFG.FLAG_GAP} points from a team's median gets flagged here, and with 4+ judges the single highest and lowest score per category are automatically excluded from that team's average — same principle as diving/gymnastics judging.`
  ]);

  let tableCard;
  if (res.flags.length === 0) {
    tableCard = el("div", { class: "card" }, [
      el("h3", {}, "Flagged / Trimmed Scores"),
      el("p", {}, "No outlier scores this round — nice and consistent judging.")
    ]);
  } else {
    const reasonClass = r => r.Reason.startsWith("Trimmed from average +") ? "reason-both"
      : r.Reason.startsWith("Trimmed") ? "reason-trimmed" : "reason-flagged";
    tableCard = el("div", { class: "card" }, [
      el("h3", {}, "Flagged / Trimmed Scores"),
      buildTable(
        ["Team", "Judge", "Category", "Score", "Team Median", "Reason"],
        res.flags.map(f => [f.Team, f.Judge, f.Category, f.Score, fmt(f.TeamMedian, 1), f.Reason]),
        () => false,
        res.flags.map(reasonClass)
      )
    ]);
  }
  panel.append(note, tableCard);
}

function renderDataSourceTab(root, res, meta) {
  const panel = root.querySelector("#panel-data");
  panel.innerHTML = "";
  const note = el("div", { class: "card note-card" }, [
    meta.useDemo
      ? `Showing demo data from ${APPCFG.DEMO_CSV_PATH} — set CSV_URL in config.js to go live.`
      : `Loaded from ${meta.url}.`
  ]);
  const byRow = new Map();
  for (const r of res.longRows) {
    const key = `${r.Judge}\u0001${r.Team}`;
    if (!byRow.has(key)) byRow.set(key, { Judge: r.Judge, Team: r.Team });
    byRow.get(key)[r.Category] = r.Score;
  }
  const table = el("div", { class: "card" }, [
    el("h3", {}, "Raw Loaded Rows"),
    buildTable(
      ["Judge", "Team", ...CATS],
      Array.from(byRow.values()).map(r => [r.Judge, r.Team, ...CATS.map(c => r[c] ?? "")]),
      () => false
    )
  ]);
  panel.append(note, table);
}

function buildTable(headers, rows, highlightRow, rowClasses) {
  const thead = el("thead", {}, el("tr", {}, headers.map(h => el("th", {}, h))));
  const tbody = el("tbody", {}, rows.map((row, i) => el("tr", {
    class: [highlightRow && highlightRow(row) ? "row-highlight" : "", rowClasses ? rowClasses[i] : ""].join(" ").trim()
  }, row.map(cell => el("td", {}, String(cell))))));
  const table = el("table", { class: "data-table" }, [thead, tbody]);
  return el("div", { class: "table-scroll" }, table);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let refreshTimer = null;

async function refresh(root) {
  try {
    const { rows, useDemo, url } = await loadRows();
    const res = scoreAll(rows);
    renderStatus(root, { useDemo, url, fetchedAt: new Date() });
    renderLeaderboardTab(root, res);
    renderCategoryTab(root, res);
    renderCalibrationTab(root, res);
    renderDataSourceTab(root, res, { useDemo, url });
  } catch (err) {
    console.error(err);
    renderStatus(root, { error: err, fetchedAt: new Date() });
  }
}

function wireTabs(root) {
  root.querySelectorAll(".tab-button").forEach(btn => {
    btn.addEventListener("click", () => {
      root.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
      root.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      root.querySelector(`#panel-${btn.dataset.tab}`).classList.add("active");
    });
  });
}

function init() {
  const root = document;
  wireTabs(root);
  root.querySelector("#refresh-now").addEventListener("click", () => refresh(root));
  refresh(root);
  refreshTimer = setInterval(() => refresh(root), APPCFG.REFRESH_SECONDS * 1000);
}

document.addEventListener("DOMContentLoaded", init);
