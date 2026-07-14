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
