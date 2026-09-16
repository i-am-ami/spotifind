# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Spotifind: search the lyrics of your own Spotify library for a word or phrase. Personal-scale prototype — no build step, no bundler, no TypeScript, plain Node ESM (`"type": "module"`) throughout. See `README.md` for the full timeline/roadmap.

## Commit Messages

Use Conventional Commits format for all commits:

    <type>(<scope>): <short summary>

**Types:** feat, fix, refactor, test, docs, chore, perf, ci
**Scope:** the affected area of Spotifind (e.g. search, auth, db, lyrics, frontend, pagination)

Rules:
- Summary under 72 characters, imperative mood ("add" not "added")
- Add a body only when the "why" isn't obvious from the diff — explain reasoning, not restate the change
- Use `BREAKING CHANGE:` in the footer if a change breaks existing API/DB contracts
- Never commit without staged changes being reviewed first

## Commands

```
npm install
npm run auth            # one-time Spotify OAuth login (opens a browser), caches tokens in data/tokens.json
npm run sync:library    # fetch:songs + fetch:lyrics
npm run server           # Express server on :8000 -- serves webapp/ + /api/search + /api/playlists
```

`npm run serve:webapp` (a plain Python static server) predates `server.js` and doesn't serve the API — use `npm run server` instead unless you specifically need a static-only server.

Tests use Node's built-in runner (`node --test`), no test framework dependency:
```
npm run test:search    # backend/search.js matching logic (25 cases)
npm run test:server    # backend/server.js HTTP layer, 3 files (20 cases total)
npm run test:lrclib    # backend/lrclib.js fetch + LRC parsing (17 cases)
```
Run a single file directly: `node --test tests/search.test.js`
Run a single case by name: `node --test --test-name-pattern="prefix matching" tests/search.test.js`

`npm run test:search:log` / `test:server:log` / `test:lrclib:log` also tee full output plus a per-run JUnit XML to `tests/logs/` (gitignored), and append one line to both `tests/test-log.md` (tracked, human-readable) and `tests/test-log.jsonl` (tracked, one JSON record per run — `timestamp`, `suite`, `total`/`pass`/`fail`/`skipped`, `duration_ms`, `exit_code`, `status`, `log_file`, `xml_file`, `commit`) — see `scripts/run-tests.sh`.

Each test suite has a companion "gold" spec written as a markdown table (test case → input → expected → reasoning): `tests/fixtures/fixtures_gold.md`, `tests/server_test_gold.md`, `tests/lrclib_test_gold.md`. Check these first when adding a case -- they're the source of truth for *why* a case exists, not just what it asserts.

## Architecture

Two independent code paths that only share `data/*.json` as their interface:

1. **Data pipeline** (`backend/spotauth.js` → `songs.js` → `lyrics.js` → `lrclib.js`), run manually via the npm scripts above -- never invoked by the server. `spotauth.js` handles the OAuth browser flow and token refresh. `songs.js` pages through Spotify's API and writes `data/songs.json` (deduped by track ID; each track carries `liked` and `playlists: [{id,name}]`, merged across every place it appears) plus `data/playlists.json` (only playlists whose tracks were fetched successfully). `lyrics.js` reads `songs.json`, skips any track already in `data/lyrics.json`, and calls `lrclib.js`'s `fetchLyrics()` per track (rate-limited, checkpointed every 5 tracks). `lrclib.js` also parses LRCLIB's line-synced LRC text into `{time, text}` pairs (`parseSyncedLyrics`) -- stored in `data/lyrics.json` but not consumed anywhere yet (planned for a future "scrub to this lyric in Spotify" feature).

2. **Live server** (`backend/search.js` + `server.js`), serving `webapp/` plus a JSON API. `search.js` loads `data/songs.json`/`data/lyrics.json` into an in-memory cache on first use; the paths are overridable via `SPOTIFIND_SONGS_PATH`/`SPOTIFIND_LYRICS_PATH` env vars, which is how tests point it at `tests/fixtures/` instead of real data (`server.js`'s `SPOTIFIND_PLAYLISTS_PATH` works the same way). `server.js` exports `app` (Express) rather than unconditionally calling `.listen()` -- it only binds a port when run as the entrypoint directly (the same `import.meta.url === file://${process.argv[1]}` guard `spotauth.js` uses), so tests can import `app` and bind an ephemeral port instead.

Search semantics (`search.js`), non-obvious enough to matter when changing it:
- Unquoted query -> per-word **prefix** match (`beg` matches `begged`). Wrapping the whole query in `"double quotes"` forces **exact** word match instead.
- The tokenizer (`[a-z0-9']+`) treats line breaks and punctuation as separators but keeps apostrophes *inside* a word -- so `beggin'`/`won't` are single tokens, and quoted `"beggin"` (no apostrophe) will *not* exact-match `beggin'`.
- A phrase can span a line break (it's tokenized as one continuous string), but word **adjacency** is required -- `"love you"` will not match `"love who you are"`.
- Matches come from both `title` and `lyrics`; a track's `matchCount` sums both, but the returned `snippet` prefers a lyric match over a title-only match.
- Playlist/artist/album are filters (AND'd together, and with the phrase match) -- they never affect whether the phrase itself matches.

Frontend (`webapp/app.js`, vanilla JS, no framework/build step) calls `/api/search` and `/api/playlists`. Playlist/artist/album are three independently joinable filters, not mutually exclusive scopes. Search is live with a 250ms debounce; sort and pagination (15/page) are client-side.

## Testing notes

- `node --test` runs each matched file in its own subprocess. `tests/server-errors.test.js` and `tests/server-malformed-playlists.test.js` deliberately rely on this: each sets `SPOTIFIND_*_PATH` env vars to broken/missing paths *before* importing `server.js`, in a file separate from `server.test.js`'s valid fixtures -- module-level path constants get computed fresh per process, so the broken paths can't leak into (or be overridden by) the happy-path suite.
- No mocking-library dependency: `fetchLyrics`'s HTTP calls are stubbed in `tests/lrclib.test.js` via `node:test`'s built-in `t.mock.method(globalThis, 'fetch', ...)` (`undici`'s `MockAgent` isn't importable on this Node version without adding it as a real dependency).
- `tests/fixtures/{songs,lyrics,playlists}.json` are real entries distilled from an actual synced library, not synthetic data -- each has a `_note` field explaining what it's there to test.

## Data & environment

- `data/` (gitignored) holds `songs.json`, `lyrics.json`, `playlists.json`, and `tokens.json` (live Spotify OAuth tokens -- never commit). Everything there is local-only and regenerable via `npm run sync:library`; there is no database yet (see README roadmap).
- `.env` (gitignored) needs `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REDIRECT_URI`. It may still carry unused `GENIUS_CLIENT_*` keys left over from an earlier lyrics-source experiment -- nothing in the code reads them.
- `tests/.obsidian/` is intentionally tracked (not gitignored) -- it's an Obsidian vault rooted at `tests/` so the test-plan docs can be browsed there directly; don't treat it as stray editor config.
