# Edit & Delete Games — Design

Date: 2026-07-14
Status: Approved by Robbe
Extends: `2026-07-14-minigolf-tracker-design.md`

## Purpose

Fix entry mistakes: edit any saved game (scores, date, note, and course) or delete it, from the website.

## UI

- **Course page:** each game's expandable `<details>` gains a footer row with two buttons: `✏️ Edit` and `🗑️ Delete`.
- **Edit** navigates to `#/edit/<gameId>`: the existing add-game form module in edit mode — pre-filled scores/date/course/note, heading "Edit game", submit button "Save changes", plus a Cancel link back to `#/courses/<courseId>`. All existing validation applies unchanged.
- **Delete** opens a native `confirm()` dialog naming the game (`Delete the game of 12 Jul 2026 (54 – 48)?`). On confirm it commits the removal and re-renders the course page.
- Both actions require the token (same rules and friendly errors as adding). Unknown `gameId` in the edit route shows the standard not-found message.

## Data layer (`js/github.js`)

Two functions on the existing `saveWithRetry` machinery (conflict retry + skip-PUT-when-unchanged):

- `replaceGame({ repo, token, gameId, game, newCourse = null, fetchImpl }) -> { games, courses }` — maps fresh `games.json`, swapping the game whose id is `gameId` for `game`. If `gameId` is absent from the fresh data (deleted on another device), throws `Error('That game no longer exists — someone may have deleted it. Reload and try again.')`. `newCourse` handled exactly like `saveGame` (courses.json first, idempotent).
- `deleteGame({ repo, token, gameId, fetchImpl }) -> { games }` — filters the game out. If already absent, the apply returns the content unchanged, the PUT is skipped, and the call succeeds (idempotent delete).

Commit messages: `Edit game: <id>` / `Delete game: <id>`.

## Edit semantics

- If date and course are unchanged, the game keeps its id. If either changed, the id is regenerated with `buildGameId` against the current games list *excluding the game being edited*.
- Edit-mode form state lives in memory only — it never reads or writes the `minigolf.draft` localStorage key, so an in-progress new game is unaffected.
- Moving a game to a brand-new course reuses the inline new-course flow.
- On success: update in-memory state, navigate to the (possibly new) course page.

## Ripple effects

None by construction — home, stats, streaks, and records are derived from raw data on every render. Git history is the undo mechanism for both edit and delete.

## Testing

- `github.js`: replaceGame happy path / conflict retry / vanished-game error / id-swap correctness; deleteGame happy path / already-deleted skip (call-count assertion, mirroring existing fakeGitHub tests).
- Form helpers: pre-fill from a game, id kept when date+course unchanged, id regenerated when either changes (and the edited game excluded from the numbering).
- View: course page renders the Edit link (`#/edit/<id>`) and Delete button per game.
