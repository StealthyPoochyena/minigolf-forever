import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderCourses } from '../js/views/courses.js';
import { renderCourse } from '../js/views/course.js';
import { config, courses, games } from './fixtures.js';

const state = { config, courses, games };

test('courses grid lists every course with play count and leader crown', () => {
  const html = renderCourses(state);
  assert.match(html, /Golf Boom/);
  assert.match(html, /Putt Gent/);
  assert.match(html, /2 games/);
  assert.match(html, /👑<\/span> Saar/); // gent leader
  assert.match(html, /href="#\/courses\/boom"/);
});

test('courses grid with no courses shows an empty state', () => {
  assert.match(renderCourses({ config, courses: [], games: [] }), /No courses yet/);
});

test('course page renders a scorecard per game, newest first', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /Golf Boom/);
  const first = html.indexOf('1 Feb 2026');
  const second = html.indexOf('10 Jan 2026');
  assert.ok(first !== -1 && second !== -1 && first < second, 'newest game first');
});

test('scorecard highlights aces, sevens and hole winners', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /td class="ace[^"]*">1</);
  assert.match(html, /td class="[^"]*max[^"]*">7</);
  assert.match(html, /hole-win/);
});

test('game header crowns the winner and marks ties', () => {
  const boom = renderCourse(state, 'boom');
  assert.match(boom, /👑<\/span> Saar/);
  const gent = renderCourse(state, 'gent');
  assert.match(gent, /🤝 Tie/);
});

test('unknown course shows a friendly message', () => {
  assert.match(renderCourse(state, 'nope'), /Course not found/);
});

test('course page offers edit and delete per game', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /href="#\/edit\/2026-02-01-boom-1"/);
  assert.match(html, /data-action="delete-game" data-game-id="2026-01-10-boom-1"/);
});

test('course page offers course edit and delete actions', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /data-action="edit-course"/);
  assert.match(html, /data-action="delete-course"/);
});

test('course edit form is hidden and pre-filled with name and location', () => {
  const html = renderCourse(state, 'boom');
  assert.match(html, /<div class="card course-edit" hidden data-course-edit>/);
  assert.match(html, /id="ce-name" value="Golf Boom"/);
  assert.match(html, /id="ce-loc" value="Boom"/);
  assert.match(html, /3 holes — hole count can’t be changed/);
  assert.match(html, /data-action="save-course"/);
  assert.match(html, /data-action="cancel-edit-course"/);
});
