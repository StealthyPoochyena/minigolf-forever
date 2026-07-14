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
