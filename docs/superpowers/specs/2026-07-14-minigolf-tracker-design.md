# Minigolf Forever — Design

Date: 2026-07-14
Status: Approved by Robbe

## Purpose

A GitHub Pages website for Robbe and Saar to track every minigolf game they ever play: an all-time rivalry scoreboard, per-course game history with per-hole scorecards, a stats page, and an in-page way to add new games.

## Constraints & decisions

- **Hosting:** GitHub Pages, served from the `main` branch root of this (public) repo. Scores are world-readable; accepted.
- **Stack:** Vanilla single-page app — plain HTML/CSS/JS modules, **no build step**, no framework, no dependencies. Hash routing.
- **Data writes:** GitHub Contents API with a fine-grained personal access token (details under Security).
- **Players:** Robbe (green accent) and Saar (purple accent), defined in config — names/colors editable in one place.
- **Scoring:** 1–7 per hole (7 = failed hole max), lowest game total wins, ties possible.
- **Mobile-first:** primary use is on phones at the course.

## Data model

All data in `data/` as JSON, committed to the repo. All statistics are **derived in the browser** from raw per-hole scores — nothing aggregated is ever stored, so nothing can go stale.

### `data/config.json`

```json
{
  "players": [
    { "id": "robbe", "name": "Robbe", "color": "#2f9e6e" },
    { "id": "saar",  "name": "Saar",  "color": "#8b5cf6" }
  ],
  "maxScore": 7
}
```

### `data/courses.json`

Courses are first-class entities (repeat visits are common):

```json
{
  "courses": [
    { "id": "blankenberge", "name": "Minigolf Blankenberge", "location": "Blankenberge", "holes": 18 }
  ]
}
```

### `data/games.json`

Append-only list of every game. `scores` maps player id → array of per-hole scores (index = hole − 1, length = course holes; integers 1..maxScore).

```json
{
  "games": [
    {
      "id": "2026-07-12-blankenberge-1",
      "courseId": "blankenberge",
      "date": "2026-07-12",
      "scores": { "robbe": [2, 1, 3], "saar": [3, 2, 2] },
      "note": "optional free text"
    }
  ]
}
```

Game winner = lower total; equal totals = tie. Game `id` = `date-courseId-N` where N disambiguates same-day games on the same course.

## Pages (hash routes)

Single-page app with a bottom tab bar on mobile, top nav on desktop. Aesthetic: "premium minigolf clubhouse" — deep green felt background, cream scorecard cards, chunky rounded display numerals, golf-ball favicon, crown 👑 icons for leaders/winners.

- **`#/` Home** — two player panels face-to-face; crown on the overall leader (by games won). Giant tally `wins – ties – wins`. Secondary line: total strokes all-time comparison. Recent 3 games with result chips.
- **`#/courses`** — card grid: course name, location, holes, times played, crown for that course's leader by wins.
- **`#/courses/:id`** — all games at that course, newest first, as collapsible scorecards. Header: date, totals, winner crown (handshake for tie). Expanded: classic scorecard table (holes as columns, players as rows); hole-in-ones highlighted gold, 7s red, per-hole winner dotted.
- **`#/stats`** — four sections:
  1. **Highlights:** stat tiles per player — hole-in-one count, 7s count, best game, worst game.
  2. **Head-to-head:** wins/ties tally, current streak, longest streak, biggest victory margin.
  3. **Averages & trends:** average score per hole, average game score, score-over-time line chart (hand-rolled SVG, no chart library).
  4. **Course records:** best round per course per player, course "owner" crowns.
- **`#/new` Add game** — course picker (with inline "+ new course": name, location, holes), date (defaults today), then per-hole entry: tappable 1–7 score buttons per player, live running totals. Save commits via GitHub API and navigates to the course page. Unsaved entry persists in localStorage as a draft (offline-safe).

## Saving games — GitHub API

- Save = `PUT /repos/{owner}/{repo}/contents/data/games.json` (and `courses.json` when a course was added) with the file's current `sha`, base64 content, and a commit message like `Add game: Blankenberge 2026-07-12`.
- **Conflict handling:** on a 409/sha mismatch, re-fetch the file, re-apply the new game, retry once; if it still fails, tell the user to reload.
- After a successful save the app updates its in-memory data immediately (no wait for the Pages redeploy, which takes ~1 minute for other visitors).

## Security (explicit requirement: no leaked secrets)

1. Auth uses a **fine-grained PAT** scoped to this single repo with only *Contents: read & write*. README will contain a step-by-step creation guide.
2. Token is entered once per device on `#/new` and stored in **localStorage only**. It is sent exclusively to `api.github.com` over HTTPS. It never appears in committed files, URLs, page markup, or logs.
3. The repo and published site contain zero secrets. Visitors without a token get a read-only site; the save flow explains it needs a token.
4. "Forget token" button clears localStorage; revoking on GitHub disables it everywhere. Worst-case leak impact: write access to this repo's contents only.
5. The data-write code path serializes only the typed game/course objects — structurally impossible to include the token in a commit.

## Architecture

```
index.html          shell + nav
css/style.css       all styling
js/app.js           bootstrap, hash router
js/data.js          load config/courses/games (fetch), in-memory store
js/github.js        token storage, Contents API read/write, conflict retry
js/stats.js         PURE functions: totals, winners, tallies, streaks, records, averages
js/views/*.js       one render module per page (home, courses, course, stats, new)
data/*.json         config, courses, games
test/stats.test.js  node --test suite for stats.js
```

`js/stats.js` is dependency-free and side-effect-free so it runs under `node --test` without any tooling.

## Error handling

- Data fetch failure → friendly full-page retry message.
- Invalid/expired token → clear message with link to token guide; token kept until user forgets it or replaces it.
- Save conflict → automatic single retry (see above).
- Malformed data file (hand-edited badly) → console detail + banner naming the file.

## Testing & verification

- Unit tests for all stat derivations (`node --test test/`): winners, ties, tallies, streaks, aces/7s counts, course records, averages.
- Manual verification flow: run a local static server, add a game against a test branch/repo, confirm scorecard rendering and stat updates.

## Deployment

- Rename `master` → `main`, push to GitHub, enable Pages (deploy from `main`, root).
- README documents: enabling Pages, creating the fine-grained PAT, entering it on each device.
