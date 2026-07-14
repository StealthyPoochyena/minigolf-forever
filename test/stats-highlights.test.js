import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countScore, bestGame, worstGame, currentStreak, longestStreak, biggestMargin } from '../js/stats.js';
import { games, game } from './fixtures.js';

test('countScore counts holes with an exact score', () => {
  assert.equal(countScore(games, 'robbe', 1), 1);
  assert.equal(countScore(games, 'saar', 1), 2);
  assert.equal(countScore(games, 'robbe', 7), 0);
  assert.equal(countScore(games, 'saar', 7), 1);
});

test('bestGame and worstGame find lowest and highest totals', () => {
  assert.equal(bestGame(games, 'robbe').total, 4);
  assert.equal(bestGame(games, 'robbe').game.id, '2026-04-09-gent-1');
  assert.equal(worstGame(games, 'robbe').total, 9);
  assert.equal(bestGame([], 'robbe'), null);
});

// winners in date order: saar, saar, robbe, saar, saar, saar
const streakGames = [
  game('s1', 'boom', '2026-05-01', [2], [1]),
  game('s2', 'boom', '2026-05-02', [2], [1]),
  game('s3', 'boom', '2026-05-03', [1], [2]),
  game('s4', 'boom', '2026-05-04', [2], [1]),
  game('s5', 'boom', '2026-05-05', [2], [1]),
  game('s6', 'boom', '2026-05-06', [2], [1]),
];

test('currentStreak counts wins from the most recent game backwards', () => {
  assert.equal(currentStreak(streakGames, 'saar'), 3);
  assert.equal(currentStreak(streakGames, 'robbe'), 0);
});

test('a tie breaks the current streak', () => {
  const withTie = [...streakGames, game('s7', 'boom', '2026-05-07', [1], [1])];
  assert.equal(currentStreak(withTie, 'saar'), 0);
});

test('longestStreak finds the longest run of wins', () => {
  assert.equal(longestStreak(streakGames, 'saar'), 3);
  assert.equal(longestStreak(streakGames, 'robbe'), 1);
});

test('biggestMargin finds the largest victory', () => {
  const m = biggestMargin(games);
  assert.equal(m.winnerId, 'robbe');
  assert.equal(m.margin, 6);
  assert.equal(m.game.id, '2026-02-01-boom-1');
  assert.equal(biggestMargin([]), null);
});
