# server.js test plan

This documents the planned `server.test.js` suite before it's written --
what each case checks and why. Covers `backend/server.js`'s HTTP layer
(`/api/search`, `/api/playlists`, static file serving) against the same
fixtures used by `search.test.js`. `search()`'s matching logic itself is
already covered there; these tests are about the HTTP wiring around it.

## Setup needed first

| Refactor | Why |
|---|---|
| Export `app` from `server.js` and guard `app.listen(...)` behind an entry-point check (same pattern `spotauth.js` already uses) | Lets tests import the app and bind it to an ephemeral port (`app.listen(0)`) instead of colliding with the real dev server on 8000 |
| Make `PLAYLISTS_PATH` overridable via an env var, same pattern `search.js` already uses for `SONGS_PATH`/`LYRICS_PATH` | Lets a test point it at a missing/broken file on purpose, to test the error path |

## Test matrix

| # | Endpoint | Case | Request | Expected | Reasoning |
|---|---|---|---|---|---|
| 1 | `/api/search` | Normal query | `?q=beg` | `200`, JSON array of matches | Confirms the HTTP layer wires query params into `search()` correctly (matching logic itself is unit-tested separately) |
| 2 | `/api/search` | No `q` param | *(omitted)* | `200`, `[]` | Existing guard clause -- missing input shouldn't error |
| 3 | `/api/search` | Empty `q` | `?q=` | `200`, `[]` | Same guard, different way to send "nothing" |
| 4 | `/api/search` | Whitespace-only `q` | `?q=%20%20` | `200`, `[]` | `.trim()` check should catch this too |
| 5 | `/api/search` | `q` + `playlist` | `?q=dog+days&playlist=<id>` | `200`, filtered array | Confirms the playlist param round-trips through HTTP into `search()` |
| 6 | `/api/search` | `q` + `artist` | `?q=find+god&artist=Dominic+Fike` | `200`, filtered array | Same, for artist |
| 7 | `/api/search` | `q` + `album` | `?q=skin+clear&album=POP+GIRLS` | `200`, filtered array | Same, for album |
| 8 | `/api/search` | Unknown playlist id | `?q=beg&playlist=nonexistent` | `200`, `[]` | Garbage filter value shouldn't error, just exclude everyone |
| 9 | `/api/search` | Unknown artist | `?q=beg&artist=nonexistent` | `200`, `[]` | Same reasoning as row 8, for the artist filter |
| 10 | `/api/search` | Unknown album | `?q=beg&album=nonexistent` | `200`, `[]` | Same reasoning as row 8, for the album filter |
| 11 | `/api/search` | Quoted exact match, URL-encoded | `?q=%22beg%22` | `200`, exact-match-only array | Confirms quotes survive URL encoding/decoding through Express, not just inside `search.js` directly |
| 12 | `/api/search` | Duplicate `q` param | `?q=beg&q=love` | `400`, `{ error: 'q must be a single string.' }` (or similar) | See "Decision: row 12" below |
| 13 | `/api/search` | Underlying `search()` throws | forced via a broken fixture path | `500`, `{ error: 'Search failed.' }` | Confirms the try/catch actually catches and doesn't crash the server |
| 14 | `/api/playlists` | Normal case | `GET /api/playlists` | `200`, JSON array | Baseline |
| 15 | `/api/playlists` | File missing/unreadable | forced via env override | `500`, `{ error: 'Could not load playlists.' }` | Confirms the try/catch there works too |
| 16 | `/api/playlists` | Malformed JSON in file | forced via a broken fixture | `500`, same error body | `JSON.parse` throwing should be caught, not crash the process |
| 17 | static files | `GET /index.html` | -- | `200`, `text/html` | Confirms `express.static` is serving `webapp/` |
| 18 | static files | `GET /app.js` | -- | `200`, JS content-type | Same |
| 19 | static files | `GET /does-not-exist.xyz` | -- | `404` | Default Express behavior, sanity-checked |
| 20 | routing | `GET /api/does-not-exist` | -- | `404` | No route registered -- confirms we didn't accidentally catch-all |

## Decision: row 12

`const { q } = req.query;` followed by `if (!q || !q.trim())` will throw a
`TypeError` if `q` arrives as an array (`?q=beg&q=love`), since arrays don't
have `.trim()`. That line sits *before* the route's try/catch, so today this
would surface as an unhandled synchronous throw -- Express's default error
handler still returns a `500` rather than crashing the process, but the
error body wouldn't be our clean `{ error: 'Search failed.' }` shape.

**Decided: return `400` for a non-string `q`, not normalize to its first
value.** Silently picking one value would hide a client bug behind a
"successful" response, making it look like the request worked as intended
when it didn't. An explicit `400` is more honest and easier to debug.

This isn't really a normal-usage case -- `app.js` only ever sends a single
`q` (via `URLSearchParams`), so it'd take a hand-edited/bookmarked URL, an
HTML form with a duplicate `name="q"` field, or someone hitting the API
directly (curl, a future API consumer, fuzzing) to trigger it. It's an
input-validation/robustness case, not a real user flow.

**Implementation needed:** add a `typeof q !== 'string'` check ahead of the
existing guard, e.g.:
```js
if (q !== undefined && typeof q !== 'string') {
  return res.status(400).json({ error: 'q must be a single string.' });
}
```
