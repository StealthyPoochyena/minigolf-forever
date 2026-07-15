// Token storage and GitHub Contents API writes.
// The token lives ONLY in browser localStorage and is sent ONLY to api.github.com
// in the Authorization header. It must never appear in file contents or URLs.

const TOKEN_KEY = 'minigolf.token';

export function getToken(storage = globalThis.localStorage) {
  return storage.getItem(TOKEN_KEY);
}

export function setToken(token, storage = globalThis.localStorage) {
  storage.setItem(TOKEN_KEY, token.trim());
}

export function clearToken(storage = globalThis.localStorage) {
  storage.removeItem(TOKEN_KEY);
}

function apiUrl(repo, path) {
  return `https://api.github.com/repos/${repo}/contents/${path}`;
}

function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64) {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function headers(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  };
}

function tokenRejectedError() {
  return new Error('GitHub rejected the token (it may have expired). Tap "Forget it" and save a fresh token — see the README.');
}

async function fetchFile(repo, path, token, fetchImpl) {
  const res = await fetchImpl(apiUrl(repo, path), { headers: headers(token) });
  if (res.status === 401 || res.status === 403) throw tokenRejectedError();
  if (!res.ok) throw new Error(`GitHub read of ${path} failed: ${res.status}`);
  const body = await res.json();
  return { content: JSON.parse(fromBase64(body.content)), sha: body.sha };
}

// Returns { conflict: true } on HTTP 409 (stale sha) so the caller can retry.
async function putFile(repo, path, content, sha, message, token, fetchImpl) {
  const res = await fetchImpl(apiUrl(repo, path), {
    method: 'PUT',
    headers: { ...headers(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sha,
      content: toBase64(JSON.stringify(content, null, 2) + '\n'),
    }),
  });
  if (res.status === 409) return { conflict: true };
  if (res.status === 401 || res.status === 403) throw tokenRejectedError();
  if (!res.ok) throw new Error(`GitHub write of ${path} failed: ${res.status}`);
  return { conflict: false };
}

async function saveWithRetry(repo, path, token, fetchImpl, apply, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, sha } = await fetchFile(repo, path, token, fetchImpl);
    const updated = apply(content);
    if (updated === content) return updated; // already applied (e.g. idempotent retry) — nothing to write
    const msg = typeof message === 'function' ? message(content) : message;
    const { conflict } = await putFile(repo, path, updated, sha, msg, token, fetchImpl);
    if (!conflict) return updated;
  }
  throw new Error('Save conflict: someone else just saved. Reload and try again.');
}

async function addCourseIfMissing(repo, token, newCourse, fetchImpl) {
  const updated = await saveWithRetry(
    repo, 'data/courses.json', token, fetchImpl,
    (data) => (data.courses.some((c) => c.id === newCourse.id) ? data : { courses: [...data.courses, newCourse] }),
    `Add course: ${newCourse.name}`,
  );
  return updated.courses;
}

export async function saveGame({ repo, token, game, newCourse = null, fetchImpl = fetch }) {
  const courses = newCourse ? await addCourseIfMissing(repo, token, newCourse, fetchImpl) : null;
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => ({ games: [...data.games, game] }),
    `Add game: ${game.id}`,
  );
  return { games: updated.games, courses };
}

export async function replaceGame({ repo, token, gameId, game, newCourse = null, fetchImpl = fetch }) {
  const courses = newCourse ? await addCourseIfMissing(repo, token, newCourse, fetchImpl) : null;
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => {
      const index = data.games.findIndex((g) => g.id === gameId);
      if (index === -1) {
        throw new Error('That game no longer exists — someone may have deleted it. Reload and try again.');
      }
      if (game.id !== gameId && data.games.some((g) => g.id === game.id)) {
        throw new Error('Save conflict: someone else just saved. Reload and try again.');
      }
      const games = [...data.games];
      games[index] = game;
      return { games };
    },
    `Edit game: ${gameId}`,
  );
  return { games: updated.games, courses };
}

export async function updateCourse({ repo, token, courseId, name, location, fetchImpl = fetch }) {
  const updated = await saveWithRetry(
    repo, 'data/courses.json', token, fetchImpl,
    (data) => {
      const index = data.courses.findIndex((c) => c.id === courseId);
      if (index === -1) {
        throw new Error('That course no longer exists — someone may have deleted it. Reload and try again.');
      }
      const current = data.courses[index];
      if (current.name === name && current.location === location) return data;
      const courses = [...data.courses];
      courses[index] = { ...current, name, location };
      return { courses };
    },
    (data) => {
      const old = data.courses.find((c) => c.id === courseId);
      return old.name !== name ? `Rename course: ${old.name} → ${name}` : `Edit course: ${name}`;
    },
  );
  return { courses: updated.courses };
}

export async function deleteGame({ repo, token, gameId, fetchImpl = fetch }) {
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => (data.games.some((g) => g.id === gameId)
      ? { games: data.games.filter((g) => g.id !== gameId) }
      : data),
    `Delete game: ${gameId}`,
  );
  return { games: updated.games };
}

export async function deleteCourse({ repo, token, courseId, fetchImpl = fetch }) {
  // Backstop against stale client state: check the server's games, not the UI's.
  const { content: gamesFile } = await fetchFile(repo, 'data/games.json', token, fetchImpl);
  if (gamesFile.games.some((g) => g.courseId === courseId)) {
    throw new Error('This course still has games — delete those first.');
  }
  const updated = await saveWithRetry(
    repo, 'data/courses.json', token, fetchImpl,
    (data) => (data.courses.some((c) => c.id === courseId)
      ? { courses: data.courses.filter((c) => c.id !== courseId) }
      : data),
    (data) => `Delete course: ${data.courses.find((c) => c.id === courseId).name}`,
  );
  return { courses: updated.courses };
}
