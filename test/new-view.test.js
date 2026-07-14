import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, uniqueCourseId, buildGameId, blankDraft, resizeScores, draftComplete, draftFromGame, editedGameId } from '../js/views/new.js';
import { courses, games } from './fixtures.js';

const ids = ['robbe', 'saar'];

test('slugify makes clean ids', () => {
  assert.equal(slugify('Minigolf Blankenberge!'), 'minigolf-blankenberge');
  assert.equal(slugify('  De Putt---Club  '), 'de-putt-club');
});

test('uniqueCourseId avoids collisions', () => {
  assert.equal(uniqueCourseId(courses, 'New Place'), 'new-place');
  assert.equal(uniqueCourseId(courses, 'Golf Boom'), 'golf-boom'); // slug differs from existing id 'boom'
  assert.equal(uniqueCourseId([{ id: 'x' }, { id: 'x-2' }], 'X'), 'x-3');
});

test('buildGameId numbers same-day games on the same course', () => {
  assert.equal(buildGameId(games, '2026-08-01', 'boom'), '2026-08-01-boom-1');
  assert.equal(buildGameId(games, '2026-01-10', 'boom'), '2026-01-10-boom-2');
});

test('blankDraft starts empty with today prefilled', () => {
  const d = blankDraft(ids);
  assert.equal(d.courseId, '');
  assert.match(d.date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(d.scores, { robbe: [], saar: [] });
});

test('resizeScores pads and trims to the course hole count', () => {
  const d = blankDraft(ids);
  d.scores.robbe = [1, 2, 3, 4];
  resizeScores(d, ids, 2);
  assert.deepEqual(d.scores.robbe, [1, 2]);
  assert.deepEqual(d.scores.saar, [null, null]);
});

test('draftComplete requires a score on every hole for both players', () => {
  const d = blankDraft(ids);
  d.scores = { robbe: [1, 2], saar: [3, null] };
  assert.equal(draftComplete(d, ids, 2), false);
  d.scores.saar[1] = 4;
  assert.equal(draftComplete(d, ids, 2), true);
});

test('draftComplete is false when holes is 0 or negative, even with filled scores', () => {
  const d = blankDraft(ids);
  d.scores = { robbe: [1, 2], saar: [3, 4] };
  assert.equal(draftComplete(d, ids, 0), false);
  assert.equal(draftComplete(d, ids, -1), false);
});

test('draftFromGame prefills a draft with copied scores', () => {
  const g = games[0]; // 2026-01-10-boom-1, robbe [2,3,4]
  const d = draftFromGame(g, ids);
  assert.equal(d.courseId, 'boom');
  assert.equal(d.date, '2026-01-10');
  assert.deepEqual(d.scores.robbe, [2, 3, 4]);
  assert.equal(d.note, '');
  d.scores.robbe[0] = 7;
  assert.equal(g.scores.robbe[0], 2); // deep copy — editing the draft must not mutate state
});

test('editedGameId keeps the id when date and course are unchanged', () => {
  assert.equal(editedGameId(games, games[0], '2026-01-10', 'boom'), '2026-01-10-boom-1');
});

test('editedGameId regenerates when date or course changes, excluding itself', () => {
  // 2026-02-01-boom-1 already exists in fixtures, so a move onto that date numbers -2
  assert.equal(editedGameId(games, games[0], '2026-02-01', 'boom'), '2026-02-01-boom-2');
  assert.equal(editedGameId(games, games[0], '2026-01-10', 'gent'), '2026-01-10-gent-1');
});
