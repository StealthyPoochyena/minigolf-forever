export const config = {
  repo: 'OWNER/Minigolf-forever',
  maxScore: 7,
  players: [
    { id: 'robbe', name: 'Robbe', color: '#2f9e6e' },
    { id: 'saar', name: 'Saar', color: '#8b5cf6' },
  ],
};

export const courses = [
  { id: 'boom', name: 'Golf Boom', location: 'Boom', holes: 3 },
  { id: 'gent', name: 'Putt Gent', location: 'Gent', holes: 2 },
];

export function game(id, courseId, date, robbe, saar) {
  return { id, courseId, date, scores: { robbe, saar } };
}

// totals: g1 robbe 9 / saar 7 (saar wins) · g2 robbe 5 / saar 11 (robbe wins)
// g3 7-7 (tie) · g4 robbe 4 / saar 3 (saar wins)
export const games = [
  game('2026-01-10-boom-1', 'boom', '2026-01-10', [2, 3, 4], [1, 3, 3]),
  game('2026-02-01-boom-1', 'boom', '2026-02-01', [1, 2, 2], [2, 2, 7]),
  game('2026-03-05-gent-1', 'gent', '2026-03-05', [3, 4], [3, 4]),
  game('2026-04-09-gent-1', 'gent', '2026-04-09', [2, 2], [1, 2]),
];
