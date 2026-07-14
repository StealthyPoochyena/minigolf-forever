# Minigolf Forever Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A GitHub Pages site where Robbe and Saar track every minigolf game: rivalry homescreen, per-course game history with per-hole scorecards, stats page, and an in-page add-game form that commits to the repo via the GitHub API.

**Architecture:** Vanilla single-page app with hash routing, no build step. JSON data files in `data/` are the source of truth; all statistics are derived in the browser by pure functions in `js/stats.js`. Views are pure functions returning HTML strings (testable under `node --test`); `js/github.js` writes data back via the GitHub Contents API using a fine-grained PAT stored in localStorage only.

**Tech Stack:** HTML/CSS/ES-modules JavaScript. Node 20+ for `node --test` unit tests only (no runtime dependency). Google Fonts (Fredoka). GitHub Pages + GitHub Contents API.

**Spec:** `docs/superpowers/specs/2026-07-14-minigolf-tracker-design.md`

## Global Constraints

- **No build step, no npm dependencies.** The site runs by serving the repo root as static files.
- **No secrets in the repo, ever.** The GitHub token lives only in browser localStorage (key `minigolf.token`) and is sent only to `https://api.github.com`. No code path may serialize it into committed data.
- **Scoring:** per-hole scores are integers 1..7 (`config.maxScore` = 7); lowest game total wins; equal totals = tie.
- **Players:** exactly two, from `data/config.json`: Robbe `#2f9e6e`, Saar `#8b5cf6`. Never hardcode names/colors in views — always read from config.
- **All stats derived, never stored.** `data/games.json` holds only raw per-hole scores.
- **Escape all user-entered strings** (course names, locations, notes) with the `esc()` helper before inserting into HTML strings; tooltip DOM uses `textContent`.
- **Mobile-first CSS**; bottom tab bar below 720px, top nav above.
- Tests run with `npm test` = `node --test test/`. All test files live in `test/`.

### File structure (final)

```
index.html            app shell, nav, script tag
css/style.css         all styling
js/app.js             bootstrap + hash router (only file that touches document at top level)
js/data.js            load the three JSON files
js/github.js          token storage + Contents API read/write with conflict retry
js/stats.js           pure stat derivations (no imports, no side effects)
js/views/helpers.js   esc, CROWN, fmtDate, fmt1, courseName
js/views/home.js      renderHome(state) -> html string
js/views/courses.js   renderCourses(state) -> html string
js/views/course.js    renderCourse(state, courseId) -> html string
js/views/stats.js     renderStats(state) -> html string
js/views/chart.js     renderChart(points, players) -> html string; wireChart(root, points, players)
js/views/new.js       mountNew(container, state, {onSaved}) + pure form helpers
data/config.json      players, maxScore, repo
data/courses.json     { "courses": [] }
data/games.json       { "games": [] }
test/fixtures.js      shared fixture data
test/*.test.js        unit tests
README.md             setup, token guide, deployment
```

`state` everywhere means `{ config, courses, games }` where `courses` and `games` are the **arrays** (unwrapped from their JSON envelopes by `data.js`).

---

### Task 1: Scaffold & data files

**Files:**
- Delete: `index.js`
- Modify: `package.json`
- Create: `.gitignore`, `data/config.json`, `data/courses.json`, `data/games.json`

**Interfaces:**
- Produces: the three data files exactly as specified below; every later task reads them.

- [ ] **Step 1: Remove scaffold junk and untrack `.idea/`**

```bash
git rm index.js
git rm -r --cached .idea
```

- [ ] **Step 2: Write `.gitignore`**

```gitignore
.idea/
node_modules/
```

- [ ] **Step 3: Replace `package.json`**

```json
{
  "name": "minigolf-forever",
  "version": "1.0.0",
  "description": "Robbe & Saar's eternal minigolf rivalry tracker",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 4: Write `data/config.json`**

The `repo` value is corrected to the real `owner/name` in Task 11 before deployment.

```json
{
  "repo": "OWNER/Minigolf-forever",
  "maxScore": 7,
  "players": [
    { "id": "robbe", "name": "Robbe", "color": "#2f9e6e" },
    { "id": "saar", "name": "Saar", "color": "#8b5cf6" }
  ]
}
```

- [ ] **Step 5: Write `data/courses.json` and `data/games.json`**

`data/courses.json`:

```json
{
  "courses": []
}
```

`data/games.json`:

```json
{
  "games": []
}
```

- [ ] **Step 6: Verify and commit**

Run: `node -e "['data/config.json','data/courses.json','data/games.json'].forEach(f => JSON.parse(require('fs').readFileSync(f)))"`
Expected: no output, exit 0.

```bash
git add -A
git commit -m "chore: scaffold data files and package.json"
```

---

### Task 2: stats.js core — totals, winners, tally, strokes, sorting

**Files:**
- Create: `js/stats.js`, `test/fixtures.js`, `test/stats-core.test.js`

**Interfaces:**
- Produces (all pure, exported from `js/stats.js`):
  - `gameTotals(game) -> { [playerId]: number }`
  - `gameWinner(game) -> playerId | 'tie'`
  - `overallTally(games, playerIds) -> { wins: { [playerId]: number }, ties: number }`
  - `totalStrokes(games, playerIds) -> { [playerId]: number }`
  - `sortByDateDesc(games) -> new array` (date desc, then id desc; input not mutated)
- `test/fixtures.js` produces `config`, `courses`, `games`, `game()` used by every later test file.

- [ ] **Step 1: Write `test/fixtures.js`**

```js
export const config = {
  repo: 'OWNER/Minigolf-forever',
  maxScore: 7,
  players: [
    { id: 'robbe', name: 'Robbe', color: '#2f9e6e' },
    { id: 'saar', name: 'Saar', color: '#8b5cf6' },
  ],
};

export const courses = [
  { id: 'boom', name: 'Golf Boom', location: 'Boom', holes: 3 },
  { id: 'gent', name: 'Putt Gent', location: 'Gent', holes: 2 },
];

export function game(id, courseId, date, robbe, saar) {
  return { id, courseId, date, scores: { robbe, saar } };
}

// totals: g1 robbe 9 / saar 7 (saar wins) · g2 robbe 5 / saar 11 (robbe wins)
// g3 7-7 (tie) · g4 robbe 4 / saar 3 (saar wins)
export const games = [
  game('2026-01-10-boom-1', 'boom', '2026-01-10', [2, 3, 4], [1, 3, 3]),
  game('2026-02-01-boom-1', 'boom', '2026-02-01', [1, 2, 2], [2, 2, 7]),
  game('2026-03-05-gent-1', 'gent', '2026-03-05', [3, 4], [3, 4]),
  game('2026-04-09-gent-1', 'gent', '2026-04-09', [2, 2], [1, 2]),
];
```

- [ ] **Step 2: Write the failing tests `test/stats-core.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameTotals, gameWinner, overallTally, totalStrokes, sortByDateDesc } from '../js/stats.js';
import { games } from './fixtures.js';

const ids = ['robbe', 'saar'];

test('gameTotals sums per-hole scores per player', () => {
  assert.deepEqual(gameTotals(games[0]), { robbe: 9, saar: 7 });
});

test('gameWinner returns lower total, or tie', () => {
  assert.equal(gameWinner(games[0]), 'saar');
  assert.equal(gameWinner(games[1]), 'robbe');
  assert.equal(gameWinner(games[2]), 'tie');
});

test('overallTally counts wins and ties', () => {
  assert.deepEqual(overallTally(games, ids), { wins: { robbe: 1, saar: 2 }, ties: 1 });
});

test('overallTally of no games is all zeroes', () => {
  assert.deepEqual(overallTally([], ids), { wins: { robbe: 0, saar: 0 }, ties: 0 });
});

test('totalStrokes sums across all games', () => {
  assert.deepEqual(totalStrokes(games, ids), { robbe: 25, saar: 28 });
});

test('sortByDateDesc sorts newest first without mutating input', () => {
  const input = [...games];
  const sorted = sortByDateDesc(input);
  assert.equal(sorted[0].id, '2026-04-09-gent-1');
  assert.equal(sorted[3].id, '2026-01-10-boom-1');
  assert.deepEqual(input, games);
});

test('sortByDateDesc breaks same-date ties by id desc', () => {
  const a = { id: '2026-05-01-x-1', date: '2026-05-01', courseId: 'x', scores: {} };
  const b = { id: '2026-05-01-x-2', date: '2026-05-01', courseId: 'x', scores: {} };
  assert.equal(sortByDateDesc([a, b])[0].id, '2026-05-01-x-2');
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module ... js/stats.js`.

- [ ] **Step 4: Write `js/stats.js` (core section)**

```js
// Pure stat derivations. No imports, no side effects, no DOM.

export function gameTotals(game) {
  const totals = {};
  for (const [playerId, scores] of Object.entries(game.scores)) {
    totals[playerId] = scores.reduce((a, b) => a + b, 0);
  }
  return totals;
}

export function gameWinner(game) {
  const totals = gameTotals(game);
  const [a, b] = Object.keys(totals);
  if (totals[a] === totals[b]) return 'tie';
  return totals[a] < totals[b] ? a : b;
}

export function overallTally(games, playerIds) {
  const wins = Object.fromEntries(playerIds.map((p) => [p, 0]));
  let ties = 0;
  for (const game of games) {
    const w = gameWinner(game);
    if (w === 'tie') ties++;
    else wins[w]++;
  }
  return { wins, ties };
}

export function totalStrokes(games, playerIds) {
  const totals = Object.fromEntries(playerIds.map((p) => [p, 0]));
  for (const game of games) {
    const t = gameTotals(game);
    for (const p of playerIds) totals[p] += t[p] ?? 0;
  }
  return totals;
}

export function sortByDateDesc(games) {
  return [...games].sort(
    (x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id),
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 7 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add js/stats.js test/fixtures.js test/stats-core.test.js
git commit -m "feat: core game stats (totals, winner, tally, strokes, sorting)"
```

---

### Task 3: stats.js highlights & streaks

**Files:**
- Modify: `js/stats.js` (append)
- Create: `test/stats-highlights.test.js`

**Interfaces:**
- Consumes: `gameWinner`, `sortByDateDesc` from Task 2.
- Produces (exported from `js/stats.js`):
  - `countScore(games, playerId, score) -> number` (aces = score 1, sevens = score 7)
  - `bestGame(games, playerId) -> { game, total } | null` (lowest total)
  - `worstGame(games, playerId) -> { game, total } | null` (highest total)
  - `currentStreak(games, playerId) -> number` (consecutive wins from most recent backwards; a tie breaks it)
  - `longestStreak(games, playerId) -> number`
  - `biggestMargin(games) -> { game, winnerId, margin } | null`

- [ ] **Step 1: Write the failing tests `test/stats-highlights.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countScore, bestGame, worstGame, currentStreak, longestStreak, biggestMargin } from '../js/stats.js';
import { games, game } from './fixtures.js';

test('countScore counts holes with an exact score', () => {
  assert.equal(countScore(games, 'robbe', 1), 1);
  assert.equal(countScore(games, 'saar', 1), 2);
  assert.equal(countScore(games, 'robbe', 7), 0);
  assert.equal(countScore(games, 'saar', 7), 1);
});

test('bestGame and worstGame find lowest and highest totals', () => {
  assert.equal(bestGame(games, 'robbe').total, 4);
  assert.equal(bestGame(games, 'robbe').game.id, '2026-04-09-gent-1');
  assert.equal(worstGame(games, 'robbe').total, 9);
  assert.equal(bestGame([], 'robbe'), null);
});

// winners in date order: saar, saar, robbe, saar, saar, saar
const streakGames = [
  game('s1', 'boom', '2026-05-01', [2], [1]),
  game('s2', 'boom', '2026-05-02', [2], [1]),
  game('s3', 'boom', '2026-05-03', [1], [2]),
  game('s4', 'boom', '2026-05-04', [2], [1]),
  game('s5', 'boom', '2026-05-05', [2], [1]),
  game('s6', 'boom', '2026-05-06', [2], [1]),
];

test('currentStreak counts wins from the most recent game backwards', () => {
  assert.equal(currentStreak(streakGames, 'saar'), 3);
  assert.equal(currentStreak(streakGames, 'robbe'), 0);
});

test('a tie breaks the current streak', () => {
  const withTie = [...streakGames, game('s7', 'boom', '2026-05-07', [1], [1])];
  assert.equal(currentStreak(withTie, 'saar'), 0);
});

test('longestStreak finds the longest run of wins', () => {
  assert.equal(longestStreak(streakGames, 'saar'), 3);
  assert.equal(longestStreak(streakGames, 'robbe'), 1);
});

test('biggestMargin finds the largest victory', () => {
  const m = biggestMargin(games);
  assert.equal(m.winnerId, 'robbe');
  assert.equal(m.margin, 6);
  assert.equal(m.game.id, '2026-02-01-boom-1');
  assert.equal(biggestMargin([]), null);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `countScore` etc. not exported.

- [ ] **Step 3: Append to `js/stats.js`**

```js
export function countScore(games, playerId, score) {
  let n = 0;
  for (const game of games) {
    for (const s of game.scores[playerId] ?? []) if (s === score) n++;
  }
  return n;
}

function extremeGame(games, playerId, isBetter) {
  let best = null;
  for (const game of games) {
    const scores = game.scores[playerId];
    if (!scores) continue;
    const total = scores.reduce((a, b) => a + b, 0);
    if (!best || isBetter(total, best.total)) best = { game, total };
  }
  return best;
}

export function bestGame(games, playerId) {
  return extremeGame(games, playerId, (a, b) => a < b);
}

export function worstGame(games, playerId) {
  return extremeGame(games, playerId, (a, b) => a > b);
}

export function currentStreak(games, playerId) {
  let n = 0;
  for (const game of sortByDateDesc(games)) {
    if (gameWinner(game) !== playerId) break;
    n++;
  }
  return n;
}

export function longestStreak(games, playerId) {
  let best = 0;
  let run = 0;
  for (const game of sortByDateDesc(games).reverse()) {
    run = gameWinner(game) === playerId ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function biggestMargin(games) {
  let best = null;
  for (const game of games) {
    const winnerId = gameWinner(game);
    if (winnerId === 'tie') continue;
    const values = Object.values(gameTotals(game));
    const margin = Math.max(...values) - Math.min(...values);
    if (!best || margin > best.margin) best = { game, winnerId, margin };
  }
  return best;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 13 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/stats.js test/stats-highlights.test.js
git commit -m "feat: highlight stats (aces, sevens, best/worst, streaks, margin)"
```

---

### Task 4: stats.js averages, timeline & course stats

**Files:**
- Modify: `js/stats.js` (append)
- Create: `test/stats-courses.test.js`

**Interfaces:**
- Consumes: `overallTally`, `sortByDateDesc`, `bestGame` from earlier tasks.
- Produces (exported from `js/stats.js`):
  - `averagePerHole(games, playerId) -> number | null` (total strokes / total holes)
  - `averagePerGame(games, playerId) -> number | null` (mean of game totals)
  - `timeline(games, playerIds) -> [{ id, date, avgPerHole: { [playerId]: number } }]` sorted date **ascending**
  - `timesPlayed(games, courseId) -> number`
  - `courseTally(games, courseId, playerIds) -> same shape as overallTally`
  - `courseLeader(games, courseId, playerIds) -> playerId | 'tie'` (most wins at that course)
  - `courseBest(games, courseId, playerId) -> { game, total } | null`
  - `holeWinner(game, holeIndex) -> playerId | 'tie'`

- [ ] **Step 1: Write the failing tests `test/stats-courses.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averagePerHole, averagePerGame, timeline, timesPlayed, courseTally, courseLeader, courseBest, holeWinner } from '../js/stats.js';
import { games } from './fixtures.js';

const ids = ['robbe', 'saar'];

test('averagePerHole divides strokes by holes played', () => {
  assert.equal(averagePerHole(games, 'robbe'), 2.5); // 25 strokes / 10 holes
  assert.equal(averagePerHole(games, 'saar'), 2.8);
  assert.equal(averagePerHole([], 'robbe'), null);
});

test('averagePerGame averages game totals', () => {
  assert.equal(averagePerGame(games, 'robbe'), 6.25); // (9+5+7+4)/4
  assert.equal(averagePerGame([], 'robbe'), null);
});

test('timeline is ascending with per-game average per hole', () => {
  const t = timeline(games, ids);
  assert.equal(t.length, 4);
  assert.equal(t[0].id, '2026-01-10-boom-1');
  assert.equal(t[0].avgPerHole.robbe, 3); // 9 / 3 holes
  assert.equal(t[3].avgPerHole.saar, 1.5); // 3 / 2 holes
});

test('timesPlayed counts games on a course', () => {
  assert.equal(timesPlayed(games, 'boom'), 2);
  assert.equal(timesPlayed(games, 'nowhere'), 0);
});

test('courseTally and courseLeader work per course', () => {
  assert.deepEqual(courseTally(games, 'boom', ids), { wins: { robbe: 1, saar: 1 }, ties: 0 });
  assert.equal(courseLeader(games, 'boom', ids), 'tie');
  assert.equal(courseLeader(games, 'gent', ids), 'saar');
});

test('courseBest finds the best round on a course', () => {
  assert.equal(courseBest(games, 'boom', 'robbe').total, 5);
  assert.equal(courseBest(games, 'nowhere', 'robbe'), null);
});

test('holeWinner compares a single hole', () => {
  assert.equal(holeWinner(games[0], 0), 'saar'); // 2 vs 1
  assert.equal(holeWinner(games[0], 1), 'tie'); // 3 vs 3
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `averagePerHole` etc. not exported.

- [ ] **Step 3: Append to `js/stats.js`**

```js
export function averagePerHole(games, playerId) {
  let strokes = 0;
  let holes = 0;
  for (const game of games) {
    const scores = game.scores[playerId];
    if (!scores) continue;
    strokes += scores.reduce((a, b) => a + b, 0);
    holes += scores.length;
  }
  return holes === 0 ? null : strokes / holes;
}

export function averagePerGame(games, playerId) {
  const totals = games
    .filter((g) => g.scores[playerId])
    .map((g) => g.scores[playerId].reduce((a, b) => a + b, 0));
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

export function timeline(games, playerIds) {
  return sortByDateDesc(games)
    .reverse()
    .map((game) => {
      const avgPerHole = {};
      for (const p of playerIds) {
        const scores = game.scores[p];
        avgPerHole[p] = scores
          ? scores.reduce((a, b) => a + b, 0) / scores.length
          : null;
      }
      return { id: game.id, date: game.date, avgPerHole };
    });
}

export function timesPlayed(games, courseId) {
  return games.filter((g) => g.courseId === courseId).length;
}

export function courseTally(games, courseId, playerIds) {
  return overallTally(games.filter((g) => g.courseId === courseId), playerIds);
}

export function courseLeader(games, courseId, playerIds) {
  const { wins } = courseTally(games, courseId, playerIds);
  const [a, b] = playerIds;
  if (wins[a] === wins[b]) return 'tie';
  return wins[a] > wins[b] ? a : b;
}

export function courseBest(games, courseId, playerId) {
  return bestGame(games.filter((g) => g.courseId === courseId), playerId);
}

export function holeWinner(game, holeIndex) {
  const [[aId, aScores], [bId, bScores]] = Object.entries(game.scores);
  if (aScores[holeIndex] === bScores[holeIndex]) return 'tie';
  return aScores[holeIndex] < bScores[holeIndex] ? aId : bId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 20 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/stats.js test/stats-courses.test.js
git commit -m "feat: averages, timeline and per-course stats"
```

---

### Task 5: data loader & GitHub API client

**Files:**
- Create: `js/data.js`, `js/github.js`, `test/data.test.js`, `test/github.test.js`

**Interfaces:**
- Produces from `js/data.js`:
  - `loadAll(fetchImpl = fetch) -> Promise<{ config, courses, games }>` — courses/games unwrapped to arrays; throws `Error('Failed to load <path>: <status>')` on any non-OK response.
- Produces from `js/github.js`:
  - `getToken(storage = globalThis.localStorage) -> string | null`
  - `setToken(token, storage?)` / `clearToken(storage?)`
  - `saveGame({ repo, token, game, newCourse = null, fetchImpl = fetch }) -> Promise<{ games, courses }>` — `games` is the updated games **array**; `courses` is the updated courses array when `newCourse` was given, else `null`. Retries once on commit conflict (HTTP 409), then throws `Error('Save conflict: someone else just saved. Reload and try again.')`.

- [ ] **Step 1: Write the failing tests `test/data.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from '../js/data.js';
import { config, courses, games } from './fixtures.js';

const files = {
  'data/config.json': config,
  'data/courses.json': { courses },
  'data/games.json': { games },
};

function fakeFetch(url) {
  const path = url.split('?')[0];
  const body = files[path];
  return Promise.resolve({
    ok: body !== undefined,
    status: body === undefined ? 404 : 200,
    json: () => Promise.resolve(body),
  });
}

test('loadAll fetches and unwraps the three data files', async () => {
  const state = await loadAll(fakeFetch);
  assert.deepEqual(state.config, config);
  assert.deepEqual(state.courses, courses);
  assert.deepEqual(state.games, games);
});

test('loadAll throws on a failed fetch', async () => {
  const failing = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  await assert.rejects(loadAll(failing), /Failed to load data\/config\.json: 500/);
});
```

- [ ] **Step 2: Write the failing tests `test/github.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getToken, setToken, clearToken, saveGame } from '../js/github.js';
import { game } from './fixtures.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('token round-trips through storage and is trimmed', () => {
  const s = fakeStorage();
  assert.equal(getToken(s), null);
  setToken('  github_pat_abc  ', s);
  assert.equal(getToken(s), 'github_pat_abc');
  clearToken(s);
  assert.equal(getToken(s), null);
});

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

// Scriptable GitHub Contents API stub: `plan` is a list of handlers consumed in order.
function fakeGitHub(plan) {
  const calls = [];
  const fetchImpl = (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    const handler = plan.shift();
    return Promise.resolve(handler(url, opts));
  };
  return { fetchImpl, calls };
}

const okRead = (content, sha) => () => ({ ok: true, status: 200, json: () => Promise.resolve({ content: b64(content), sha }) });
const okWrite = () => () => ({ ok: true, status: 201, json: () => Promise.resolve({}) });
const conflict = () => () => ({ ok: false, status: 409, json: () => Promise.resolve({}) });

const newGame = game('2026-06-01-boom-1', 'boom', '2026-06-01', [2], [3]);

test('saveGame appends the game and PUTs with the fetched sha', async () => {
  const existing = game('2026-05-30-boom-1', 'boom', '2026-05-30', [1], [1]);
  const gh = fakeGitHub([okRead({ games: [existing] }, 'sha-1'), okWrite()]);

  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, fetchImpl: gh.fetchImpl });

  assert.deepEqual(result.games, [existing, newGame]);
  assert.equal(result.courses, null);
  const put = gh.calls[1];
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, 'https://api.github.com/repos/o/r/contents/data/games.json');
  assert.equal(put.body.sha, 'sha-1');
  assert.match(put.body.message, /2026-06-01-boom-1/);
  const written = JSON.parse(Buffer.from(put.body.content, 'base64').toString());
  assert.deepEqual(written.games, [existing, newGame]);
});

test('saveGame sends the token only in the Authorization header', async () => {
  const gh = fakeGitHub([okRead({ games: [] }, 's'), okWrite()]);
  await saveGame({ repo: 'o/r', token: 'sekret', game: newGame, fetchImpl: gh.fetchImpl });
  for (const call of gh.calls) {
    assert.equal(call.headers.Authorization, 'Bearer sekret');
    assert.ok(!JSON.stringify(call.body ?? {}).includes('sekret'), 'token must never be in a request body');
  }
});

test('saveGame refetches and retries once on conflict', async () => {
  const other = game('2026-05-31-boom-1', 'boom', '2026-05-31', [3], [2]);
  const gh = fakeGitHub([
    okRead({ games: [] }, 'stale'),
    conflict(),
    okRead({ games: [other] }, 'fresh'),
    okWrite(),
  ]);
  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [other, newGame]);
});

test('saveGame gives up after a second conflict', async () => {
  const gh = fakeGitHub([okRead({ games: [] }, 'a'), conflict(), okRead({ games: [] }, 'b'), conflict()]);
  await assert.rejects(saveGame({ repo: 'o/r', token: 't', game: newGame, fetchImpl: gh.fetchImpl }), /Save conflict/);
});

test('saveGame with a new course updates courses.json first, then games.json', async () => {
  const course = { id: 'brugge', name: 'Golf Brugge', location: 'Brugge', holes: 12 };
  const gh = fakeGitHub([
    okRead({ courses: [] }, 'cs'),
    okWrite(),
    okRead({ games: [] }, 'gs'),
    okWrite(),
  ]);
  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, newCourse: course, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.courses, [course]);
  assert.deepEqual(result.games, [newGame]);
  assert.match(gh.calls[0].url, /data\/courses\.json$/);
  assert.match(gh.calls[1].body.message, /Golf Brugge/);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find `js/data.js` / `js/github.js`.

- [ ] **Step 4: Write `js/data.js`**

```js
const FILES = ['data/config.json', 'data/courses.json', 'data/games.json'];

export async function loadAll(fetchImpl = fetch) {
  const [config, coursesFile, gamesFile] = await Promise.all(
    FILES.map(async (path) => {
      const res = await fetchImpl(`${path}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return res.json();
    }),
  );
  return { config, courses: coursesFile.courses, games: gamesFile.games };
}
```

- [ ] **Step 5: Write `js/github.js`**

```js
// Token storage and GitHub Contents API writes.
// The token lives ONLY in browser localStorage and is sent ONLY to api.github.com
// in the Authorization header. It must never appear in file contents or URLs.

const TOKEN_KEY = 'minigolf.token';

export function getToken(storage = globalThis.localStorage) {
  return storage.getItem(TOKEN_KEY);
}

export function setToken(token, storage = globalThis.localStorage) {
  storage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken(storage = globalThis.localStorage) {
  storage.removeItem(TOKEN_KEY);
}

function apiUrl(repo, path) {
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  };
}

async function fetchFile(repo, path, token, fetchImpl) {
  const res = await fetchImpl(apiUrl(repo, path), { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub read of ${path} failed: ${res.status}`);
  const body = await res.json();
  return { content: JSON.parse(fromBase64(body.content)), sha: body.sha };
}

// Returns { conflict: true } on HTTP 409 (stale sha) so the caller can retry.
async function putFile(repo, path, content, sha, message, token, fetchImpl) {
  const res = await fetchImpl(apiUrl(repo, path), {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sha,
      content: toBase64(JSON.stringify(content, null, 2) + '\n'),
    }),
  });
  if (res.status === 409) return { conflict: true };
  if (!res.ok) throw new Error(`GitHub write of ${path} failed: ${res.status}`);
  return { conflict: false };
}

async function saveWithRetry(repo, path, token, fetchImpl, apply, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, sha } = await fetchFile(repo, path, token, fetchImpl);
    const updated = apply(content);
    const { conflict } = await putFile(repo, path, updated, sha, message, token, fetchImpl);
    if (!conflict) return updated;
  }
  throw new Error('Save conflict: someone else just saved. Reload and try again.');
}

export async function saveGame({ repo, token, game, newCourse = null, fetchImpl = fetch }) {
  let courses = null;
  if (newCourse) {
    const updated = await saveWithRetry(
      repo, 'data/courses.json', token, fetchImpl,
      (data) => ({ courses: [...data.courses, newCourse] }),
      `Add course: ${newCourse.name}`,
    );
    courses = updated.courses;
  }
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => ({ games: [...data.games, game] }),
    `Add game: ${game.id}`,
  );
  return { games: updated.games, courses };
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 28 tests total.

- [ ] **Step 7: Commit**

```bash
git add js/data.js js/github.js test/data.test.js test/github.test.js
git commit -m "feat: data loader and GitHub Contents API client with conflict retry"
```

---

### Task 6: App shell — index.html, stylesheet, router

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`, `js/views/helpers.js`
- Create (stubs, replaced in Tasks 7–10): `js/views/home.js`, `js/views/courses.js`, `js/views/course.js`, `js/views/stats.js`, `js/views/new.js`
- Create: `test/helpers.test.js`

**Interfaces:**
- Consumes: `loadAll` from Task 5.
- Produces from `js/views/helpers.js` (used by every view):
  - `esc(s) -> string` — HTML-escapes `& < > " '`
  - `CROWN` — crown icon HTML string
  - `fmtDate(iso) -> string` — `'2026-07-12'` → `'12 Jul 2026'`
  - `fmt1(n) -> string` — one decimal, e.g. `2.5` → `'2.5'`
  - `courseName(courses, id) -> string`
- Produces routing contract in `js/app.js`: `#/` → home, `#/courses` → courses, `#/courses/<id>` → course detail, `#/stats` → stats, `#/new` → add game. Sets `--p1`/`--p2` CSS custom properties from config colors. Calls `renderX(state)` and sets `innerHTML`; for stats also calls `wireChart(app, ...)` (Task 9); for new calls `mountNew(app, state, { onSaved })` (Task 10).

- [ ] **Step 1: Write the failing test `test/helpers.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, fmtDate, fmt1, courseName } from '../js/views/helpers.js';
import { courses } from './fixtures.js';

test('esc escapes HTML metacharacters', () => {
  assert.equal(esc(`<b>"a" & 'b'</b>`), '&lt;b&gt;&quot;a&quot; &amp; &#39;b&#39;&lt;/b&gt;');
});

test('fmtDate renders a readable date', () => {
  assert.equal(fmtDate('2026-07-12'), '12 Jul 2026');
});

test('fmt1 rounds to one decimal', () => {
  assert.equal(fmt1(2.4499), '2.4');
  assert.equal(fmt1(3), '3.0');
});

test('courseName resolves an id, falling back to the id', () => {
  assert.equal(courseName(courses, 'boom'), 'Golf Boom');
  assert.equal(courseName(courses, 'gone'), 'gone');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find `js/views/helpers.js`.

- [ ] **Step 3: Write `js/views/helpers.js`**

```js
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

export const CROWN = '<span class="crown" role="img" aria-label="leader">👑</span>';

export const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

export const fmt1 = (n) => n.toFixed(1);

export const courseName = (courses, id) => {
  const course = courses.find((c) => c.id === id);
  return course ? course.name : id;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS — 32 tests total.

- [ ] **Step 5: Write view stubs (replaced in later tasks)**

`js/views/home.js`:

```js
export function renderHome() {
  return '<p class="empty">Home coming soon.</p>';
}
```

`js/views/courses.js`:

```js
export function renderCourses() {
  return '<p class="empty">Courses coming soon.</p>';
}
```

`js/views/course.js`:

```js
export function renderCourse() {
  return '<p class="empty">Course coming soon.</p>';
}
```

`js/views/stats.js`:

```js
export function renderStats() {
  return '<p class="empty">Stats coming soon.</p>';
}
export function wireStats() {}
```

`js/views/new.js`:

```js
export function mountNew(container) {
  container.innerHTML = '<p class="empty">Add game coming soon.</p>';
}
```

- [ ] **Step 6: Write `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Minigolf Forever</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⛳</text></svg>" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css" />
</head>
<body>
  <header class="topbar">
    <a class="brand" href="#/">⛳ Minigolf Forever</a>
    <nav class="topnav">
      <a href="#/" data-nav="home">Home</a>
      <a href="#/courses" data-nav="courses">Courses</a>
      <a href="#/stats" data-nav="stats">Stats</a>
      <a href="#/new" data-nav="new">Add game</a>
    </nav>
  </header>
  <main id="app"><p class="empty">Loading…</p></main>
  <nav class="tabbar">
    <a href="#/" data-nav="home"><span class="tab-icon">🏠</span>Home</a>
    <a href="#/courses" data-nav="courses"><span class="tab-icon">🚩</span>Courses</a>
    <a href="#/stats" data-nav="stats"><span class="tab-icon">📊</span>Stats</a>
    <a href="#/new" data-nav="new"><span class="tab-icon">➕</span>Add</a>
  </nav>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 7: Write `js/app.js`**

```js
import { loadAll } from './data.js';
import { renderHome } from './views/home.js';
import { renderCourses } from './views/courses.js';
import { renderCourse } from './views/course.js';
import { renderStats, wireStats } from './views/stats.js';
import { mountNew } from './views/new.js';

const app = document.getElementById('app');
let state = null;

function currentRoute() {
  const [page, param] = location.hash.replace(/^#\/?/, '').split('/');
  return { page: page || 'home', param };
}

function markActiveNav(page) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === page);
  });
}

function onSaved({ games, courses }, courseId) {
  state.games = games;
  if (courses) state.courses = courses;
  location.hash = `#/courses/${courseId}`;
}

function render() {
  if (!state) return;
  const { page, param } = currentRoute();
  markActiveNav(page);
  if (page === 'home') app.innerHTML = renderHome(state);
  else if (page === 'courses' && param) app.innerHTML = renderCourse(state, param);
  else if (page === 'courses') app.innerHTML = renderCourses(state);
  else if (page === 'stats') {
    app.innerHTML = renderStats(state);
    wireStats(app, state);
  } else if (page === 'new') mountNew(app, state, { onSaved });
  else app.innerHTML = '<p class="empty">Page not found. 🕳️</p>';
  window.scrollTo(0, 0);
}

async function main() {
  try {
    state = await loadAll();
    const [p1, p2] = state.config.players;
    document.documentElement.style.setProperty('--p1', p1.color);
    document.documentElement.style.setProperty('--p2', p2.color);
    render();
  } catch (err) {
    console.error(err);
    app.innerHTML = `
      <div class="card error-card">
        <p>Could not load the scores. 😢</p>
        <button type="button" onclick="location.reload()">Try again</button>
      </div>`;
  }
}

window.addEventListener('hashchange', render);
main();
```

- [ ] **Step 8: Write `css/style.css`**

```css
/* ─── Tokens ─────────────────────────────────────────────── */
:root {
  --felt: #123f2e;
  --felt-deep: #0c2d20;
  --card: #faf6ec;
  --card-line: #e7ddc4;
  --ink: #24312a;
  --ink-soft: #63705f;
  --ink-faint: #9aa694;
  --gold: #b8860b;
  --gold-bg: #fdf3d1;
  --bad: #b03a2e;
  --bad-bg: #fbe3df;
  --p1: #2f9e6e; /* overwritten from config at boot */
  --p2: #8b5cf6;
  --radius: 16px;
  --shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}

* { box-sizing: border-box; }

html { background: var(--felt); }

body {
  margin: 0;
  min-height: 100vh;
  font-family: 'Fredoka', system-ui, sans-serif;
  color: var(--ink);
  background:
    radial-gradient(1200px 500px at 50% -180px, rgba(255, 255, 255, 0.07), transparent),
    var(--felt);
}

/* ─── Chrome: top bar & tab bar ──────────────────────────── */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  color: var(--card);
}

.brand {
  color: inherit;
  text-decoration: none;
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: 0.02em;
}

.topnav { display: flex; gap: 4px; }

.topnav a {
  color: rgba(250, 246, 236, 0.75);
  text-decoration: none;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 999px;
}

.topnav a.active { background: rgba(250, 246, 236, 0.16); color: var(--card); }
.topnav a:hover { color: var(--card); }

.tabbar {
  display: none;
  position: fixed;
  inset: auto 0 0 0;
  background: var(--felt-deep);
  padding: 6px 0 max(6px, env(safe-area-inset-bottom));
  justify-content: space-around;
  z-index: 10;
}

.tabbar a {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: rgba(250, 246, 236, 0.65);
  text-decoration: none;
  font-size: 0.72rem;
  font-weight: 500;
  padding: 4px 14px;
  border-radius: 12px;
}

.tabbar a.active { color: var(--card); }
.tab-icon { font-size: 1.25rem; }

@media (max-width: 719px) {
  .topnav { display: none; }
  .tabbar { display: flex; }
  body { padding-bottom: 76px; }
}

/* ─── Layout & cards ─────────────────────────────────────── */
#app {
  max-width: 860px;
  margin: 0 auto;
  padding: 8px 16px 40px;
}

.card {
  background: var(--card);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 20px;
  margin-bottom: 16px;
}

.page-title {
  color: var(--card);
  text-align: center;
  font-weight: 700;
  margin: 10px 0 4px;
}

.center { text-align: center; }
.muted { color: var(--ink-soft); }
.page-sub { color: rgba(250, 246, 236, 0.7); text-align: center; margin: 0 0 16px; }
.empty { color: rgba(250, 246, 236, 0.8); text-align: center; padding: 48px 16px; font-size: 1.05rem; }
.error-card { text-align: center; padding: 40px 20px; }

h3 { margin: 0 0 12px; font-weight: 600; }
.crown { font-size: 1.4em; line-height: 1; }

button {
  font: inherit;
  border: 0;
  border-radius: 12px;
  padding: 12px 20px;
  background: var(--felt);
  color: var(--card);
  font-weight: 600;
  cursor: pointer;
}

button:disabled { opacity: 0.55; cursor: default; }

/* ─── Home: face-off hero ────────────────────────────────── */
.hero { padding: 28px 20px; }

.face-off {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.player-panel h2 { margin: 0; font-size: 1.3rem; font-weight: 700; }
.player-panel.p1 h2 { color: var(--p1); }
.player-panel.p2 h2 { color: var(--p2); }

.crown-slot { height: 34px; font-size: 26px; }

.win-count { font-size: 3.4rem; font-weight: 700; line-height: 1.1; }
.win-label { color: var(--ink-soft); font-size: 0.85rem; }

.tally-ties {
  color: var(--ink-faint);
  font-weight: 600;
  font-size: 0.9rem;
  padding: 6px 10px;
  border: 2px dashed var(--card-line);
  border-radius: 12px;
  white-space: nowrap;
}

.stroke-line {
  text-align: center;
  color: var(--ink-soft);
  border-top: 2px dashed var(--card-line);
  margin: 20px 0 0;
  padding-top: 16px;
}

.recent { list-style: none; margin: 0; padding: 0; }

.recent a {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 4px;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid var(--card-line);
}

.recent li:last-child a { border-bottom: 0; }
.recent-course { font-weight: 600; flex: 1; }
.recent-date { color: var(--ink-soft); font-size: 0.85rem; }

.chip {
  font-weight: 600;
  font-size: 0.9rem;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--card-line);
}

.chip.p1 { background: color-mix(in srgb, var(--p1) 18%, white); }
.chip.p2 { background: color-mix(in srgb, var(--p2) 18%, white); }

/* ─── Courses grid ───────────────────────────────────────── */
.course-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.course-card {
  display: block;
  color: inherit;
  text-decoration: none;
  margin-bottom: 0;
}

.course-card h3 { margin-bottom: 4px; }
.course-card p { margin: 4px 0; }

/* ─── Course detail: games & scorecards ──────────────────── */
details.game { padding: 0; overflow: hidden; }

details.game summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  cursor: pointer;
  list-style: none;
  font-weight: 600;
}

details.game summary::-webkit-details-marker { display: none; }
.game-date { flex: 1; }
.game-result { font-size: 1.1rem; }
.game-winner { color: var(--ink-soft); font-weight: 500; }

.scorecard-scroll { overflow-x: auto; padding: 0 20px 16px; }

table.scorecard { border-collapse: collapse; min-width: 100%; }

table.scorecard th,
table.scorecard td {
  padding: 6px 8px;
  text-align: center;
  border: 1px solid var(--card-line);
  font-size: 0.9rem;
  min-width: 30px;
}

table.scorecard thead th { background: var(--card-line); font-weight: 600; }
table.scorecard tbody th { text-align: left; font-weight: 600; }
table.scorecard tbody tr:first-child th { color: var(--p1); }
table.scorecard tbody tr:last-child th { color: var(--p2); }
td.total { font-weight: 700; }
td.ace { background: var(--gold-bg); color: var(--gold); font-weight: 700; }
td.max { background: var(--bad-bg); color: var(--bad); font-weight: 700; }
td.hole-win { box-shadow: inset 0 -3px 0 var(--card-line); }
.note { padding: 0 20px 16px; color: var(--ink-soft); margin: 0; }

/* ─── Stats page ─────────────────────────────────────────── */
.stat-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.stat-col h4 { margin: 0 0 10px; text-align: center; font-size: 1.05rem; }
.stat-col.p1 h4 { color: var(--p1); }
.stat-col.p2 h4 { color: var(--p2); }

.tile {
  background: white;
  border: 1px solid var(--card-line);
  border-radius: 12px;
  padding: 10px 14px;
  margin-bottom: 8px;
}

.tile-label { color: var(--ink-soft); font-size: 0.8rem; }
.tile-value { font-size: 1.5rem; font-weight: 600; }
.tile-sub { color: var(--ink-faint); font-size: 0.78rem; }

table.records { width: 100%; border-collapse: collapse; }

table.records th,
table.records td {
  padding: 8px 6px;
  text-align: left;
  border-bottom: 1px solid var(--card-line);
  font-size: 0.92rem;
}

table.records th { color: var(--ink-soft); font-weight: 500; font-size: 0.8rem; }

/* ─── Chart ──────────────────────────────────────────────── */
.chart-wrap { position: relative; }
.chart-wrap svg { width: 100%; height: auto; display: block; }
.gridline { stroke: var(--card-line); stroke-width: 1; }
.tick { fill: var(--ink-faint); font-size: 11px; font-family: inherit; }
.series { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.series.p1 { stroke: var(--p1); }
.series.p2 { stroke: var(--p2); }
.dot { stroke: var(--card); stroke-width: 2; }
.dot.p1 { fill: var(--p1); }
.dot.p2 { fill: var(--p2); }
.crosshair { stroke: var(--ink-faint); stroke-width: 1; }
.hidden { display: none; }

.chart-tooltip {
  position: absolute;
  top: 8px;
  transform: translateX(-50%);
  background: var(--ink);
  color: var(--card);
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 0.82rem;
  pointer-events: none;
  white-space: nowrap;
}

.tip-date { color: rgba(250, 246, 236, 0.7); margin-bottom: 2px; }
.tip-row { display: flex; align-items: center; gap: 6px; }
.tip-row strong { font-size: 0.95rem; }

.legend { display: flex; gap: 18px; justify-content: center; padding-top: 10px; font-size: 0.85rem; color: var(--ink-soft); }
.legend > span { display: inline-flex; align-items: center; gap: 6px; }
.line-key { display: inline-block; width: 16px; height: 0; border-top: 3px solid; border-radius: 2px; }
.line-key.p1 { border-color: var(--p1); }
.line-key.p2 { border-color: var(--p2); }

/* ─── Add game form ──────────────────────────────────────── */
.field { margin-bottom: 14px; }
.field label { display: block; font-size: 0.85rem; color: var(--ink-soft); margin-bottom: 4px; }

.field input,
.field select,
.field textarea {
  font: inherit;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--card-line);
  border-radius: 10px;
  background: white;
  color: inherit;
}

.hole-row { border-bottom: 1px solid var(--card-line); padding: 10px 0; }
.hole-row h5 { margin: 0 0 6px; font-size: 0.9rem; color: var(--ink-soft); }

.score-line { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.score-name { width: 64px; font-weight: 600; font-size: 0.9rem; }
.score-line.p1 .score-name { color: var(--p1); }
.score-line.p2 .score-name { color: var(--p2); }

.score-btn {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 50%;
  background: white;
  border: 1px solid var(--card-line);
  color: var(--ink);
  font-weight: 600;
}

.score-line.p1 .score-btn.selected { background: var(--p1); border-color: var(--p1); color: white; }
.score-line.p2 .score-btn.selected { background: var(--p2); border-color: var(--p2); color: white; }

.running-totals {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  justify-content: center;
  gap: 24px;
  background: var(--card);
  border-bottom: 2px dashed var(--card-line);
  padding: 10px 0;
  font-weight: 700;
  font-size: 1.15rem;
}

.running-totals .p1 { color: var(--p1); }
.running-totals .p2 { color: var(--p2); }

.form-error { color: var(--bad); font-weight: 600; }
.token-note { font-size: 0.85rem; color: var(--ink-soft); }
.linklike { background: none; border: none; color: var(--felt); text-decoration: underline; padding: 0; font-weight: 500; }
.save-row { display: flex; align-items: center; gap: 14px; margin-top: 16px; }
```

- [ ] **Step 9: Manually verify the shell**

Run: `npx -y http-server -p 8123 -c-1` (leave running in background), then open `http://localhost:8123`.

Expected:
- Dark green felt page, top bar "⛳ Minigolf Forever" with 4 nav links.
- Home shows the stub text; `#/courses`, `#/stats`, `#/new` all switch content and highlight the active nav item.
- Narrow the window below 720px: top nav disappears, bottom tab bar appears.
- No console errors.

- [ ] **Step 10: Run full test suite and commit**

Run: `npm test`
Expected: PASS — 32 tests.

```bash
git add index.html css/style.css js/app.js js/views/
git commit -m "feat: app shell with hash router, styling and view stubs"
```

---

### Task 7: Home view

**Files:**
- Modify: `js/views/home.js` (replace stub)
- Create: `test/home.test.js`

**Interfaces:**
- Consumes: `overallTally`, `totalStrokes`, `sortByDateDesc`, `gameTotals`, `gameWinner` (stats); `esc`, `CROWN`, `fmtDate`, `courseName` (helpers).
- Produces: `renderHome(state) -> string`. The overall leader's panel has class `player-panel ... leader` and contains the crown; win counts in `.win-count`; recent games link to `#/courses/<id>`.

- [ ] **Step 1: Write the failing tests `test/home.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../js/views/home.js';
import { config, courses, games } from './fixtures.js';

const state = { config, courses, games };

test('home shows both players and their win counts', () => {
  const html = renderHome(state);
  assert.match(html, /Robbe/);
  assert.match(html, /Saar/);
  assert.match(html, /<div class="win-count">1<\/div>/);
  assert.match(html, /<div class="win-count">2<\/div>/);
  assert.match(html, /1 tie/);
});

test('the leader panel gets the crown', () => {
  const html = renderHome(state);
  assert.match(html, /player-panel p2 leader/); // saar leads 2-1
  assert.ok(!html.includes('player-panel p1 leader'));
  assert.match(html, /class="crown"/);
});

test('a tied match-up crowns nobody', () => {
  const html = renderHome({ config, courses, games: [] });
  assert.ok(!html.includes('leader'));
  assert.ok(!html.includes('class="crown"'));
  assert.match(html, /No games yet/);
});

test('stroke line names who has fewer strokes', () => {
  const html = renderHome(state);
  assert.match(html, /Robbe has taken 3 fewer strokes/); // 25 vs 28
});

test('recent games list links to the course page', () => {
  const html = renderHome(state);
  assert.match(html, /href="#\/courses\/gent"/);
  assert.match(html, /Putt Gent/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — stub returns placeholder text.

- [ ] **Step 3: Replace `js/views/home.js`**

```js
import { overallTally, totalStrokes, sortByDateDesc, gameTotals, gameWinner } from '../stats.js';
import { esc, CROWN, fmtDate, courseName } from './helpers.js';

export function renderHome(state) {
  const { config, courses, games } = state;
  const [p1, p2] = config.players;
  const ids = [p1.id, p2.id];
  const { wins, ties } = overallTally(games, ids);
  const strokes = totalStrokes(games, ids);
  const leaderId =
    wins[p1.id] === wins[p2.id] ? null : wins[p1.id] > wins[p2.id] ? p1.id : p2.id;

  const panel = (p, cls) => `
    <div class="player-panel ${cls}${leaderId === p.id ? ' leader' : ''}">
      <div class="crown-slot">${leaderId === p.id ? CROWN : ''}</div>
      <h2>${esc(p.name)}</h2>
      <div class="win-count">${wins[p.id]}</div>
      <div class="win-label">wins</div>
    </div>`;

  let strokeLine = 'No games yet — go play! ⛳';
  if (games.length > 0) {
    if (strokes[p1.id] === strokes[p2.id]) {
      strokeLine = `Dead even on strokes all-time: ${strokes[p1.id]} each`;
    } else {
      const fewer = strokes[p1.id] < strokes[p2.id] ? p1 : p2;
      const diff = Math.abs(strokes[p1.id] - strokes[p2.id]);
      strokeLine = `${esc(fewer.name)} has taken ${diff} fewer strokes all-time (${strokes[p1.id]} vs ${strokes[p2.id]})`;
    }
  }

  const recent = sortByDateDesc(games).slice(0, 3).map((g) => {
      const totals = gameTotals(g);
      const w = gameWinner(g);
      const chipCls = w === 'tie' ? '' : w === p1.id ? ' p1' : ' p2';
      return `<li><a href="#/courses/${esc(g.courseId)}">
        <span class="recent-course">${esc(courseName(courses, g.courseId))}</span>
        <span class="recent-date">${fmtDate(g.date)}</span>
        <span class="chip${chipCls}">${totals[p1.id]} – ${totals[p2.id]} ${w === 'tie' ? '🤝' : '👑'}</span>
      </a></li>`;
    }).join('');

  return `
  <section class="hero card">
    <div class="face-off">
      ${panel(p1, 'p1')}
      <div class="tally-ties">${ties} tie${ties === 1 ? '' : 's'}</div>
      ${panel(p2, 'p2')}
    </div>
    <p class="stroke-line">${strokeLine}</p>
  </section>
  <section class="card">
    <h3>Recent games</h3>
    ${games.length ? `<ul class="recent">${recent}</ul>` : '<p class="muted">Nothing here yet.</p>'}
  </section>`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 37 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/views/home.js test/home.test.js
git commit -m "feat: rivalry homescreen with crowns, tally and recent games"
```

---

### Task 8: Courses list & course detail views

**Files:**
- Modify: `js/views/courses.js`, `js/views/course.js` (replace stubs)
- Create: `test/courses.test.js`

**Interfaces:**
- Consumes: `timesPlayed`, `courseLeader`, `sortByDateDesc`, `gameTotals`, `gameWinner`, `holeWinner` (stats); helpers.
- Produces: `renderCourses(state) -> string`; `renderCourse(state, courseId) -> string`. Scorecard cells use `td.ace` for 1s, `td.max` for `config.maxScore`, `td.hole-win` on the per-hole winner's cell.

- [ ] **Step 1: Write the failing tests `test/courses.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCourses } from '../js/views/courses.js';
import { renderCourse } from '../js/views/course.js';
import { config, courses, games } from './fixtures.js';

const state = { config, courses, games };

test('courses grid lists every course with play count and leader crown', () => {
  const html = renderCourses(state);
  assert.match(html, /Golf Boom/);
  assert.match(html, /Putt Gent/);
  assert.match(html, /2 games/);
  assert.match(html, /👑<\/span> Saar/); // gent leader
  assert.match(html, /href="#\/courses\/boom"/);
});

test('courses grid with no courses shows an empty state', () => {
  assert.match(renderCourses({ config, courses: [], games: [] }), /No courses yet/);
});

test('course page renders a scorecard per game, newest first', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /Golf Boom/);
  const first = html.indexOf('1 Feb 2026');
  const second = html.indexOf('10 Jan 2026');
  assert.ok(first !== -1 && second !== -1 && first < second, 'newest game first');
});

test('scorecard highlights aces, sevens and hole winners', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /td class="ace[^"]*">1</);
  assert.match(html, /td class="[^"]*max[^"]*">7</);
  assert.match(html, /hole-win/);
});

test('game header crowns the winner and marks ties', () => {
  const boom = renderCourse(state, 'boom');
  assert.match(boom, /👑<\/span> Saar/);
  const gent = renderCourse(state, 'gent');
  assert.match(gent, /🤝 Tie/);
});

test('unknown course shows a friendly message', () => {
  assert.match(renderCourse(state, 'nope'), /Course not found/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — stubs return placeholder text.

- [ ] **Step 3: Replace `js/views/courses.js`**

```js
import { timesPlayed, courseLeader } from '../stats.js';
import { esc, CROWN } from './helpers.js';

export function renderCourses(state) {
  const { config, courses, games } = state;
  const ids = config.players.map((p) => p.id);
  if (courses.length === 0) {
    return '<p class="empty">No courses yet. Add your first game! ⛳</p>';
  }

  const cards = [...courses]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => {
      const n = timesPlayed(games, c.id);
      const leaderId = n === 0 ? 'tie' : courseLeader(games, c.id, ids);
      const leader = config.players.find((p) => p.id === leaderId);
      return `<a class="card course-card" href="#/courses/${esc(c.id)}">
        <h3>${esc(c.name)}</h3>
        <p class="muted">${esc(c.location)} · ${c.holes} holes</p>
        <p>${n} game${n === 1 ? '' : 's'}${leader ? ` · ${CROWN} ${esc(leader.name)}` : ''}</p>
      </a>`;
    })
    .join('');

  return `<h2 class="page-title">Courses</h2><div class="course-grid">${cards}</div>`;
}
```

- [ ] **Step 4: Replace `js/views/course.js`**

```js
import { sortByDateDesc, gameTotals, gameWinner, holeWinner } from '../stats.js';
import { esc, CROWN, fmtDate } from './helpers.js';

function scorecard(game, config) {
  const [p1, p2] = config.players;
  const holes = game.scores[p1.id].length;
  const head = Array.from({ length: holes }, (_, i) => `<th>${i + 1}</th>`).join('');

  const row = (p) =>
    game.scores[p.id]
      .map((s, i) => {
        const cls = [
          s === 1 ? 'ace' : '',
          s === config.maxScore ? 'max' : '',
          holeWinner(game, i) === p.id ? 'hole-win' : '',
        ].filter(Boolean).join(' ');
        return `<td class="${cls}">${s}</td>`;
      })
      .join('');

  const totals = gameTotals(game);
  return `<div class="scorecard-scroll"><table class="scorecard">
    <thead><tr><th>Hole</th>${head}<th>Total</th></tr></thead>
    <tbody>
      <tr><th>${esc(p1.name)}</th>${row(p1)}<td class="total">${totals[p1.id]}</td></tr>
      <tr><th>${esc(p2.name)}</th>${row(p2)}<td class="total">${totals[p2.id]}</td></tr>
    </tbody>
  </table></div>`;
}

export function renderCourse(state, courseId) {
  const { config, courses, games } = state;
  const course = courses.find((c) => c.id === courseId);
  if (!course) return '<p class="empty">Course not found. 🕳️</p>';

  const [p1, p2] = config.players;
  const list = sortByDateDesc(games.filter((g) => g.courseId === courseId));

  const items = list
    .map((g) => {
      const totals = gameTotals(g);
      const w = gameWinner(g);
      const winner = config.players.find((p) => p.id === w);
      return `<details class="card game">
        <summary>
          <span class="game-date">${fmtDate(g.date)}</span>
          <span class="game-result">${totals[p1.id]} – ${totals[p2.id]}</span>
          <span class="game-winner">${winner ? `${CROWN} ${esc(winner.name)}` : '🤝 Tie'}</span>
        </summary>
        ${scorecard(g, config)}
        ${g.note ? `<p class="note">${esc(g.note)}</p>` : ''}
      </details>`;
    })
    .join('');

  return `<h2 class="page-title">${esc(course.name)}</h2>
    <p class="page-sub">${esc(course.location)} · ${course.holes} holes · ${list.length} game${list.length === 1 ? '' : 's'}</p>
    ${items || '<p class="empty">No games here yet.</p>'}`;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 43 tests total.

- [ ] **Step 6: Manual check with temporary sample data**

Temporarily replace `data/courses.json` with:

```json
{
  "courses": [
    { "id": "blankenberge", "name": "Minigolf Blankenberge", "location": "Blankenberge", "holes": 18 }
  ]
}
```

and `data/games.json` with:

```json
{
  "games": [
    {
      "id": "2026-07-12-blankenberge-1",
      "courseId": "blankenberge",
      "date": "2026-07-12",
      "scores": {
        "robbe": [2, 1, 3, 7, 2, 4, 3, 2, 5, 2, 3, 1, 4, 2, 3, 2, 6, 2],
        "saar": [3, 2, 2, 4, 1, 3, 3, 2, 4, 3, 2, 2, 3, 3, 2, 4, 3, 2]
      },
      "note": "Summer holiday at the coast"
    }
  ]
}
```

With the local server from Task 6 still running, check `#/`, `#/courses`, and the course page: crowns render, the scorecard expands, aces are gold, the 7 is red, the table scrolls horizontally on a narrow window.

Then restore the empty files:

```bash
git checkout -- data/courses.json data/games.json
```

- [ ] **Step 7: Commit**

```bash
git add js/views/courses.js js/views/course.js test/courses.test.js
git commit -m "feat: courses grid and per-course game history with scorecards"
```

---

### Task 9: Stats page & trend chart

**Files:**
- Create: `js/views/chart.js`
- Modify: `js/views/stats.js` (replace stub)
- Create: `test/stats-view.test.js`

**Interfaces:**
- Consumes: everything from `js/stats.js`; helpers.
- Produces from `js/views/chart.js`:
  - `renderChart(points, players) -> string` — `points` is `timeline()` output (ascending), `players` is `config.players`.
  - `wireChart(root, points, players)` — attaches crosshair + tooltip listeners inside `root`.
- Produces from `js/views/stats.js`:
  - `renderStats(state) -> string`
  - `wireStats(root, state)` — calls `wireChart` (called by the router after every stats render).

Chart spec (from the dataviz method — keep these exact): 2px lines with round join/cap, end dots r=4 with a 2px surface-colored ring, 1px solid hairline gridlines at every integer 1–7, axis/tick text in muted ink (never player colors), legend always present, crosshair snaps to the nearest game with a single tooltip listing both players (values first, names second, line-key swatches), tooltip text inserted via `textContent`. Player colors `#2f9e6e`/`#8b5cf6` on the cream card were validated (CVD ΔE 84.7, all checks pass).

- [ ] **Step 1: Write the failing tests `test/stats-view.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStats } from '../js/views/stats.js';
import { renderChart } from '../js/views/chart.js';
import { timeline } from '../js/stats.js';
import { config, courses, games } from './fixtures.js';

const state = { config, courses, games };

test('stats page renders all four sections', () => {
  const html = renderStats(state);
  assert.match(html, /Hole-in-ones/);
  assert.match(html, /Sevens/);
  assert.match(html, /Head to head/);
  assert.match(html, /Averages/);
  assert.match(html, /Course records/);
});

test('highlight tiles carry the right counts', () => {
  const html = renderStats(state);
  assert.match(html, /Biggest win/);
  assert.match(html, /Longest streak/);
});

test('empty stats page shows a friendly message', () => {
  assert.match(renderStats({ config, courses, games: [] }), /No stats yet/);
});

test('course records table lists best rounds per course', () => {
  const html = renderStats(state);
  assert.match(html, /Golf Boom/);
  assert.match(html, /Putt Gent/);
});

test('chart renders two series, gridlines, legend and a crosshair', () => {
  const html = renderChart(timeline(games, ['robbe', 'saar']), config.players);
  assert.match(html, /<polyline[^>]*class="series p1"/);
  assert.match(html, /<polyline[^>]*class="series p2"/);
  assert.match(html, /class="gridline"/);
  assert.match(html, /class="legend"/);
  assert.match(html, /class="crosshair hidden"/);
  assert.match(html, /Robbe/);
});

test('chart with fewer than two games asks for more play', () => {
  assert.match(renderChart([], config.players), /at least two games/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `js/views/chart.js` missing; stats stub returns placeholder.

- [ ] **Step 3: Write `js/views/chart.js`**

```js
import { esc } from './helpers.js';

const W = 640;
const H = 240;
const P = { t: 16, r: 16, b: 28, l: 34 };

const xAt = (i, count) => P.l + (i * (W - P.l - P.r)) / (count - 1);
const yAt = (v) => P.t + ((7 - v) * (H - P.t - P.b)) / 6;

export function renderChart(points, players) {
  if (points.length < 2) {
    return '<p class="muted">Play at least two games to see the trend.</p>';
  }

  const grid = [1, 2, 3, 4, 5, 6, 7]
    .map((v) => `<line class="gridline" x1="${P.l}" y1="${yAt(v)}" x2="${W - P.r}" y2="${yAt(v)}"/>
      <text class="tick" x="${P.l - 8}" y="${yAt(v) + 4}" text-anchor="end">${v}</text>`)
    .join('');

  const series = (p, cls) => {
    const pts = points.map((pt, i) => `${xAt(i, points.length)},${yAt(pt.avgPerHole[p.id])}`).join(' ');
    const lastY = yAt(points[points.length - 1].avgPerHole[p.id]);
    return `<polyline class="series ${cls}" points="${pts}"/>
      <circle class="dot ${cls}" cx="${xAt(points.length - 1, points.length)}" cy="${lastY}" r="4"/>`;
  };

  return `<div class="chart-wrap">
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Average score per hole, per game, over time">
      ${grid}
      <text class="tick" x="${P.l}" y="${H - 6}">${points[0].date}</text>
      <text class="tick" x="${W - P.r}" y="${H - 6}" text-anchor="end">${points[points.length - 1].date}</text>
      ${series(players[0], 'p1')}
      ${series(players[1], 'p2')}
      <line class="crosshair hidden" y1="${P.t}" y2="${H - P.b}"/>
      <rect class="hit" x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="transparent"/>
    </svg>
    <div class="chart-tooltip hidden"></div>
    <div class="legend">
      <span><span class="line-key p1"></span>${esc(players[0].name)}</span>
      <span><span class="line-key p2"></span>${esc(players[1].name)}</span>
    </div>
  </div>`;
}

export function wireChart(root, points, players) {
  const svg = root.querySelector('.chart-wrap svg');
  if (!svg || points.length < 2) return;
  const crosshair = svg.querySelector('.crosshair');
  const hit = svg.querySelector('.hit');
  const tip = root.querySelector('.chart-tooltip');

  hit.addEventListener('pointermove', (e) => {
    const rect = svg.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const step = (W - P.l - P.r) / (points.length - 1);
    const i = Math.max(0, Math.min(points.length - 1, Math.round((fx - P.l) / step)));
    const x = xAt(i, points.length);

    crosshair.setAttribute('x1', x);
    crosshair.setAttribute('x2', x);
    crosshair.classList.remove('hidden');

    tip.replaceChildren();
    const date = document.createElement('div');
    date.className = 'tip-date';
    date.textContent = points[i].date;
    tip.appendChild(date);
    players.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'tip-row';
      const key = document.createElement('span');
      key.className = `line-key ${idx === 0 ? 'p1' : 'p2'}`;
      const value = document.createElement('strong');
      value.textContent = points[i].avgPerHole[p.id].toFixed(2);
      const name = document.createElement('span');
      name.textContent = p.name;
      row.append(key, value, name);
      tip.appendChild(row);
    });
    tip.classList.remove('hidden');
    tip.style.left = `${(x / W) * 100}%`;
  });

  hit.addEventListener('pointerleave', () => {
    crosshair.classList.add('hidden');
    tip.classList.add('hidden');
  });
}
```

- [ ] **Step 4: Replace `js/views/stats.js`**

```js
import { countScore, bestGame, worstGame, overallTally, currentStreak, longestStreak, biggestMargin, averagePerHole, averagePerGame, timeline, timesPlayed, courseBest, courseLeader } from '../stats.js';
import { esc, CROWN, fmt1, fmtDate, courseName } from './helpers.js';
import { renderChart, wireChart } from './chart.js';

const tile = (label, value, sub = '') => `<div class="tile">
  <div class="tile-label">${label}</div>
  <div class="tile-value">${value}</div>
  ${sub ? `<div class="tile-sub">${sub}</div>` : ''}
</div>`;

export function renderStats(state) {
  const { config, courses, games } = state;
  if (games.length === 0) {
    return '<p class="empty">No stats yet — go play some minigolf first! ⛳</p>';
  }

  const [p1, p2] = config.players;
  const ids = [p1.id, p2.id];
  const { wins, ties } = overallTally(games, ids);
  const margin = biggestMargin(games);

  const highlightCol = (p, cls) => {
    const best = bestGame(games, p.id);
    const worst = worstGame(games, p.id);
    return `<div class="stat-col ${cls}">
      <h4>${esc(p.name)}</h4>
      ${tile('Hole-in-ones 🎯', countScore(games, p.id, 1))}
      ${tile(`Sevens 💀`, countScore(games, p.id, config.maxScore))}
      ${tile('Best game', best.total, esc(courseName(courses, best.game.courseId)))}
      ${tile('Worst game', worst.total, esc(courseName(courses, worst.game.courseId)))}
    </div>`;
  };

  const h2hCol = (p, cls) => `<div class="stat-col ${cls}">
    <h4>${esc(p.name)}</h4>
    ${tile('Wins', wins[p.id])}
    ${tile('Current streak', currentStreak(games, p.id))}
    ${tile('Longest streak', longestStreak(games, p.id))}
  </div>`;

  const avgCol = (p, cls) => `<div class="stat-col ${cls}">
    <h4>${esc(p.name)}</h4>
    ${tile('Avg per hole', fmt1(averagePerHole(games, p.id)))}
    ${tile('Avg per game', fmt1(averagePerGame(games, p.id)))}
  </div>`;

  const records = [...courses]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((c) => timesPlayed(games, c.id) > 0)
    .map((c) => {
      const b1 = courseBest(games, c.id, p1.id);
      const b2 = courseBest(games, c.id, p2.id);
      const leaderId = courseLeader(games, c.id, ids);
      const leader = config.players.find((p) => p.id === leaderId);
      return `<tr>
        <td>${esc(c.name)}</td>
        <td>${b1 ? b1.total : '–'}</td>
        <td>${b2 ? b2.total : '–'}</td>
        <td>${leader ? `${CROWN} ${esc(leader.name)}` : '🤝'}</td>
      </tr>`;
    })
    .join('');

  return `
  <h2 class="page-title">Stats</h2>
  <section class="card">
    <h3>Highlights</h3>
    <div class="stat-cols">${highlightCol(p1, 'p1')}${highlightCol(p2, 'p2')}</div>
  </section>
  <section class="card">
    <h3>Head to head</h3>
    <div class="stat-cols">${h2hCol(p1, 'p1')}${h2hCol(p2, 'p2')}</div>
    ${tile('Ties', ties)}
    ${margin ? tile('Biggest win', `+${margin.margin}`, `${esc(config.players.find((p) => p.id === margin.winnerId).name)} · ${esc(courseName(courses, margin.game.courseId))} · ${fmtDate(margin.game.date)}`) : ''}
  </section>
  <section class="card">
    <h3>Averages &amp; trend</h3>
    <div class="stat-cols">${avgCol(p1, 'p1')}${avgCol(p2, 'p2')}</div>
    ${renderChart(timeline(games, ids), config.players)}
  </section>
  <section class="card">
    <h3>Course records</h3>
    <table class="records">
      <thead><tr><th>Course</th><th>${esc(p1.name)} best</th><th>${esc(p2.name)} best</th><th>Owner</th></tr></thead>
      <tbody>${records}</tbody>
    </table>
  </section>`;
}

export function wireStats(root, state) {
  const ids = state.config.players.map((p) => p.id);
  wireChart(root, timeline(state.games, ids), state.config.players);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 49 tests total.

- [ ] **Step 6: Manual check**

Reuse the Task 8 temporary sample data (add a second sample game with a different date to `data/games.json` so the chart has two points — copy the first game, change `id` to `2026-07-13-blankenberge-1`, `date` to `2026-07-13`, and vary a few scores). Open `#/stats`: four sections render, chart shows two colored lines with end dots, hovering shows the crosshair and tooltip with both values. Restore afterwards:

```bash
git checkout -- data/courses.json data/games.json
```

- [ ] **Step 7: Commit**

```bash
git add js/views/stats.js js/views/chart.js test/stats-view.test.js
git commit -m "feat: stats page with highlights, head-to-head, averages, chart and course records"
```

---

### Task 10: Add-game form with GitHub save

**Files:**
- Modify: `js/views/new.js` (replace stub)
- Create: `test/new-view.test.js`

**Interfaces:**
- Consumes: `saveGame`, `getToken`, `setToken`, `clearToken` from `js/github.js`; helpers; `onSaved(result, courseId)` callback from `js/app.js` (Task 6).
- Produces from `js/views/new.js`:
  - `mountNew(container, state, { onSaved })` — renders the form into `container` and wires all events.
  - Pure helpers (exported for tests): `slugify(name)`, `uniqueCourseId(courses, name)`, `buildGameId(games, date, courseId)`, `blankDraft(playerIds)`, `resizeScores(draft, playerIds, holes)`, `draftComplete(draft, playerIds, holes)`.
- Draft persistence: localStorage key `minigolf.draft`, updated on every change, cleared on successful save.

- [ ] **Step 1: Write the failing tests `test/new-view.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueCourseId, buildGameId, blankDraft, resizeScores, draftComplete } from '../js/views/new.js';
import { courses, games } from './fixtures.js';

const ids = ['robbe', 'saar'];

test('slugify makes clean ids', () => {
  assert.equal(slugify('Minigolf Blankenberge!'), 'minigolf-blankenberge');
  assert.equal(slugify('  De Putt---Club  '), 'de-putt-club');
});

test('uniqueCourseId avoids collisions', () => {
  assert.equal(uniqueCourseId(courses, 'New Place'), 'new-place');
  assert.equal(uniqueCourseId(courses, 'Golf Boom'), 'golf-boom'); // slug differs from existing id 'boom'
  assert.equal(uniqueCourseId([{ id: 'x' }, { id: 'x-2' }], 'X'), 'x-3');
});

test('buildGameId numbers same-day games on the same course', () => {
  assert.equal(buildGameId(games, '2026-08-01', 'boom'), '2026-08-01-boom-1');
  assert.equal(buildGameId(games, '2026-01-10', 'boom'), '2026-01-10-boom-2');
});

test('blankDraft starts empty with today prefilled', () => {
  const d = blankDraft(ids);
  assert.equal(d.courseId, '');
  assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(d.scores, { robbe: [], saar: [] });
});

test('resizeScores pads and trims to the course hole count', () => {
  const d = blankDraft(ids);
  d.scores.robbe = [1, 2, 3, 4];
  resizeScores(d, ids, 2);
  assert.deepEqual(d.scores.robbe, [1, 2]);
  assert.deepEqual(d.scores.saar, [null, null]);
});

test('draftComplete requires a score on every hole for both players', () => {
  const d = blankDraft(ids);
  d.scores = { robbe: [1, 2], saar: [3, null] };
  assert.equal(draftComplete(d, ids, 2), false);
  d.scores.saar[1] = 4;
  assert.equal(draftComplete(d, ids, 2), true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — helpers not exported from the stub.

- [ ] **Step 3: Replace `js/views/new.js`**

```js
import { esc } from './helpers.js';
import { getToken, setToken, clearToken, saveGame } from '../github.js';

const DRAFT_KEY = 'minigolf.draft';

/* ─── Pure helpers (unit tested) ─────────────────────────── */

export function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function uniqueCourseId(courses, name) {
  const base = slugify(name) || 'course';
  let id = base;
  let n = 2;
  while (courses.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
}

export function buildGameId(games, date, courseId) {
  const n = games.filter((g) => g.date === date && g.courseId === courseId).length + 1;
  return `${date}-${courseId}-${n}`;
}

export function blankDraft(playerIds) {
  return {
    courseId: '',
    newCourse: { name: '', location: '', holes: 18 },
    date: new Date().toISOString().slice(0, 10),
    scores: Object.fromEntries(playerIds.map((id) => [id, []])),
    note: '',
  };
}

export function resizeScores(draft, playerIds, holes) {
  for (const id of playerIds) {
    const s = draft.scores[id] ?? [];
    draft.scores[id] = Array.from({ length: holes }, (_, i) => s[i] ?? null);
  }
}

export function draftComplete(draft, playerIds, holes) {
  return playerIds.every((id) => {
    const s = draft.scores[id] ?? [];
    if (s.length < holes) return false;
    return s.slice(0, holes).every((v) => Number.isInteger(v));
  });
}

/* ─── Draft persistence ──────────────────────────────────── */

function loadDraft(playerIds) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return { ...blankDraft(playerIds), ...JSON.parse(raw) };
  } catch { /* corrupt draft: start fresh */ }
  return blankDraft(playerIds);
}

const persistDraft = (draft) => localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
const clearDraft = () => localStorage.removeItem(DRAFT_KEY);

/* ─── View ───────────────────────────────────────────────── */

function selectedHoles(draft, courses) {
  if (draft.courseId === 'new') return Math.max(1, Number(draft.newCourse.holes) || 0);
  const course = courses.find((c) => c.id === draft.courseId);
  return course ? course.holes : 0;
}

function renderForm(state, draft, ui) {
  const { config, courses } = state;
  const [p1, p2] = config.players;
  const holes = selectedHoles(draft, courses);
  const token = getToken();

  const tokenSection = token
    ? `<p class="token-note">🔐 Token saved on this device.
        <button type="button" class="linklike" data-action="forget-token">Forget it</button></p>`
    : `<div class="field">
        <label for="token-input">GitHub token (needed to save — see the README for how to create one)</label>
        <input id="token-input" type="password" autocomplete="off" placeholder="github_pat_…" />
        <p class="token-note">Stored only in this browser. Never leaves this device except to api.github.com.</p>
        <button type="button" data-action="save-token">Save token on this device</button>
      </div>`;

  const courseOptions = [...courses]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${esc(c.id)}" ${draft.courseId === c.id ? 'selected' : ''}>${esc(c.name)} (${c.holes} holes)</option>`)
    .join('');

  const newCourseFields = draft.courseId === 'new'
    ? `<div class="field"><label for="nc-name">Course name</label>
         <input id="nc-name" data-draft="newCourse.name" value="${esc(draft.newCourse.name)}" /></div>
       <div class="field"><label for="nc-loc">Location</label>
         <input id="nc-loc" data-draft="newCourse.location" value="${esc(draft.newCourse.location)}" /></div>
       <div class="field"><label for="nc-holes">Number of holes</label>
         <input id="nc-holes" type="number" min="1" max="36" data-draft="newCourse.holes" value="${esc(draft.newCourse.holes)}" /></div>`
    : '';

  const scoreLine = (p, cls, hole) => {
    const current = draft.scores[p.id]?.[hole];
    const buttons = Array.from({ length: config.maxScore }, (_, s) => s + 1)
      .map((s) => `<button type="button" class="score-btn ${current === s ? 'selected' : ''}"
          data-p="${p.id}" data-h="${hole}" data-s="${s}">${s}</button>`)
      .join('');
    return `<div class="score-line ${cls}"><span class="score-name">${esc(p.name)}</span>${buttons}</div>`;
  };

  const grid = holes === 0 ? '' : `
    <div class="running-totals">
      <span class="p1">${esc(p1.name)}: ${(draft.scores[p1.id] ?? []).reduce((a, b) => a + (b ?? 0), 0)}</span>
      <span class="p2">${esc(p2.name)}: ${(draft.scores[p2.id] ?? []).reduce((a, b) => a + (b ?? 0), 0)}</span>
    </div>
    ${Array.from({ length: holes }, (_, h) => `
      <div class="hole-row">
        <h5>Hole ${h + 1}</h5>
        ${scoreLine(p1, 'p1', h)}
        ${scoreLine(p2, 'p2', h)}
      </div>`).join('')}`;

  return `
  <h2 class="page-title">Add a game</h2>
  <section class="card">
    ${tokenSection}
    <div class="field">
      <label for="course-select">Course</label>
      <select id="course-select">
        <option value="" ${draft.courseId === '' ? 'selected' : ''} disabled>Pick a course…</option>
        ${courseOptions}
        <option value="new" ${draft.courseId === 'new' ? 'selected' : ''}>➕ New course…</option>
      </select>
    </div>
    ${newCourseFields}
    <div class="field">
      <label for="date-input">Date</label>
      <input id="date-input" type="date" data-draft="date" value="${esc(draft.date)}" />
    </div>
    ${grid}
    <div class="field">
      <label for="note-input">Note (optional)</label>
      <input id="note-input" data-draft="note" value="${esc(draft.note)}" placeholder="e.g. holiday at the coast" />
    </div>
    <div class="save-row">
      <button type="button" data-action="save-game" ${ui.saving ? 'disabled' : ''}>
        ${ui.saving ? 'Saving…' : 'Save game'}
      </button>
      ${ui.error ? `<span class="form-error">${esc(ui.error)}</span>` : ''}
    </div>
  </section>`;
}

export function mountNew(container, state, { onSaved }) {
  const playerIds = state.config.players.map((p) => p.id);
  const draft = loadDraft(playerIds);
  const ui = { saving: false, error: '' };

  const rerender = () => {
    container.innerHTML = renderForm(state, draft, ui);
  };

  const setPath = (path, value) => {
    const keys = path.split('.');
    let obj = draft;
    while (keys.length > 1) obj = obj[keys.shift()];
    obj[keys[0]] = value;
  };

  container.onclick = async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.dataset.s) {
      draft.scores[btn.dataset.p][Number(btn.dataset.h)] = Number(btn.dataset.s);
      persistDraft(draft);
      rerender();
    } else if (btn.dataset.action === 'save-token') {
      const input = container.querySelector('#token-input');
      if (input.value.trim()) setToken(input.value);
      rerender();
    } else if (btn.dataset.action === 'forget-token') {
      clearToken();
      rerender();
    } else if (btn.dataset.action === 'save-game') {
      await save();
    }
  };

  container.onchange = (e) => {
    if (e.target.id === 'course-select') {
      draft.courseId = e.target.value;
      resizeScores(draft, playerIds, selectedHoles(draft, state.courses));
      persistDraft(draft);
      rerender();
    } else if (e.target.id === 'nc-holes') {
      setPath('newCourse.holes', e.target.value);
      resizeScores(draft, playerIds, selectedHoles(draft, state.courses));
      persistDraft(draft);
      rerender();
    }
  };

  container.oninput = (e) => {
    const path = e.target.dataset.draft;
    if (!path || e.target.id === 'nc-holes') return;
    setPath(path, e.target.value);
    persistDraft(draft);
  };

  async function save() {
    ui.error = '';
    const isNew = draft.courseId === 'new';
    const holes = selectedHoles(draft, state.courses);

    if (!getToken()) ui.error = 'Save the GitHub token first.';
    else if (!draft.courseId) ui.error = 'Pick a course.';
    else if (isNew && !draft.newCourse.name.trim()) ui.error = 'Give the new course a name.';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) ui.error = 'Pick a date.';
    else if (!draftComplete(draft, playerIds, holes)) ui.error = 'Every hole needs a score for both players.';

    if (ui.error) {
      rerender();
      return;
    }

    const newCourse = isNew
      ? {
          id: uniqueCourseId(state.courses, draft.newCourse.name),
          name: draft.newCourse.name.trim(),
          location: draft.newCourse.location.trim(),
          holes,
        }
      : null;
    const courseId = isNew ? newCourse.id : draft.courseId;

    const game = {
      id: buildGameId(state.games, draft.date, courseId),
      courseId,
      date: draft.date,
      scores: Object.fromEntries(playerIds.map((id) => [id, draft.scores[id].slice(0, holes)])),
    };
    if (draft.note.trim()) game.note = draft.note.trim();

    ui.saving = true;
    rerender();
    try {
      const result = await saveGame({ repo: state.config.repo, token: getToken(), game, newCourse });
      clearDraft();
      onSaved(result, courseId);
    } catch (err) {
      ui.saving = false;
      ui.error = err.message;
      rerender();
    }
  }

  rerender();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 55 tests total.

- [ ] **Step 5: Manual check of the form (no real save)**

With the local server running, open `#/new`:
- Token field shows with the "stored only in this browser" note; enter `test`, save — it flips to "Token saved on this device / Forget it". Click Forget.
- Pick "➕ New course…", enter name/location/holes 3 — three hole rows appear.
- Tap score buttons: they highlight in player colors and the sticky running totals update.
- Reload the page: the draft (course fields + tapped scores) survives.
- Press "Save game" without a token: error "Save the GitHub token first."
- Clear the draft when done: in DevTools console run `localStorage.removeItem('minigolf.draft')`.

- [ ] **Step 6: Commit**

```bash
git add js/views/new.js test/new-view.test.js
git commit -m "feat: add-game form with score buttons, drafts and GitHub save"
```

---

### Task 11: README, publish & GitHub Pages

**Files:**
- Create: `README.md`
- Modify: `data/config.json` (real repo slug)

**Interfaces:**
- Consumes: everything — this task ships it.

- [ ] **Step 1: Confirm the GitHub account** *(user checkpoint)*

Ask the user which GitHub account should own the repo (`gh auth status` shows who is logged in — note the work account `robbeadriaens-tomtom` may not be right for a personal project). Do not proceed until confirmed.

- [ ] **Step 2: Write `README.md`**

```markdown
# ⛳ Minigolf Forever

Robbe & Saar's eternal minigolf rivalry tracker — a zero-build static site on GitHub Pages.

## How it works

- `data/config.json` — players and settings · `data/courses.json` — courses · `data/games.json` — every game with per-hole scores.
- All stats are computed in the browser from raw scores; nothing derived is stored.
- The **Add game** page commits new scores to this repo through the GitHub API. GitHub Pages then redeploys automatically (~1 minute).

## Local development

```
npx http-server -p 8123 -c-1     # serve the repo root
npm test                          # run unit tests (Node 20+)
```

## One-time setup per device (to save games)

The Add game page needs a GitHub token. It is stored **only in your browser's localStorage** and sent **only to api.github.com** — it is never committed or published.

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. Token name: `minigolf-forever`. Expiration: 1 year (set a reminder!).
3. **Repository access → Only select repositories →** this repo.
4. **Permissions → Repository permissions → Contents → Read and write.** Nothing else.
5. Generate, copy the `github_pat_…` value, open the site's **Add game** page and paste it there.

If a device is lost: revoke the token at <https://github.com/settings/personal-access-tokens> — done.

## Deployment

Served by GitHub Pages from the `main` branch root. Repo → Settings → Pages → Deploy from branch → `main` / `(root)`.
```

- [ ] **Step 3: Rename the branch and create the GitHub repo**

```bash
git branch -m master main
gh repo create Minigolf-forever --public --source=. --remote=origin --push
```

Expected: repo created and pushed. If `gh` is not authenticated, ask the user to run `! gh auth login`.

- [ ] **Step 4: Set the real repo slug in `data/config.json`**

Get the slug: `gh repo view --json nameWithOwner -q .nameWithOwner`
Edit `data/config.json`: replace `"OWNER/Minigolf-forever"` with the actual value.

```bash
git add README.md data/config.json
git commit -m "docs: README with token guide; set real repo slug"
git push
```

- [ ] **Step 5: Enable GitHub Pages**

```bash
gh api -X POST "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pages" -f build_type=legacy -f "source[branch]=main" -f "source[path]=/"
```

Expected: JSON response including `"html_url"`. (If Pages was already enabled, this returns 409 — fine.)

- [ ] **Step 6: Verify the live site**

Run: `gh api "repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pages" -q .html_url`
Open the URL (first deploy can take ~2 minutes). Expected: homescreen loads with "No games yet — go play! ⛳".

- [ ] **Step 7: End-to-end save test on the live site**

Ask the user to create their PAT per the README, paste it on **Add game**, and enter a real (or throwaway) game. Expected: save succeeds, the app jumps to the course page showing the game, and the repo has a new commit `Add game: …`. If they use a throwaway game, revert it afterwards with `git revert` or by editing `data/games.json` on github.com.

- [ ] **Step 8: Final full test run**

Run: `npm test`
Expected: PASS — 55 tests, 0 failures.
