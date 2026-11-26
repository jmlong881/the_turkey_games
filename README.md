# The Long Family Turkey Games — Live Leaderboard

A static, free-to-host leaderboard page for the cook-off. Judges keep
scanning the same Google Form you already built; this page reads the Form's
response Sheet and shows a live, ranked leaderboard — same rubric, same
weights, and the same outlier-trimming protection as the Excel kit and the R
dashboard, ported line-for-line into JavaScript.

Turkey only this year — one dish, one rubric, no separate courses.

## How the pieces fit together

```
Judges scan QR #1 --> Google Form --> Google Sheet (responses)
                                            |
                                   "Publish to web" as CSV
                                            |
                      GitHub Pages site (this repo) fetches that CSV,
                      recomputes the leaderboard, and displays it
                                            |
                      Everyone scans QR #2 to watch results live
```

Two separate links, on purpose (you said that was fine): one QR for judges
to *score*, a second QR for everyone to *watch*.

## Files

- `index.html` — the page shell: theme, layout, tabs.
- `config.js` — the only file you should need to edit. Your Google Sheet CSV
  link, refresh interval, and the rubric weights all live here.
- `scoring.js` — the scoring/outlier logic, a direct port of `scoring_logic.R`.
  Cross-checked against the R output — see `test_scoring.node.js`.
- `app.js` — reads the CSV, calls into `scoring.js`, and paints the DOM.
- `sample_scores.csv` — demo data (same dataset used to test the Excel kit
  and R dashboard), shown automatically whenever `config.js` has no
  `CSV_URL` set yet, so the page is never blank.
- `test_scoring.node.js` — a Node script that re-runs the same demo dataset
  through this JS logic and checks it against the already-verified R
  numbers. Run with `node test_scoring.node.js`.

## Setup, step by step

### 1. Publish your Google Sheet as CSV

In the Google Sheet your Form writes responses to:
**File → Share → Publish to web** → choose the responses tab → format
**CSV** → **Publish**. Copy the link it gives you (it's read-only — nobody
can edit your data from it, same as a normal share link).

The site accepts two Sheet shapes — use whichever matches how your Form is
built:

**One Form submission per judge per team** (judges submit once per team) —
columns, in any order: `Judge`, `Team`, `Taste`, `Texture`, `Presentation`,
`Creativity`.

**One Form submission per judge, scoring every team at once** — a `Judge`
column, plus four category columns *per team*, named `<Team Name> - Taste`,
`<Team Name> - Texture`, `<Team Name> - Presentation`, `<Team Name> -
Creativity` (e.g. `Team 1 - Taste`, `Team 2 - Taste`, ...). Name your Form
questions exactly that way (team name, then " - ", then the category) and
the site will pick out however many teams you've got automatically.

Either way: name the judge's-name question **`Judge`** (not "Name" or
anything else — though a trailing colon like "Judge:" or different
capitalization like "judge" is fine, no need to fix it in the Form), and a
`Timestamp` or `Notes` column is fine — extra columns are just ignored.

### 2. Paste the link into `config.js`

Open `config.js` and set:

```js
CSV_URL: "https://docs.google.com/spreadsheets/d/e/.../pub?output=csv",
```

Leave it as `""` to keep showing the bundled demo data instead (useful
while you're still testing).

### 3. Create the GitHub repo and push

```bash
cd long-family-turkey-games
git init
git add .
git commit -m "Turkey Games live leaderboard"
git branch -M main
git remote add origin https://github.com/<you>/long-family-turkey-games.git
git push -u origin main
```

(Create the empty repo on github.com first, or use `gh repo create` if you
have the GitHub CLI set up.)

### 4. Turn on GitHub Pages

In the repo on github.com: **Settings → Pages** → Source: **Deploy from a
branch** → Branch: **main**, folder **/ (root)** → **Save**. GitHub gives
you a URL like:

```
https://<you>.github.io/long-family-turkey-games/
```

That's your second QR code — generate one the same way we did for the
Form link earlier (just don't point it at this repo's GitHub *edit* page,
same gotcha as before — this is a public viewer URL, so that one's fine
as-is).

### 5. Test it

Open the Pages URL. If `CSV_URL` is empty you'll see the demo data with a
banner saying so; once you paste a real link in `config.js` and push again,
it'll say "Live data" and start polling your Sheet every
`REFRESH_SECONDS` (20s by default).

## Updating it later

Any edit to `config.js` (new CSV link, different refresh interval, a wider
`FLAG_GAP`) needs a `git add`, `commit`, and `push` to take effect — GitHub
Pages redeploys automatically within a minute or two of a push.
