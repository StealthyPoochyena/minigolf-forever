import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../js/views/home.js';
import { config, courses, games } from './fixtures.js';

const state = { config, courses, games };

test('home shows both players and their win counts', () => {
  const html = renderHome(state);
  assert.match(html, /Robbe/);
  assert.match(html, /Saar/);
  assert.match(html, /<div class="win-count">1<\/div>/);
  assert.match(html, /<div class="win-count">2<\/div>/);
  assert.match(html, /1 tie/);
});

test('the leader panel gets the crown', () => {
  const html = renderHome(state);
  assert.match(html, /player-panel p2 leader/); // saar leads 2-1
  assert.ok(!html.includes('player-panel p1 leader'));
  assert.match(html, /class="crown"/);
});

test('a tied match-up crowns nobody', () => {
  const html = renderHome({ config, courses, games: [] });
  assert.ok(!html.includes('leader'));
  assert.ok(!html.includes('class="crown"'));
  assert.match(html, /No games yet/);
});

test('stroke line names who has fewer strokes', () => {
  const html = renderHome(state);
  assert.match(html, /Robbe has taken 3 fewer strokes/); // 25 vs 28
});

test('recent games list links to the course page', () => {
  const html = renderHome(state);
  assert.match(html, /href="#\/courses\/gent"/);
  assert.match(html, /Putt Gent/);
});
