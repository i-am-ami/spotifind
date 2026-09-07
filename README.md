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

## Timeline

- **2026-09-05** — Reviewed prototype scripts (`spotauth.js`, `songs.js`, `lyrics.js`, `lrclib.js`) and the `SpotiFind.html` frontend skeleton. Found `songs.js`/`lyrics.js` reading/writing mismatched filenames, and no `package.json`/git repo. Added `package.json` (deps: `dotenv`, `open`, `spotify-web-api-node`) and ran `npm install`.
- **2026-09-06** — Added `sync:library` script to chain the fetch steps. Ran a full sync (4945 tracks, 110 playlists). Fixed `songs.js` to write to `data/songs.json` (was `data/mysongs.json`, out of sync with what `lyrics.js` reads). Filtered out local files/episodes lacking name/artist/duration before lyrics lookup. Removed the stale `data/mysongs.json`. Initialized git (`spotifind-dev` branch) with a `.gitignore` excluding `.env`, `data/`, `node_modules/`, `.DS_Store`, `.claude/` — data stays local-only for now.
- **2026-09-06** — Added playlist membership tracking to `songs.js` (`liked`/`playlists` fields per track, plus `data/playlists.json` for successfully-fetched playlists) so the frontend can filter by playlist. Restructured the repo into `backend/` (Node scripts) and `webapp/` (frontend). Extracted `SpotiFind.html`'s inline CSS/JS into `webapp/style.css`/`webapp/app.js`, switched the theme to a Spotify-style dark palette and Poppins/Inter fonts, and turned the single playlist "scope" selector into three joinable filters (playlist, artist, album) with debounced live search. Frontend still runs against demo data — real search/API integration is next.

## Roadmap

1. Build the search module + local API server, and wire `webapp/` to real data in `data/songs.json`/`data/lyrics.json`.
2. Move from JSON files to Postgres (e.g. Neon) with per-user library isolation and a shared lyrics table.
3. Containerize and host for multi-user access via Spotify OAuth.
