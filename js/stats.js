// Pure stat derivations. No imports, no side effects, no DOM.

export function gameTotals(game) {
  const totals = {};
  for (const [playerId, scores] of Object.entries(game.scores)) {
    totals[playerId] = scores.reduce((a, b) => a + b, 0);
  }
  return totals;
}

export function gameWinner(game) {
  const totals = gameTotals(game);
  const [a, b] = Object.keys(totals);
  if (totals[a] === totals[b]) return 'tie';
  return totals[a] < totals[b] ? a : b;
}

export function overallTally(games, playerIds) {
  const wins = Object.fromEntries(playerIds.map((p) => [p, 0]));
  let ties = 0;
  for (const game of games) {
    const w = gameWinner(game);
    if (w === 'tie') ties++;
    else wins[w]++;
  }
  return { wins, ties };
}

export function totalStrokes(games, playerIds) {
  const totals = Object.fromEntries(playerIds.map((p) => [p, 0]));
  for (const game of games) {
    const t = gameTotals(game);
    for (const p of playerIds) totals[p] += t[p] ?? 0;
  }
  return totals;
}

export function sortByDateDesc(games) {
  return [...games].sort(
    (x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id),
  );
}

export function countScore(games, playerId, score) {
  let n = 0;
  for (const game of games) {
    for (const s of game.scores[playerId] ?? []) if (s === score) n++;
  }
  return n;
}

function extremeGame(games, playerId, isBetter) {
  let best = null;
  for (const game of games) {
    const scores = game.scores[playerId];
    if (!scores) continue;
    const total = scores.reduce((a, b) => a + b, 0);
    if (!best || isBetter(total, best.total)) best = { game, total };
  }
  return best;
}

export function bestGame(games, playerId) {
  return extremeGame(games, playerId, (a, b) => a < b);
}

export function worstGame(games, playerId) {
  return extremeGame(games, playerId, (a, b) => a > b);
}

export function currentStreak(games, playerId) {
  let n = 0;
  for (const game of sortByDateDesc(games)) {
    if (gameWinner(game) !== playerId) break;
    n++;
  }
  return n;
}

export function longestStreak(games, playerId) {
  let best = 0;
  let run = 0;
  for (const game of sortByDateDesc(games).reverse()) {
    run = gameWinner(game) === playerId ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

export function biggestMargin(games) {
  let best = null;
  for (const game of games) {
    const winnerId = gameWinner(game);
    if (winnerId === 'tie') continue;
    const values = Object.values(gameTotals(game));
    const margin = Math.max(...values) - Math.min(...values);
    if (!best || margin > best.margin) best = { game, winnerId, margin };
  }
  return best;
}
