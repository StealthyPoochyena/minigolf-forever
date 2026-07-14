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
