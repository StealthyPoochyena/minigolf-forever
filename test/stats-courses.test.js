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
