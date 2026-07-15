---
name: verify
description: Build/launch/drive recipe for verifying Minigolf Forever changes in a real browser
---

# Verifying Minigolf Forever

Static site, no build step. Unit tests (`npm test`) are CI's job — verification means
driving the app in a browser.

## Launch

- Serve the repo root with any static server (a tiny `http.createServer` that streams
  files works; `npx serve .` also fine). SPA is hash-routed, so no fallback needed.
- No Playwright in the repo. Install `playwright-core` in the session scratchpad and
  launch system Chrome: `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })`.
  Use a phone-ish viewport (420×900) — the app is styled mobile-first.

## Drive without touching the real repo

All writes go to `api.github.com` with a PAT from `localStorage['minigolf.token']`.
Never do live writes; stub the network in Playwright instead:

- `page.route('**/data/*.json*', …)` → fulfill with fixture `{ config }`, `{ courses }`,
  `{ games }` (the app cache-busts with `?t=`, so keep the trailing `*`).
- `page.route('https://api.github.com/**', …)` → GET returns
  `{ content: base64(json), sha: 'fake-sha' }`; PUT: decode `body.content`, record
  `body.message`, mutate the fixture state so follow-up reads see it.
- Set the token before the app boots: goto once, `localStorage.setItem('minigolf.token', 'fake-token')`, then reload.
- The app uses `alert`/`confirm` — install a `page.on('dialog')` handler up front or
  clicks hang.

## Gotchas

- Route changes re-render everything via the `hashchange` listener; after an action
  that sets `location.hash`, wait on `page.waitForFunction(() => location.hash === …)`.
- Check screenshots for contrast: `.linklike` (dark green) is invisible on the felt
  page background — only use it on cream cards, or restyle (see `.course-actions`).
