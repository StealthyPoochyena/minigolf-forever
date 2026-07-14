import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll } from '../js/data.js';
import { config, courses, games } from './fixtures.js';

const files = {
  'data/config.json': config,
  'data/courses.json': { courses },
  'data/games.json': { games },
};

function fakeFetch(url) {
  const path = url.split('?')[0];
  const body = files[path];
  return Promise.resolve({
    ok: body !== undefined,
    status: body === undefined ? 404 : 200,
    json: () => Promise.resolve(body),
  });
}

test('loadAll fetches and unwraps the three data files', async () => {
  const state = await loadAll(fakeFetch);
  assert.deepEqual(state.config, config);
  assert.deepEqual(state.courses, courses);
  assert.deepEqual(state.games, games);
});

test('loadAll throws on a failed fetch', async () => {
  const failing = () => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) });
  await assert.rejects(loadAll(failing), /Failed to load data\/config\.json: 500/);
});
