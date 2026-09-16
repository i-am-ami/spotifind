# lrclib.js test plan

Documents `tests/lrclib.test.js` (17 cases) -- covers `backend/lrclib.js`'s
LRC parser (`parseSyncedLyrics`) and its HTTP-facing function
(`fetchLyrics`). No real network calls: `fetchLyrics` tests stub
`globalThis.fetch` via `node:test`'s built-in `mock.method` (auto-restored
per test), since `undici`'s `MockAgent` isn't importable on this Node
version without adding it as a real dependency.

## `parseSyncedLyrics`

| # | Test | Input | Expected output | Reasoning |
|---|---|---|---|---|
| 1 | Normal multi-line LRC block | `[00:12.34]First line\n[00:15.67]Second line` | `[{time:12.34,text:'First line'},{time:15.67,text:'Second line'}]` | Baseline parsing of standard LRC format |
| 2 | A line with multiple timestamps | `[00:12.00][00:45.00]Chorus line` | Two entries, same text, different times (12, 45) | LRC allows a repeated line to carry more than one timestamp |
| 3 | Metadata tags are skipped | `[ar:Some Artist]\n[ti:Some Title]\n[00:01.00]Actual lyric` | Only the real lyric line survives | Tags like `[ar:...]` don't match the `\d{2}:\d{2}` pattern, so they're ignored rather than misparsed as a timestamp |
| 4 | Null/empty input | `null`, `''`, `undefined` | `null` | Guard clause -- nothing to parse |
| 5 | 2-digit vs 3-digit fractions | `[00:01.50]...` and `[00:02.500]...` | `1.5`s and `2.5`s respectively | Hundredths (LRC's usual precision) and milliseconds both convert correctly |
| 6 | Out-of-order source lines | later timestamp appears first in the source text | Output sorted ascending by time | LRC lines aren't guaranteed to arrive in chronological order |
| 7 | Timestamp with no following text | `[00:10.00]` | `{time:10, text:''}` | An empty lyric line (e.g. an instrumental gap) is preserved, not silently dropped |
| 8 | Minutes past 59 | `[75:00.00]Long track line` | `time = 4500` (75×60) | Long tracks need `mm` treated as plain minutes, not wrapped like a clock face |

## `fetchLyrics`

| # | Test | Mocked response / input | Expected | Reasoning |
|---|---|---|---|---|
| 9 | Missing duration | `durationMs: undefined` | Rejects with `/Missing duration/`; `fetch` is never called | Can't hit `/api/get` without a duration -- should fail fast, before any network I/O |
| 10 | Full match | `plainLyrics` + `syncedLyrics` both present | Returns `{ lrclibId, matchedTitle, matchedArtist, lyrics, syncedLyrics }` with `syncedLyrics` parsed | Happy path -- both fields flow through together |
| 11 | Plain lyrics, no synced lyrics | `syncedLyrics` omitted from the API response | `result.syncedLyrics === null` | Not every track has line-sync data from LRCLIB |
| 12 | Instrumental | `instrumental: true`, `plainLyrics` also present | `null` | The instrumental flag takes priority regardless of what lyrics fields happen to be populated |
| 13 | Missing plain lyrics (not instrumental) | `plainLyrics: ''` | `null` | No usable lyrics text means no result, even if other fields are populated |
| 14 | 404 | status 404 | `null` | "No exact match" is not an error condition |
| 15 | Non-404 error status | status 500 | Rejects with `/LRCLIB \/get failed \(500\)/` | Real request failures should surface as errors, not be silently swallowed |
| 16 | Request params, with album | `album: 'My Album'` | Captured URL has `track_name`, `artist_name`, `album_name`, and `duration` (rounded ms → whole seconds) | Confirms the request-building logic itself, not just response handling |
| 17 | Request params, no album | `album: null` | Captured URL has no `album_name` param | Avoids sending a bogus empty album filter into LRCLIB's exact-match lookup |
