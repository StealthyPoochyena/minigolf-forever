import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getToken, setToken, clearToken, saveGame } from '../js/github.js';
import { game } from './fixtures.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}

test('token round-trips through storage and is trimmed', () => {
  const s = fakeStorage();
  assert.equal(getToken(s), null);
  setToken('  github_pat_abc  ', s);
  assert.equal(getToken(s), 'github_pat_abc');
  clearToken(s);
  assert.equal(getToken(s), null);
});

const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64');

// Scriptable GitHub Contents API stub: `plan` is a list of handlers consumed in order.
function fakeGitHub(plan) {
  const calls = [];
  const fetchImpl = (url, opts = {}) => {
    calls.push({ url, method: opts.method ?? 'GET', body: opts.body ? JSON.parse(opts.body) : null, headers: opts.headers });
    const handler = plan.shift();
    return Promise.resolve(handler(url, opts));
  };
  return { fetchImpl, calls };
}

const okRead = (content, sha) => () => ({ ok: true, status: 200, json: () => Promise.resolve({ content: b64(content), sha }) });
const okWrite = () => () => ({ ok: true, status: 201, json: () => Promise.resolve({}) });
const conflict = () => () => ({ ok: false, status: 409, json: () => Promise.resolve({}) });
const unauthorized = (status) => () => ({ ok: false, status, json: () => Promise.resolve({}) });

const newGame = game('2026-06-01-boom-1', 'boom', '2026-06-01', [2], [3]);

test('saveGame appends the game and PUTs with the fetched sha', async () => {
  const existing = game('2026-05-30-boom-1', 'boom', '2026-05-30', [1], [1]);
  const gh = fakeGitHub([okRead({ games: [existing] }, 'sha-1'), okWrite()]);

  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, fetchImpl: gh.fetchImpl });

  assert.deepEqual(result.games, [existing, newGame]);
  assert.equal(result.courses, null);
  const put = gh.calls[1];
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, 'https://api.github.com/repos/o/r/contents/data/games.json');
  assert.equal(put.body.sha, 'sha-1');
  assert.match(put.body.message, /2026-06-01-boom-1/);
  const written = JSON.parse(Buffer.from(put.body.content, 'base64').toString());
  assert.deepEqual(written.games, [existing, newGame]);
});

test('saveGame sends the token only in the Authorization header', async () => {
  const gh = fakeGitHub([okRead({ games: [] }, 's'), okWrite()]);
  await saveGame({ repo: 'o/r', token: 'sekret', game: newGame, fetchImpl: gh.fetchImpl });
  for (const call of gh.calls) {
    assert.equal(call.headers.Authorization, 'Bearer sekret');
    assert.ok(!JSON.stringify(call.body ?? {}).includes('sekret'), 'token must never be in a request body');
  }
});

test('saveGame refetches and retries once on conflict', async () => {
  const other = game('2026-05-31-boom-1', 'boom', '2026-05-31', [3], [2]);
  const gh = fakeGitHub([
    okRead({ games: [] }, 'stale'),
    conflict(),
    okRead({ games: [other] }, 'fresh'),
    okWrite(),
  ]);
  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.games, [other, newGame]);
});

test('saveGame gives up after a second conflict', async () => {
  const gh = fakeGitHub([okRead({ games: [] }, 'a'), conflict(), okRead({ games: [] }, 'b'), conflict()]);
  await assert.rejects(saveGame({ repo: 'o/r', token: 't', game: newGame, fetchImpl: gh.fetchImpl }), /Save conflict/);
});

test('saveGame with a new course updates courses.json first, then games.json', async () => {
  const course = { id: 'brugge', name: 'Golf Brugge', location: 'Brugge', holes: 12 };
  const gh = fakeGitHub([
    okRead({ courses: [] }, 'cs'),
    okWrite(),
    okRead({ games: [] }, 'gs'),
    okWrite(),
  ]);
  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, newCourse: course, fetchImpl: gh.fetchImpl });
  assert.deepEqual(result.courses, [course]);
  assert.deepEqual(result.games, [newGame]);
  assert.match(gh.calls[0].url, /data\/courses\.json$/);
  assert.match(gh.calls[1].body.message, /Golf Brugge/);
});

test('saveGame skips the courses.json PUT when the course was already saved (retry after partial failure)', async () => {
  const course = { id: 'brugge', name: 'Golf Brugge', location: 'Brugge', holes: 12 };
  const gh = fakeGitHub([
    okRead({ courses: [course] }, 'cs'), // course already committed on a previous attempt
    okRead({ games: [] }, 'gs'),
    okWrite(),
  ]);
  const result = await saveGame({ repo: 'o/r', token: 't', game: newGame, newCourse: course, fetchImpl: gh.fetchImpl });

  assert.equal(gh.calls.length, 3, 'expected no PUT to courses.json');
  assert.equal(gh.calls[0].url, 'https://api.github.com/repos/o/r/contents/data/courses.json');
  assert.equal(gh.calls[0].method, 'GET');
  assert.equal(gh.calls[1].url, 'https://api.github.com/repos/o/r/contents/data/games.json');
  assert.equal(gh.calls[1].method, 'GET');
  assert.equal(gh.calls[2].url, 'https://api.github.com/repos/o/r/contents/data/games.json');
  assert.equal(gh.calls[2].method, 'PUT');
  assert.deepEqual(result.courses, [course]);
});

test('saveGame rejects with a friendly message when the token is invalid or expired', async () => {
  const gh = fakeGitHub([unauthorized(401)]);
  await assert.rejects(
    saveGame({ repo: 'o/r', token: 'bad', game: newGame, fetchImpl: gh.fetchImpl }),
    /rejected the token/,
  );
});
