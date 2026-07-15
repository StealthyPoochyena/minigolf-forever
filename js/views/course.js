import { sortByDateDesc, gameTotals, gameWinner, holeWinner } from '../stats.js';
import { esc, CROWN, fmtDate } from './helpers.js';
import { getToken, deleteGame, updateCourse, deleteCourse } from '../github.js';

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
        <div class="game-actions">
          <a href="#/edit/${esc(g.id)}">✏️ Edit</a>
          <button type="button" class="linklike danger" data-action="delete-game" data-game-id="${esc(g.id)}">🗑️ Delete</button>
        </div>
      </details>`;
    })
    .join('');

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
}

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

  root.querySelectorAll('[data-action="delete-game"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const game = state.games.find((g) => g.id === btn.dataset.gameId);
      if (!game) return;
      const [p1, p2] = state.config.players;
      const totals = gameTotals(game);
      if (!getToken()) {
        alert('Deleting needs the GitHub token — open the Add page once to set it.');
        return;
      }
      if (!confirm(`Delete the game of ${fmtDate(game.date)} (${totals[p1.id]} – ${totals[p2.id]})?`)) return;
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
