import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gameTotals, gameWinner, overallTally, totalStrokes, sortByDateDesc } from '../js/stats.js';
import { games } from './fixtures.js';

const ids = ['robbe', 'saar'];

test('gameTotals sums per-hole scores per player', () => {
  assert.deepEqual(gameTotals(games[0]), { robbe: 9, saar: 7 });
});

test('gameWinner returns lower total, or tie', () => {
  assert.equal(gameWinner(games[0]), 'saar');
  assert.equal(gameWinner(games[1]), 'robbe');
  assert.equal(gameWinner(games[2]), 'tie');
});

test('overallTally counts wins and ties', () => {
  assert.deepEqual(overallTally(games, ids), { wins: { robbe: 1, saar: 2 }, ties: 1 });
});

test('overallTally of no games is all zeroes', () => {
  assert.deepEqual(overallTally([], ids), { wins: { robbe: 0, saar: 0 }, ties: 0 });
});

test('totalStrokes sums across all games', () => {
  assert.deepEqual(totalStrokes(games, ids), { robbe: 25, saar: 28 });
});

test('sortByDateDesc sorts newest first without mutating input', () => {
  const input = [...games];
  const sorted = sortByDateDesc(input);
  assert.equal(sorted[0].id, '2026-04-09-gent-1');
  assert.equal(sorted[3].id, '2026-01-10-boom-1');
  assert.deepEqual(input, games);
});

test('sortByDateDesc breaks same-date ties by id desc', () => {
  const a = { id: '2026-05-01-x-1', date: '2026-05-01', courseId: 'x', scores: {} };
  const b = { id: '2026-05-01-x-2', date: '2026-05-01', courseId: 'x', scores: {} };
  assert.equal(sortByDateDesc([a, b])[0].id, '2026-05-01-x-2');
});
