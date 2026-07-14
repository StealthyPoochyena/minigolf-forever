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
