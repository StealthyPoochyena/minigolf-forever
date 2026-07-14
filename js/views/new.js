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
  if (!Number.isInteger(holes) || holes <= 0) return false;
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
