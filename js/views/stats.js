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
