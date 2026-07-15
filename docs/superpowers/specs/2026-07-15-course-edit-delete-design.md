# Course edit & delete — design

Date: 2026-07-15
Status: approved

## Goal

Courses are add-only today; games already support edit and delete. Add the ability to
rename a course (name + location) and delete a course, using the same PAT-backed
GitHub Contents API flow as every other write.

## Decisions

- **Delete rule:** a course can only be deleted when no games reference it. If games
  exist, the delete action alerts "This course has N games — delete those first."
- **Editable fields:** name and location only. Hole count is locked once the course
  exists, since past games were scored against it. The course **id never changes** on
  rename — games point at `courseId`, so renames propagate everywhere for free.
- **UI placement:** actions live on the course detail page (`#/courses/:id`), styled
  like the existing `game-actions` row. Edit expands an inline form in place; no new
  route.

## UI (js/views/course.js)

Under the course title/subtitle, a `course-actions` row: "✏️ Edit" and "🗑️ Delete".

- **Edit** toggles an inline form: text inputs for name and location (pre-filled),
  hole count shown but not editable, Save/Cancel. Requires the token (same alert as
  game delete if missing: "…open the Add page once to set it"). Save disables the
  button while in flight, updates `state.courses` via callback, re-renders.
- **Delete**: blocked with an alert while games reference the course; otherwise
  `confirm()`, then delete and navigate to `#/courses`.
- **Validation:** name and location must be non-empty after trimming, matching the
  Add form's rules for new courses.

## GitHub layer (js/github.js)

Two new exports built on the existing `saveWithRetry` (read-modify-write with one
retry on 409):

- `updateCourse({ repo, token, courseId, name, location, fetchImpl })` — rewrites the
  matching entry in `data/courses.json`. Commit message
  `Rename course: <old> → <new>` when the name changed, else `Edit course: <name>`.
  Throws "That course no longer exists…" if the id is gone. Returns
  `{ courses }`.
- `deleteCourse({ repo, token, courseId, fetchImpl })` — filters the course out of
  `data/courses.json`. Commit message `Delete course: <name>`. As a backstop against
  stale client state, it first reads `data/games.json` and refuses (throws) if any
  game still references the course. Idempotent if the course is already gone. Returns
  `{ courses }`.

## Wiring (js/app.js)

`wireCourse` gains `onCourseSaved` / `onCourseDeleted` callbacks: both replace
`state.courses`; save re-renders in place, delete navigates to `#/courses`.

## Testing

Unit tests alongside the existing github.js tests, using a mocked `fetchImpl`:

- rename happy path (content + commit message)
- rename when the course id has vanished (throws)
- delete happy path
- delete blocked because games still reference the course (throws, no write)
- conflict retry on 409 (mirrors existing saveGame conflict tests)
