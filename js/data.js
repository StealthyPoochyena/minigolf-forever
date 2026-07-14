const FILES = ['data/config.json', 'data/courses.json', 'data/games.json'];

export async function loadAll(fetchImpl = fetch) {
  const [config, coursesFile, gamesFile] = await Promise.all(
    FILES.map(async (path) => {
      const res = await fetchImpl(`${path}?t=${Date.now()}`);
      if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
      return res.json();
    }),
  );
  return { config, courses: coursesFile.courses, games: gamesFile.games };
}
