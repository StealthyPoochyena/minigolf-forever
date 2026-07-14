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
