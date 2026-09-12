# Spotifind

Search the lyrics of your own Spotify library for a word or phrase.

## Setup

```bash
npm install
npm run auth           # one-time Spotify OAuth login, caches tokens in data/tokens.json
npm run sync:library    # fetch your library + lyrics into data/songs.json and data/lyrics.json
```

Requires a `.env` with `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI` (not tracked in git).

## Scripts

- `npm run auth` — run the Spotify OAuth flow / refresh cached tokens
- `npm run fetch:songs` — pull Liked Songs + all playlists into `data/songs.json`
- `npm run fetch:lyrics` — fetch lyrics (via LRCLIB) for any track in `data/songs.json` not already cached in `data/lyrics.json`
- `npm run sync:library` — runs the two above in sequence
- `npm run server` — start the Express server (serves `webapp/` + `/api/search`, `/api/playlists`) on port 8000
- `npm run test:search` / `npm run test:server` — run the unit/integration test suites
- `npm run test:search:log` / `npm run test:server:log` — same, but also save the run to `tests/logs/` and append a summary line to `tests/test-log.md`

## Tests

| Path | What it is |
|---|---|
| `tests/search.test.js` | Unit tests for `backend/search.js`'s matching logic (prefix/exact matching, punctuation/line-break tolerance, playlist/artist/album filters, sorting) |
| `tests/server.test.js` | HTTP integration tests for `backend/server.js`'s happy paths (`/api/search`, `/api/playlists`, static file serving), run against an ephemeral port |
| `tests/server-errors.test.js` | Tests the 500 error paths when the songs/lyrics/playlists files are missing — isolated in its own process (env vars are set before import, and `node --test` runs each file in a separate process) so it can't pollute `server.test.js`'s valid fixtures |
| `tests/server-malformed-playlists.test.js` | Same idea, for malformed JSON content instead of a missing file — a distinct failure path through the same try/catch, tested separately |
| `tests/fixtures/` | Real data distilled from Ami's actual library (`songs.json`, `lyrics.json`, `playlists.json`) plus `broken-playlists.json` (deliberately invalid JSON) and a `README.md` explaining what each fixture entry tests |
| `tests/test-log.md` | Git-tracked rolling summary — one line per `*:log` run (date, suite, pass/fail counts, link to the full log) |
| `tests/logs/` | Gitignored — full raw output per run, for local debugging; not meant to be kept forever |
| `scripts/run-tests.sh` | Runs a suite, saves its full output to `tests/logs/`, and appends the summary line to `tests/test-log.md` |
| `tests/server_test_gold.md` | The test plan/spec for `server.test.js` written *before* the tests, including the row-12 decision (duplicate `q` param → `400`, not silently normalized) and its rationale |

## Timeline

- **2026-09-05** — Reviewed prototype scripts (`spotauth.js`, `songs.js`, `lyrics.js`, `lrclib.js`) and the `SpotiFind.html` frontend skeleton. Found `songs.js`/`lyrics.js` reading/writing mismatched filenames, and no `package.json`/git repo. Added `package.json` (deps: `dotenv`, `open`, `spotify-web-api-node`) and ran `npm install`.
- **2026-09-06** — Added `sync:library` script to chain the fetch steps. Ran a full sync (4945 tracks, 110 playlists). Fixed `songs.js` to write to `data/songs.json` (was `data/mysongs.json`, out of sync with what `lyrics.js` reads). Filtered out local files/episodes lacking name/artist/duration before lyrics lookup. Removed the stale `data/mysongs.json`. Initialized git (`spotifind-dev` branch) with a `.gitignore` excluding `.env`, `data/`, `node_modules/`, `.DS_Store`, `.claude/` — data stays local-only for now.
- **2026-09-06** — Added playlist membership tracking to `songs.js` (`liked`/`playlists` fields per track, plus `data/playlists.json` for successfully-fetched playlists) so the frontend can filter by playlist. Restructured the repo into `backend/` (Node scripts) and `webapp/` (frontend). Extracted `SpotiFind.html`'s inline CSS/JS into `webapp/style.css`/`webapp/app.js`, switched the theme to a Spotify-style dark palette and Poppins/Inter fonts, and turned the single playlist "scope" selector into three joinable filters (playlist, artist, album) with debounced live search. Frontend still runs against demo data — real search/API integration is next.
- **2026-09-07/08** — Built `backend/search.js` (punctuation/line-break-tolerant phrase matching over lyrics + title, with playlist/artist/album filters and match-count sorting) and `backend/server.js` (Express, serving `webapp/` plus `/api/search` and `/api/playlists`). Wired `app.js` to the real API, replacing the demo data. Added album display, fixed pagination (15/page), and fixed a client-side highlight bug where punctuation in the typed query (e.g. "love,") prevented matches from being highlighted even though the underlying search was correct. Search defaults to prefix matching per word (e.g. "beg" matches "begged"); wrapping the whole query in double quotes forces an exact word match instead.
- **2026-09-11/12** — Built `tests/search.test.js` (25 cases) against real, distilled library data in `tests/fixtures/`. Refactored `search.js`/`server.js` to accept env-var-overridable data paths for testability. Built `tests/server.test.js` + two isolated error-path test files (missing files vs. malformed JSON, each in its own process so `node --test`'s per-file process isolation keeps broken fixtures from leaking into the happy-path suite). Decided duplicate `q` query params should `400`, not silently normalize. Added `scripts/run-tests.sh` + `tests/test-log.md` to track suite health over time.

## Roadmap

1. Harden the backend before adding new features. `search.js`/`server.js` test coverage done; next is fetch-logic tests (`lrclib.js` via mocked HTTP responses, plus extracting `songs.js`/`lyrics.js`'s pure dedup/filter logic for testing).
2. Move from JSON files to Postgres (e.g. Neon) with per-user library isolation and a shared lyrics table.
3. Containerize and host for multi-user access via Spotify OAuth.

## Future ideas (not scheduled)

- Track each song's language (e.g. via text-based language detection, since neither Spotify nor LRCLIB expose one directly) to support multi-language lyric search.
- Jump Spotify playback to the matched lyric's timestamp. LRCLIB has a `syncedLyrics` (LRC, per-line timestamps) field we don't currently fetch; actually seeking playback would need Spotify's playback-control API (Premium + active device + broader OAuth scopes than we request today).
