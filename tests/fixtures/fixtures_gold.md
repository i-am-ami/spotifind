# Fixture data

`songs.json` / `lyrics.json` / `playlists.json` are real entries pulled from
Ami's actual Spotify library and lyrics cache (`data/`), trimmed down to just
the lines needed to exercise a specific `search.js` behavior. Real track IDs,
artists, and lyrics are kept for traceability; each entry has a `_note` field
explaining what it's there to test (a harmless extra field -- `search.js`
ignores unknown keys). Where a trimmed excerpt joins non-contiguous lines
from the real lyrics, the note says so.

These fixtures test **search logic only** (`search.js`, and by extension
`server.js`'s `/api/search`) -- they represent already-fetched, stored data,
not raw API responses. Testing the *fetch* logic (LRCLIB's response shapes
in `lrclib.js`, Spotify's API in `songs.js`) needs separate fixtures in a
separate file, since those are raw external-API shapes, not this
stored-library shape.

Every row below corresponds 1:1 to a `test(...)` block in `search.test.js`.

## Test matrix

| # | Test | Fixture(s) | Query / filters | Expected | Reasoning |
|---|---|---|---|---|---|
| 1 | Prefix matching | Beggin', Beg for You | `beg` | both appear | Unquoted words match as a prefix, so `beg` matches the token `beggin'` |
| 2 | Exact quoted match | Beg for You (yes), Beggin' (no) | `"beg"` | Beg for You appears, Beggin' excluded | Exact mode requires a full token match; `beggin'`'s token includes the trailing apostrophe, so it isn't equal to `beg` |
| 3 | Punctuation touching a match | Beg for You | `beg for you` | appears | Parens directly touching some occurrences (`you (`, `you)`) shouldn't block the match |
| 4 | Case-insensitivity | POP GIRL | `skin clear` | appears | Lyric has `Skin` capitalized; query is lowercase |
| 5 | Line-break-spanning phrase | petal | `again they` | appears | `again` and `They` sit on either side of a line break |
| 6 | Non-adjacency (negative case) | petal | `need to save` | excluded | `need someone to save` has a word between `need` and `to`, so it must NOT match |
| 7 | Repeated phrase → matchCount | petal | `heartbreak won't bite` | `matchCount = 2` | The phrase appears twice in the lyrics |
| 8 | Hyphen as a word separator | POP GIRL | `iced out` | appears | `Iced-out` splits into two tokens (`iced`, `out`) at the hyphen |
| 9 | Numeric tokens | POP GIRL | `2012` | appears | Digits are valid token characters, not stripped like other punctuation |
| 10 | Overlapping sliding-window matches | POP GIRL | `pop pop` | `matchCount = 2` | `pop-pop-pop` is 3 consecutive `pop` tokens; a 2-word query slides across them with overlap |
| 11 | Title-only match | FIND GOD | `find god` | appears, snippet = title | `lyrics: null` (a real "LRCLIB had no match" case) — must still be found via the title |
| 12 | Title + lyrics combined | petal | `petal` | `matchCount = 3`, snippet = `"Petal in the pavement"` | 1 title match + 2 lyric matches (`Petal in the pavement` ×2) summed; snippet should prefer the lyric match over the title |
| 13 | `liked` filter excludes | Dog Days Are Over | `dog days` + `playlist: liked` | excluded | `liked: false` on this track |
| 14 | `liked` filter includes | Beg for You | `beg` + `playlist: liked` | included | `liked: true` on this track |
| 15 | Playlist filter includes | Dog Days Are Over | `dog days` + its real playlist id | included | Track belongs to that playlist |
| 16 | Playlist filter excludes | Dog Days Are Over | `dog days` + a *different* playlist id | excluded | Phrase matches, but the track isn't in that playlist |
| 17 | Artist filter, non-first artist | FIND GOD | `find god` + `artist: Dominic Fike` | included | Artist filter checks every artist on the track, not just the first |
| 18 | Album filter, substring | POP GIRL | `skin clear` + `album: POP GIRLS` | included | Case-insensitive substring match against the album name |
| 19 | Combined playlist + artist + album | POP GIRL | `skin clear` + all three filters | included | All three filters are satisfiable together (AND logic) on one track |
| 20 | Filter with no matches | POP GIRL | `skin clear` + `artist: Nonexistent Artist` | `[]` | Filters gate results even when the phrase itself matches |
| 21 | Decoy never appears | Get Up | several unrelated queries | never in results | Negative control -- catches a bug that accidentally returns everything |
| 22 | Empty query | none | `""` | `[]` | Guard clause on an empty string |
| 23 | Whitespace-only query | none | `"   "` | `[]` | Guard clause trims before checking |
| 24 | Query longer than any text | none | a long nonsense phrase | `[]` | Sliding-window bounds must not error when the query is longer than the text |
| 25 | Sort order | Beggin', Beg for You | `beg` | descending `matchCount` | Most-relevant-first ranking |

## Known quirk

| Quirk | Where it shows up | Why it matters |
|---|---|---|
| A trailing apostrophe is part of the word token (`beggin'`, `won't`) | Beggin' vs Beg for You (row 2) | This is existing `search.js` behavior (tokenizer regex is `[a-z0-9']+`), called out explicitly so it reads as documented, not accidentally passing |
