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

async function fetchFile(repo, path, token, fetchImpl) {
  const res = await fetchImpl(apiUrl(repo, path), { headers: headers(token) });
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
  if (!res.ok) throw new Error(`GitHub write of ${path} failed: ${res.status}`);
  return { conflict: false };
}

async function saveWithRetry(repo, path, token, fetchImpl, apply, message) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, sha } = await fetchFile(repo, path, token, fetchImpl);
    const updated = apply(content);
    const { conflict } = await putFile(repo, path, updated, sha, message, token, fetchImpl);
    if (!conflict) return updated;
  }
  throw new Error('Save conflict: someone else just saved. Reload and try again.');
}

export async function saveGame({ repo, token, game, newCourse = null, fetchImpl = fetch }) {
  let courses = null;
  if (newCourse) {
    const updated = await saveWithRetry(
      repo, 'data/courses.json', token, fetchImpl,
      (data) => ({ courses: [...data.courses, newCourse] }),
      `Add course: ${newCourse.name}`,
    );
    courses = updated.courses;
  }
  const updated = await saveWithRetry(
    repo, 'data/games.json', token, fetchImpl,
    (data) => ({ games: [...data.games, game] }),
    `Add game: ${game.id}`,
  );
  return { games: updated.games, courses };
}
