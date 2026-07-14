# Edit & Delete Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add edit (full: scores/date/note/course) and delete (with confirm) for saved games, committing changes via the existing GitHub Contents API layer.

**Architecture:** Two new write functions in `js/github.js` reuse the existing `saveWithRetry` conflict machinery. The add-game form module (`js/views/new.js`) gains an edit mode behind a new `#/edit/<gameId>` route, pre-filled from the game and bypassing the localStorage draft. The course page gets per-game Edit links and Delete buttons wired by a new `wireCourse` function.

**Tech Stack:** unchanged — vanilla ES modules, no build step, `node --test` (58 tests currently passing; 69 expected after this plan).

**Spec:** `docs/superpowers/specs/2026-07-14-edit-delete-games-design.md`

## Global Constraints

- No build step, no npm dependencies. `npm test` = `node --test test/**/*.test.js`.
- Token only ever in the Authorization header to api.github.com — never in URLs, bodies, or committed files.
- Commit messages: `Edit game: <id>` / `Delete game: <id>`.
- Vanished-game error text exactly: `That game no longer exists — someone may have deleted it. Reload and try again.`
- Deleting an already-deleted game succeeds without a PUT (idempotent, via the existing same-reference skip in `saveWithRetry`).
- Edit keeps the game id when date AND course are unchanged; otherwise regenerates it with `buildGameId` against the games list excluding the edited game.
- Edit mode never reads or writes the `minigolf.draft` localStorage key.
- Escape all user-entered strings with `esc()`; never hardcode player names.
- Views stay importable in Node (no top-level browser globals; `confirm`/`alert`/`localStorage` only inside functions that run on user interaction in the browser).

---

### Task 1: `replaceGame` & `deleteGame` in the GitHub client

**Files:**
- Modify: `js/github.js` (refactor `saveGame`'s course block into a shared helper; append two functions)
- Test: `test/github.test.js` (append)

**Interfaces:**
- Consumes: existing private `saveWithRetry(repo, path, token, fetchImpl, apply, message)` (returns updated content; skips PUT when `apply` returns its input unchanged) and the existing test helpers `fakeGitHub`, `okRead`, `okWrite`, `conflict`, `game` already defined in `test/github.test.js`.
- Produces (exported from `js/github.js`, used by Tasks 2–3):
  - `replaceGame({ repo, token, gameId, game, newCourse = null, fetchImpl = fetch }) -> Promise<{ games, courses }>` — swaps the game with id `gameId` for `game` in place (order preserved); `courses` is the updated array when `newCourse` given, else `null`; rejects with the vanished-game error when `gameId` is absent.
  - `deleteGame({ repo, token, gameId, fetchImpl = fetch }) -> Promise<{ games }>` — removes the game; succeeds without a PUT when already absent.

- [ ] **Step 1: Append the failing tests to `test/github.test.js`**

Add `replaceGame, deleteGame` to the existing import from `../js/github.js`, then append:

```js
const existingA = game('2026-05-30-boom-1', 'boom', '2026-05-30', [1], [1]);
const existingB = game('2026-05-31-boom-1', 'boom', '2026-05-31', [2], [3]);

test('replaceGame swaps the game by id, preserving order', async () => {
  const edited = { ...existingA, scores: { robbe: [3], saar: [2] } };
  const gh = fakeGitHub([okRead({ games: [existingA, existingB] }, 's1'), okWrite()]);
  const result = await replaceGame({ repo: 'o/r', token: 't', gameId: existingA.id, game: edited, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [edited, existingB]);
  assert.equal(result.courses, null);
  const put = gh.calls[1];
  assert.equal(put.method, 'PUT');
  assert.match(put.body.message, /^Edit game: 2026-05-30-boom-1$/);
  const written = JSON.parse(Buffer.from(put.body.content, 'base64').toString());
  assert.deepEqual(written.games, [edited, existingB]);
});

test('replaceGame can change the game id in place', async () => {
  const moved = { ...existingA, id: '2026-06-02-gent-1', courseId: 'gent', date: '2026-06-02' };
  const gh = fakeGitHub([okRead({ games: [existingA, existingB] }, 's1'), okWrite()]);
  const result = await replaceGame({ repo: 'o/r', token: 't', gameId: existingA.id, game: moved, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [moved, existingB]);
});

test('replaceGame rejects when the game vanished', async () => {
  const gh = fakeGitHub([okRead({ games: [existingB] }, 's1')]);
  await assert.rejects(
    replaceGame({ repo: 'o/r', token: 't', gameId: 'gone', game: existingA, fetchImpl: gh.fetchImpl }),
    /no longer exists/,
  );
  assert.equal(gh.calls.length, 1);
});

test('replaceGame retries once on conflict', async () => {
  const edited = { ...existingA, note: 'fixed' };
  const gh = fakeGitHub([
    okRead({ games: [existingA] }, 'stale'),
    conflict(),
    okRead({ games: [existingA, existingB] }, 'fresh'),
    okWrite(),
  ]);
  const result = await replaceGame({ repo: 'o/r', token: 't', gameId: existingA.id, game: edited, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [edited, existingB]);
});

test('replaceGame with a new course updates courses.json first', async () => {
  const course = { id: 'brugge', name: 'Golf Brugge', location: 'Brugge', holes: 12 };
  const moved = { ...existingA, id: '2026-05-30-brugge-1', courseId: 'brugge' };
  const gh = fakeGitHub([
    okRead({ courses: [] }, 'cs'),
    okWrite(),
    okRead({ games: [existingA] }, 'gs'),
    okWrite(),
  ]);
  const result = await replaceGame({ repo: 'o/r', token: 't', gameId: existingA.id, game: moved, newCourse: course, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.courses, [course]);
  assert.deepEqual(result.games, [moved]);
  assert.match(gh.calls[0].url, /data\/courses\.json$/);
});

test('deleteGame removes the game and commits', async () => {
  const gh = fakeGitHub([okRead({ games: [existingA, existingB] }, 's1'), okWrite()]);
  const result = await deleteGame({ repo: 'o/r', token: 't', gameId: existingA.id, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [existingB]);
  assert.match(gh.calls[1].body.message, /^Delete game: 2026-05-30-boom-1$/);
});

test('deleteGame of an already-deleted game succeeds without a PUT', async () => {
  const gh = fakeGitHub([okRead({ games: [existingB] }, 's1')]);
  const result = await deleteGame({ repo: 'o/r', token: 't', gameId: 'gone', fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [existingB]);
  assert.equal(gh.calls.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `replaceGame`/`deleteGame` not exported. (58 existing tests still pass.)

- [ ] **Step 3: Implement in `js/github.js`**

Replace the existing `saveGame` (lines 83–99) with the refactored version plus the two new functions:

```js
async function addCourseIfMissing(repo, token, newCourse, fetchImpl) {
  const updated = await saveWithRetry(
    repo, 'data/courses.json', token, fetchImpl,
    (data) => (data.courses.some((c) => c.id === newCourse.id) ? data : { courses: [...data.courses, newCourse] }),
    `Add course: ${newCourse.name}`,
  );
  return updated.courses;
}

export async function saveGame({ repo, token, game, newCourse = null, fetchImpl = fetch }) {
  const courses = newCourse ? await addCourseIfMissing(repo, token, newCourse, fetchImpl) : null;
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => ({ games: [...data.games, game] }),
    `Add game: ${game.id}`,
  );
  return { games: updated.games, courses };
}

export async function replaceGame({ repo, token, gameId, game, newCourse = null, fetchImpl = fetch }) {
  const courses = newCourse ? await addCourseIfMissing(repo, token, newCourse, fetchImpl) : null;
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => {
      const index = data.games.findIndex((g) => g.id === gameId);
      if (index === -1) {
        throw new Error('That game no longer exists — someone may have deleted it. Reload and try again.');
      }
      const games = [...data.games];
      games[index] = game;
      return { games };
    },
    `Edit game: ${gameId}`,
  );
  return { games: updated.games, courses };
}

export async function deleteGame({ repo, token, gameId, fetchImpl = fetch }) {
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => (data.games.some((g) => g.id === gameId)
      ? { games: data.games.filter((g) => g.id !== gameId) }
      : data),
    `Delete game: ${gameId}`,
  );
  return { games: updated.games };
}
```

(The vanished-game throw happens inside `apply`, before any PUT, and propagates straight out of `saveWithRetry` — no retry, one GET, matching the test's call-count assertion.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 65 tests total, pristine output.

- [ ] **Step 5: Commit**

```bash
git add js/github.js test/github.test.js
git commit -m "feat: replaceGame and deleteGame with conflict retry and idempotent delete"
```

---

### Task 2: Edit mode in the form module + `#/edit` route

**Files:**
- Modify: `js/views/new.js`, `js/app.js`
- Test: `test/new-view.test.js` (append)

**Interfaces:**
- Consumes: `replaceGame` from Task 1; existing `buildGameId`, `saveGame`, `getToken`.
- Produces:
  - `mountNew(container, state, { onSaved, editGameId = null })` — unchanged behavior when `editGameId` is null; edit mode otherwise.
  - Pure helpers (exported for tests): `draftFromGame(game, playerIds)`, `editedGameId(games, original, date, courseId)`.
  - Route contract for Task 3's review context: `#/edit/<gameId>` mounts the form in edit mode; unknown id → `Game not found` message.

- [ ] **Step 1: Append the failing tests to `test/new-view.test.js`**

Add `draftFromGame, editedGameId` to the existing import from `../js/views/new.js`, and `games` to the existing fixtures import if not already imported. Then append:

```js
test('draftFromGame prefills a draft with copied scores', () => {
  const g = games[0]; // 2026-01-10-boom-1, robbe [2,3,4]
  const d = draftFromGame(g, ids);
  assert.equal(d.courseId, 'boom');
  assert.equal(d.date, '2026-01-10');
  assert.deepEqual(d.scores.robbe, [2, 3, 4]);
  assert.equal(d.note, '');
  d.scores.robbe[0] = 7;
  assert.equal(g.scores.robbe[0], 2); // deep copy — editing the draft must not mutate state
});

test('editedGameId keeps the id when date and course are unchanged', () => {
  assert.equal(editedGameId(games, games[0], '2026-01-10', 'boom'), '2026-01-10-boom-1');
});

test('editedGameId regenerates when date or course changes, excluding itself', () => {
  // 2026-02-01-boom-1 already exists in fixtures, so a move onto that date numbers -2
  assert.equal(editedGameId(games, games[0], '2026-02-01', 'boom'), '2026-02-01-boom-2');
  assert.equal(editedGameId(games, games[0], '2026-01-10', 'gent'), '2026-01-10-gent-1');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `draftFromGame`/`editedGameId` not exported.

- [ ] **Step 3: Implement in `js/views/new.js`**

3a. Change the github.js import (line 2) to:

```js
import { getToken, setToken, clearToken, saveGame, replaceGame } from '../github.js';
```

3b. After `blankDraft` (below line 33), add the two helpers:

```js
export function draftFromGame(game, playerIds) {
  return {
    courseId: game.courseId,
    newCourse: { name: '', location: '', holes: 18 },
    date: game.date,
    scores: Object.fromEntries(playerIds.map((id) => [id, [...(game.scores[id] ?? [])]])),
    note: game.note ?? '',
  };
}

export function editedGameId(games, original, date, courseId) {
  if (original.date === date && original.courseId === courseId) return original.id;
  return buildGameId(games.filter((g) => g.id !== original.id), date, courseId);
}
```

3c. In `renderForm`, replace the heading line (`<h2 class="page-title">Add a game</h2>`) with:

```js
  <h2 class="page-title">${ui.editing ? 'Edit game' : 'Add a game'}</h2>
```

3d. In `renderForm`, replace the `.save-row` block with:

```js
    <div class="save-row">
      <button type="button" data-action="save-game" ${ui.saving ? 'disabled' : ''}>
        ${ui.saving ? 'Saving…' : ui.editing ? 'Save changes' : 'Save game'}
      </button>
      ${ui.editing ? `<a class="cancel-link" href="#/courses/${esc(ui.editing.courseId)}">Cancel</a>` : ''}
      ${ui.error ? `<span class="form-error">${esc(ui.error)}</span>` : ''}
    </div>
```

3e. Replace the whole `mountNew` function with:

```js
export function mountNew(container, state, { onSaved, editGameId = null }) {
  const playerIds = state.config.players.map((p) => p.id);
  const editing = editGameId ? state.games.find((g) => g.id === editGameId) : null;
  if (editGameId && !editing) {
    container.innerHTML = '<p class="empty">Game not found. 🕳️</p>';
    return;
  }
  const draft = editing ? draftFromGame(editing, playerIds) : loadDraft(playerIds);
  const ui = { saving: false, error: '', editing };

  // Edit mode never touches the add-game draft in localStorage.
  const persist = () => {
    if (!editing) persistDraft(draft);
  };

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
      persist();
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
      persist();
      rerender();
    } else if (e.target.id === 'nc-holes') {
      setPath('newCourse.holes', e.target.value);
      resizeScores(draft, playerIds, selectedHoles(draft, state.courses));
      persist();
      rerender();
    }
  };

  container.oninput = (e) => {
    const path = e.target.dataset.draft;
    if (!path || e.target.id === 'nc-holes') return;
    setPath(path, e.target.value);
    persist();
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
      id: editing
        ? editedGameId(state.games, editing, draft.date, courseId)
        : buildGameId(state.games, draft.date, courseId),
      courseId,
      date: draft.date,
      scores: Object.fromEntries(playerIds.map((id) => [id, draft.scores[id].slice(0, holes)])),
    };
    if (draft.note.trim()) game.note = draft.note.trim();

    ui.saving = true;
    rerender();
    try {
      const result = editing
        ? await replaceGame({ repo: state.config.repo, token: getToken(), gameId: editing.id, game, newCourse })
        : await saveGame({ repo: state.config.repo, token: getToken(), game, newCourse });
      if (!editing) clearDraft();
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

3f. In `js/app.js`, inside `render()`, add the edit route: after the `else if (page === 'new')` line's sibling chain, insert before the final `else`:

```js
  else if (page === 'edit' && param) mountNew(app, state, { onSaved, editGameId: param });
```

(No nav item matches `edit`, so no tab highlights — acceptable.)

3g. In `css/style.css`, after the `.save-row` rule, add:

```css
.cancel-link { color: var(--ink-soft); font-weight: 500; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 68 tests total.

- [ ] **Step 5: Commit**

```bash
git add js/views/new.js js/app.js css/style.css test/new-view.test.js
git commit -m "feat: edit mode for the game form behind #/edit route"
```

---

### Task 3: Edit/Delete actions on the course page

**Files:**
- Modify: `js/views/course.js`, `js/app.js`, `css/style.css`
- Test: `test/courses.test.js` (append)

**Interfaces:**
- Consumes: `deleteGame`, `getToken` from `js/github.js`; `gameTotals`, `fmtDate` already imported in `course.js`.
- Produces: `wireCourse(root, state, { onDeleted })` exported from `js/views/course.js`; `onDeleted({ games })` provided by `app.js` updates state and re-renders the current route.

- [ ] **Step 1: Append the failing test to `test/courses.test.js`**

```js
test('course page offers edit and delete per game', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /href="#\/edit\/2026-02-01-boom-1"/);
  assert.match(html, /data-action="delete-game" data-game-id="2026-01-10-boom-1"/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — no edit link in the rendered HTML.

- [ ] **Step 3: Implement**

3a. In `js/views/course.js`, add to the imports:

```js
import { getToken, deleteGame } from '../github.js';
```

3b. In `renderCourse`'s game template, insert a footer row after the note line (`${g.note ? … : ''}`), still inside `</details>`:

```js
        <div class="game-actions">
          <a href="#/edit/${esc(g.id)}">✏️ Edit</a>
          <button type="button" class="linklike danger" data-action="delete-game" data-game-id="${esc(g.id)}">🗑️ Delete</button>
        </div>
```

3c. Append to `js/views/course.js`:

```js
export function wireCourse(root, state, { onDeleted }) {
  root.querySelectorAll('[data-action="delete-game"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const game = state.games.find((g) => g.id === btn.dataset.gameId);
      if (!game) return;
      const [p1, p2] = state.config.players;
      const totals = gameTotals(game);
      if (!confirm(`Delete the game of ${fmtDate(game.date)} (${totals[p1.id]} – ${totals[p2.id]})?`)) return;
      if (!getToken()) {
        alert('Deleting needs the GitHub token — open the Add page once to set it.');
        return;
      }
      btn.disabled = true;
      try {
        const result = await deleteGame({ repo: state.config.repo, token: getToken(), gameId: game.id });
        onDeleted(result);
      } catch (err) {
        btn.disabled = false;
        alert(err.message);
      }
    });
  });
}
```

3d. In `js/app.js`: change the course.js import to `import { renderCourse, wireCourse } from './views/course.js';`, add next to `onSaved`:

```js
function onDeleted({ games }) {
  state.games = games;
  render();
}
```

and replace the whole `render()` with (this also clears stale form handlers when leaving `#/new`/`#/edit` — a deferred finding from the launch review):

```js
function render() {
  if (!state) return;
  app.onclick = app.onchange = app.oninput = null; // clear stale mountNew handlers
  const { page, param } = currentRoute();
  markActiveNav(page);
  if (page === 'home') app.innerHTML = renderHome(state);
  else if (page === 'courses' && param) {
    app.innerHTML = renderCourse(state, param);
    wireCourse(app, state, { onDeleted });
  } else if (page === 'courses') app.innerHTML = renderCourses(state);
  else if (page === 'stats') {
    app.innerHTML = renderStats(state);
    wireStats(app, state);
  } else if (page === 'new') mountNew(app, state, { onSaved });
  else if (page === 'edit' && param) mountNew(app, state, { onSaved, editGameId: param });
  else app.innerHTML = '<p class="empty">Page not found. 🕳️</p>';
  window.scrollTo(0, 0);
}
```

3e. In `css/style.css`, after the scorecard `.note` rule, add:

```css
.game-actions { display: flex; gap: 22px; align-items: center; padding: 0 20px 16px; }
.game-actions a { color: var(--felt); font-weight: 600; text-decoration: none; }
.game-actions .danger { color: var(--bad); font-weight: 600; }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — 69 tests total, pristine output.

- [ ] **Step 5: Commit**

```bash
git add js/views/course.js js/app.js css/style.css test/courses.test.js
git commit -m "feat: edit and delete actions on course page games"
```

---

### Task 4: Ship — visual verification & push

**Files:** none (verification + push only)

**Interfaces:** consumes everything above.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: PASS — 69 tests, pristine output.

- [ ] **Step 2: Visual verification (controller-level; requires headless Chrome)**

`git stash`-free approach used at launch: temporarily overwrite `data/courses.json`/`data/games.json` with sample data (two courses, three games), serve with `npx -y http-server -p 8123 -c-1`, screenshot with headless Chrome at `--window-size=500,950 --force-device-scale-factor=1` (headless enforces a 500px minimum width):
- course page: expanded game shows ✏️ Edit / 🗑️ Delete row
- `#/edit/<sample-id>`: heading "Edit game", pre-filled scores/date/course, "Save changes" + Cancel
- `#/edit/nonsense`: "Game not found."
Restore with `git checkout -- data/courses.json data/games.json`, kill the server.

- [ ] **Step 3: Push**

```bash
git pull --rebase && npm test && git push
```

(`git pull --rebase` first — the live site may have committed new games meanwhile.)

- [ ] **Step 4: Live smoke test** *(user)*

On the live site (after ~1 min deploy): edit the existing game (change one score), verify the totals update and an `Edit game: …` commit appears; optionally delete + confirm on a throwaway game.
