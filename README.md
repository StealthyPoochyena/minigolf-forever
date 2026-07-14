# ⛳ Minigolf Forever

Robbe & Saar's eternal minigolf rivalry tracker — a zero-build static site on GitHub Pages.

## How it works

- `data/config.json` — players and settings · `data/courses.json` — courses · `data/games.json` — every game with per-hole scores.
- All stats are computed in the browser from raw scores; nothing derived is stored.
- The **Add game** page commits new scores to this repo through the GitHub API. GitHub Pages then redeploys automatically (~1 minute).

## Local development

```
npx http-server -p 8123 -c-1     # serve the repo root
npm test                          # run unit tests (Node 20+)
```

## One-time setup per device (to save games)

The Add game page needs a GitHub token. It is stored **only in your browser's localStorage** and sent **only to api.github.com** — it is never committed or published.

1. Go to <https://github.com/settings/personal-access-tokens/new>.
2. Token name: `minigolf-forever`. Expiration: 1 year (set a reminder!).
3. **Repository access → Only select repositories →** this repo.
4. **Permissions → Repository permissions → Contents → Read and write.** Nothing else.
5. Generate, copy the `github_pat_…` value, open the site's **Add game** page and paste it there.

If a device is lost: revoke the token at <https://github.com/settings/personal-access-tokens> — done.

## Deployment

Served by GitHub Pages from the `main` branch root. Repo → Settings → Pages → Deploy from branch → `main` / `(root)`.
