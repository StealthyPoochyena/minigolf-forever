# Course Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users rename a course (name + location) and delete a course that has no games, from the course detail page, committing via the GitHub Contents API like every other write.

**Architecture:** Two new functions in `js/github.js` built on the existing `saveWithRetry` read-modify-write helper (which gains support for computing the commit message from the fetched file). The course detail view renders an actions row and a hidden inline edit form; `wireCourse` wires the buttons and `js/app.js` supplies callbacks that update state and re-render.

**Tech Stack:** Vanilla ES modules, no build step, `node --test` for tests (mocked `fetchImpl`, no DOM in tests).

Spec: `docs/superpowers/specs/2026-07-15-course-edit-delete-design.md`

## Global Constraints

- `git pull` before starting — the live site commits data to `main` directly, so the checkout goes stale.
- The PAT lives only in localStorage and only ever appears in the `Authorization` header — never in file contents, URLs, or commit messages.
- Course `id` never changes on rename; hole count is not editable.
- A course can only be deleted when no games reference it.
- Run tests with: `npm test` (or a single file: `node --test test/github.test.js`).
- Commit messages: plain imperative, matching repo style (e.g. `Add course rename to GitHub layer`), each ending with the `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` trailer.

---

### Task 1: `updateCourse` in the GitHub layer

**Files:**
- Modify: `js/github.js` (add message-function support to `saveWithRetry` at line ~72, add `updateCourse` export)
- Test: `test/github.test.js`

**Interfaces:**
- Consumes: existing `saveWithRetry(repo, path, token, fetchImpl, apply, message)` and `fetchFile` internals of `js/github.js`.
- Produces: `updateCourse({ repo, token, courseId, name, location, fetchImpl = fetch })` → `Promise<{ courses: Course[] }>`; throws `Error(/no longer exists/)` if the id is gone, `Error(/Save conflict/)` after two 409s. Also: `saveWithRetry`'s `message` parameter now accepts `string | (fetchedContent) => string`.

- [ ] **Step 1: Write the failing tests**

Append to `test/github.test.js` (the file already defines `fakeGitHub`, `okRead`, `okWrite`, `conflict`, `b64`):

Replace the import line at the top of the file (adds `updateCourse` only; Task 2 adds `deleteCourse` — importing a not-yet-existing named export is a module-load error, so each task imports only what exists by its end):

```js
import { getToken, setToken, clearToken, saveGame, replaceGame, deleteGame, updateCourse } from '../js/github.js';
```

```js
const boomCourse = { id: 'boom', name: 'Golf Boom', location: 'Boom', holes: 3 };
const gentCourse = { id: 'gent', name: 'Putt Gent', location: 'Gent', holes: 2 };

test('updateCourse rewrites name and location, keeping id and holes', async () => {
  const gh = fakeGitHub([okRead({ courses: [boomCourse, gentCourse] }, 'cs'), okWrite()]);
  const result = await updateCourse({
    repo: 'o/r', token: 't', courseId: 'boom', name: 'Mega Golf Boom', location: 'Boom-Centrum', fetchImpl: gh.fetchImpl,
  });
  assert.deepEqual(result.courses, [
    { id: 'boom', name: 'Mega Golf Boom', location: 'Boom-Centrum', holes: 3 },
    gentCourse,
  ]);
  const put = gh.calls[1];
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, 'https://api.github.com/repos/o/r/contents/data/courses.json');
  assert.equal(put.body.message, 'Rename course: Golf Boom → Mega Golf Boom');
});

test('updateCourse with unchanged name commits as an edit, not a rename', async () => {
  const gh = fakeGitHub([okRead({ courses: [boomCourse] }, 'cs'), okWrite()]);
  await updateCourse({
    repo: 'o/r', token: 't', courseId: 'boom', name: 'Golf Boom', location: 'Boom-Zuid', fetchImpl: gh.fetchImpl,
  });
  assert.equal(gh.calls[1].body.message, 'Edit course: Golf Boom');
});

test('updateCourse with nothing changed makes no PUT', async () => {
  const gh = fakeGitHub([okRead({ courses: [boomCourse] }, 'cs')]);
  const result = await updateCourse({
    repo: 'o/r', token: 't', courseId: 'boom', name: 'Golf Boom', location: 'Boom', fetchImpl: gh.fetchImpl,
  });
  assert.deepEqual(result.courses, [boomCourse]);
  assert.equal(gh.calls.length, 1);
});

test('updateCourse rejects when the course vanished', async () => {
  const gh = fakeGitHub([okRead({ courses: [gentCourse] }, 'cs')]);
  await assert.rejects(
    updateCourse({ repo: 'o/r', token: 't', courseId: 'boom', name: 'X', location: 'Y', fetchImpl: gh.fetchImpl }),
    /no longer exists/,
  );
  assert.equal(gh.calls.length, 1, 'expected no PUT');
});

test('updateCourse retries once on conflict', async () => {
  const gh = fakeGitHub([
    okRead({ courses: [boomCourse] }, 'stale'),
    conflict(),
    okRead({ courses: [boomCourse, gentCourse] }, 'fresh'),
    okWrite(),
  ]);
  const result = await updateCourse({
    repo: 'o/r', token: 't', courseId: 'boom', name: 'New Boom', location: 'Boom', fetchImpl: gh.fetchImpl,
  });
  assert.equal(result.courses[0].name, 'New Boom');
  assert.equal(result.courses.length, 2);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/github.test.js`
Expected: the new tests FAIL — `updateCourse` is not exported (`SyntaxError: The requested module '../js/github.js' does not provide an export named 'updateCourse'`).

- [ ] **Step 3: Implement**

In `js/github.js`, change `saveWithRetry` so the commit message can be computed from the fetched content (the old course name lives on the server, not in the caller):

```js
async function saveWithRetry(repo, path, token, fetchImpl, apply, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, sha } = await fetchFile(repo, path, token, fetchImpl);
    const updated = apply(content);
    if (updated === content) return updated; // already applied (e.g. idempotent retry) — nothing to write
    const msg = typeof message === 'function' ? message(content) : message;
    const { conflict } = await putFile(repo, path, updated, sha, msg, token, fetchImpl);
    if (!conflict) return updated;
  }
  throw new Error('Save conflict: someone else just saved. Reload and try again.');
}
```

Add at the bottom of `js/github.js`:

```js
export async function updateCourse({ repo, token, courseId, name, location, fetchImpl = fetch }) {
  const updated = await saveWithRetry(
    repo, 'data/courses.json', token, fetchImpl,
    (data) => {
      const index = data.courses.findIndex((c) => c.id === courseId);
      if (index === -1) {
        throw new Error('That course no longer exists — someone may have deleted it. Reload and try again.');
      }
      const current = data.courses[index];
      if (current.name === name && current.location === location) return data;
      const courses = [...data.courses];
      courses[index] = { ...current, name, location };
      return { courses };
    },
    (data) => {
      const old = data.courses.find((c) => c.id === courseId);
      return old.name !== name ? `Rename course: ${old.name} → ${name}` : `Edit course: ${name}`;
    },
  );
  return { courses: updated.courses };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, including all pre-existing tests (the `saveWithRetry` change is backwards-compatible with string messages).

- [ ] **Step 5: Commit**

```bash
git add js/github.js test/github.test.js
git commit -m "Add course rename to GitHub layer"
```

---

### Task 2: `deleteCourse` in the GitHub layer

**Files:**
- Modify: `js/github.js` (add `deleteCourse` export)
- Test: `test/github.test.js`

**Interfaces:**
- Consumes: `saveWithRetry` and `fetchFile` from Task 1's version of `js/github.js`.
- Produces: `deleteCourse({ repo, token, courseId, fetchImpl = fetch })` → `Promise<{ courses: Course[] }>`; throws `Error(/still has games/)` if any game references the course (checked server-side first), idempotent no-PUT if the course is already gone.

- [ ] **Step 1: Write the failing tests**

Extend the import at the top of `test/github.test.js` with `deleteCourse`, then append (reuses `boomCourse`, `gentCourse`, and the `game` fixture already imported in the file):

```js
test('deleteCourse checks games first, then removes the course', async () => {
  const gh = fakeGitHub([
    okRead({ games: [game('2026-01-10-gent-1', 'gent', '2026-01-10', [1], [2])] }, 'gs'),
    okRead({ courses: [boomCourse, gentCourse] }, 'cs'),
    okWrite(),
  ]);
  const result = await deleteCourse({ repo: 'o/r', token: 't', courseId: 'boom', fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.courses, [gentCourse]);
  assert.match(gh.calls[0].url, /data\/games\.json$/);
  const put = gh.calls[2];
  assert.equal(put.url, 'https://api.github.com/repos/o/r/contents/data/courses.json');
  assert.equal(put.body.message, 'Delete course: Golf Boom');
});

test('deleteCourse refuses while games still reference the course', async () => {
  const gh = fakeGitHub([
    okRead({ games: [game('2026-01-10-boom-1', 'boom', '2026-01-10', [1], [2])] }, 'gs'),
  ]);
  await assert.rejects(
    deleteCourse({ repo: 'o/r', token: 't', courseId: 'boom', fetchImpl: gh.fetchImpl }),
    /still has games/,
  );
  assert.equal(gh.calls.length, 1, 'expected no touch of courses.json');
});

test('deleteCourse of an already-deleted course succeeds without a PUT', async () => {
  const gh = fakeGitHub([
    okRead({ games: [] }, 'gs'),
    okRead({ courses: [gentCourse] }, 'cs'),
  ]);
  const result = await deleteCourse({ repo: 'o/r', token: 't', courseId: 'boom', fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.courses, [gentCourse]);
  assert.equal(gh.calls.length, 2);
});

test('deleteCourse retries once on conflict', async () => {
  const gh = fakeGitHub([
    okRead({ games: [] }, 'gs'),
    okRead({ courses: [boomCourse, gentCourse] }, 'stale'),
    conflict(),
    okRead({ courses: [boomCourse, gentCourse] }, 'fresh'),
    okWrite(),
  ]);
  const result = await deleteCourse({ repo: 'o/r', token: 't', courseId: 'boom', fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.courses, [gentCourse]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/github.test.js`
Expected: FAIL — `deleteCourse` not exported.

- [ ] **Step 3: Implement**

Add at the bottom of `js/github.js`:

```js
export async function deleteCourse({ repo, token, courseId, fetchImpl = fetch }) {
  // Backstop against stale client state: check the server's games, not the UI's.
  const { content: gamesFile } = await fetchFile(repo, 'data/games.json', token, fetchImpl);
  if (gamesFile.games.some((g) => g.courseId === courseId)) {
    throw new Error('This course still has games — delete those first.');
  }
  const updated = await saveWithRetry(
    repo, 'data/courses.json', token, fetchImpl,
    (data) => (data.courses.some((c) => c.id === courseId)
      ? { courses: data.courses.filter((c) => c.id !== courseId) }
      : data),
    (data) => `Delete course: ${data.courses.find((c) => c.id === courseId).name}`,
  );
  return { courses: updated.courses };
}
```

(The message function only runs when a PUT happens, and a PUT only happens when the course is present, so the `.name` access is safe.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/github.js test/github.test.js
git commit -m "Add course delete to GitHub layer"
```

---

### Task 3: Course page markup — actions row and inline edit form

**Files:**
- Modify: `js/views/course.js` (`renderCourse`, line ~61)
- Test: `test/courses.test.js`

**Interfaces:**
- Consumes: `esc` from `js/views/helpers.js` (already imported).
- Produces: HTML containing `data-action="edit-course"`, `data-action="delete-course"`, a `[data-course-edit]` container (hidden by default) with inputs `#ce-name`, `#ce-loc`, buttons `data-action="save-course"` / `data-action="cancel-edit-course"`, and a `.form-error[hidden]` span. Task 4's `wireCourse` targets exactly these hooks.

- [ ] **Step 1: Write the failing tests**

Append to `test/courses.test.js`:

```js
test('course page offers course edit and delete actions', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /data-action="edit-course"/);
  assert.match(html, /data-action="delete-course"/);
});

test('course edit form is hidden and pre-filled with name and location', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /<div class="card course-edit" hidden data-course-edit>/);
  assert.match(html, /id="ce-name" value="Golf Boom"/);
  assert.match(html, /id="ce-loc" value="Boom"/);
  assert.match(html, /3 holes — hole count can’t be changed/);
  assert.match(html, /data-action="save-course"/);
  assert.match(html, /data-action="cancel-edit-course"/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/courses.test.js`
Expected: the two new tests FAIL (no such markup yet).

- [ ] **Step 3: Implement**

In `js/views/course.js`, replace the return statement of `renderCourse`:

```js
  return `<h2 class="page-title">${esc(course.name)}</h2>
    <p class="page-sub">${esc(course.location)} · ${course.holes} holes · ${list.length} game${list.length === 1 ? '' : 's'}</p>
    <div class="course-actions">
      <button type="button" class="linklike" data-action="edit-course">✏️ Edit course</button>
      <button type="button" class="linklike danger" data-action="delete-course">🗑️ Delete course</button>
    </div>
    <div class="card course-edit" hidden data-course-edit>
      <div class="field"><label for="ce-name">Course name</label>
        <input id="ce-name" value="${esc(course.name)}" /></div>
      <div class="field"><label for="ce-loc">Location</label>
        <input id="ce-loc" value="${esc(course.location)}" /></div>
      <p class="token-note">${course.holes} holes — hole count can’t be changed.</p>
      <div class="save-row">
        <button type="button" data-action="save-course">Save</button>
        <button type="button" class="linklike cancel-link" data-action="cancel-edit-course">Cancel</button>
        <span class="form-error" hidden></span>
      </div>
    </div>
    ${items || '<p class="empty">No games here yet.</p>'}`;
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add js/views/course.js test/courses.test.js
git commit -m "Add course edit form and action buttons to course page"
```

---

### Task 4: Wiring, app callbacks, and CSS

**Files:**
- Modify: `js/views/course.js` (`wireCourse`, line ~66)
- Modify: `js/app.js` (lines 22–31 callbacks, line 41 `wireCourse` call)
- Modify: `css/style.css` (after `.game-actions` rules, line ~279)

**Interfaces:**
- Consumes: `updateCourse` / `deleteCourse` from `js/github.js` (Tasks 1–2); markup hooks from Task 3; existing `getToken`, `deleteGame`.
- Produces: `wireCourse(root, state, { onDeleted, onCourseSaved, onCourseDeleted })` — `onCourseSaved({ courses })` re-renders in place, `onCourseDeleted({ courses })` navigates to `#/courses`.

- [ ] **Step 1: Extend `wireCourse`**

In `js/views/course.js`, change the imports and `wireCourse`:

```js
import { getToken, deleteGame, updateCourse, deleteCourse } from '../github.js';
```

```js
export function wireCourse(root, state, { onDeleted, onCourseSaved, onCourseDeleted }) {
  const courseId = location.hash.replace(/^#\/?/, '').split('/')[1];
  const course = state.courses.find((c) => c.id === courseId);
  const editPanel = root.querySelector('[data-course-edit]');
  const needToken = () => {
    if (getToken()) return false;
    alert('This needs the GitHub token — open the Add page once to set it.');
    return true;
  };

  root.querySelector('[data-action="edit-course"]')?.addEventListener('click', () => {
    if (needToken()) return;
    editPanel.hidden = !editPanel.hidden;
  });

  root.querySelector('[data-action="cancel-edit-course"]')?.addEventListener('click', () => {
    editPanel.hidden = true;
    editPanel.querySelector('#ce-name').value = course.name;
    editPanel.querySelector('#ce-loc').value = course.location;
  });

  root.querySelector('[data-action="save-course"]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const error = editPanel.querySelector('.form-error');
    const name = editPanel.querySelector('#ce-name').value.trim();
    const loc = editPanel.querySelector('#ce-loc').value.trim();
    if (!name || !loc) {
      error.textContent = 'Name and location are both needed.';
      error.hidden = false;
      return;
    }
    error.hidden = true;
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const result = await updateCourse({ repo: state.config.repo, token: getToken(), courseId: course.id, name, location: loc });
      onCourseSaved(result);
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Save';
      error.textContent = err.message;
      error.hidden = false;
    }
  });

  root.querySelector('[data-action="delete-course"]')?.addEventListener('click', async (e) => {
    if (needToken()) return;
    const n = state.games.filter((g) => g.courseId === course.id).length;
    if (n > 0) {
      alert(`This course has ${n} game${n === 1 ? '' : 's'} — delete those first.`);
      return;
    }
    if (!confirm(`Delete the course "${course.name}"?`)) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const result = await deleteCourse({ repo: state.config.repo, token: getToken(), courseId: course.id });
      onCourseDeleted(result);
    } catch (err) {
      btn.disabled = false;
      alert(err.message);
    }
  });

  // …existing delete-game wiring stays unchanged below…
}
```

Keep the existing `delete-game` block exactly as it is (it also gets a token check already). Note: `renderCourse` returns early with "Course not found" for an unknown id — in that case the querySelectors all match nothing and the optional chaining makes wiring a no-op.

- [ ] **Step 2: Wire the callbacks in `js/app.js`**

Add next to `onDeleted`:

```js
function onCourseSaved({ courses }) {
  state.courses = courses;
  render();
}

function onCourseDeleted({ courses }) {
  state.courses = courses;
  location.hash = '#/courses';
}
```

And change the `wireCourse` call:

```js
    wireCourse(app, state, { onDeleted, onCourseSaved, onCourseDeleted });
```

(`location.hash` assignment fires `hashchange`, which re-renders — no explicit `render()` needed on delete.)

- [ ] **Step 3: Add CSS**

In `css/style.css`, after the `.game-actions` rules (line ~279):

```css
.course-actions { display: flex; gap: 22px; align-items: center; margin: -6px 0 18px; }
.course-actions .danger { color: var(--bad); font-weight: 600; }
.course-edit { padding: 20px; margin-bottom: 18px; }
```

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: PASS — all tests, no regressions.

- [ ] **Step 5: Manual smoke test**

Serve the site locally (`npx serve .` or any static server), open it, and check:
1. A course page shows "✏️ Edit course" / "🗑️ Delete course" under the subtitle.
2. Edit opens the form pre-filled; blank name shows the inline error; Cancel restores values and hides the form.
3. Deleting a course with games is blocked with the count message.
4. (Optional, against the real repo with the token set) rename a course → commit `Rename course: … → …` appears and the new name shows everywhere including old games' course link.

- [ ] **Step 6: Commit**

```bash
git add js/views/course.js js/app.js css/style.css
git commit -m "Wire course edit and delete on the course page"
```
