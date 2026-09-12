import fs from 'fs';

// Overridable so tests can point at fixture data instead of the real
// (constantly-changing) library.
const SONGS_PATH = process.env.SPOTIFIND_SONGS_PATH
  ? new URL(`file://${process.env.SPOTIFIND_SONGS_PATH}`)
  : new URL('../data/songs.json', import.meta.url);
const LYRICS_PATH = process.env.SPOTIFIND_LYRICS_PATH
  ? new URL(`file://${process.env.SPOTIFIND_LYRICS_PATH}`)
  : new URL('../data/lyrics.json', import.meta.url);

const WORD_RE = /[a-z0-9']+/g;

let cache = null;

function loadData() {
  if (cache) return cache;

  const songs = JSON.parse(fs.readFileSync(SONGS_PATH));
  const lyricsMap = JSON.parse(fs.readFileSync(LYRICS_PATH));

  cache = songs.map((song) => ({ ...song, lyrics: lyricsMap[song.id]?.lyrics ?? null }));

  return cache;
}

// Tokenizes text into lowercase words, treating punctuation and line
// breaks (and any run of whitespace) alike as separators, with each
// token's offset in the original string so we can pull a snippet back
// out around a match.
function tokenize(text) {
  const tokens = [];
  let match;
  WORD_RE.lastIndex = 0;
  while ((match = WORD_RE.exec(text.toLowerCase())) !== null) {
    tokens.push({ word: match[0], start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

// Finds every place queryTokens appears as a contiguous run of words
// inside text (word order matters -- "love you" will not match "love
// who you are"), and returns the line(s) of the original text
// surrounding each match. In exact mode each word must match in full;
// otherwise a query word matches any text word it's a prefix of (so
// "beg" matches "begged").
function findMatches(text, queryTokens, exact) {
  const matches = [];
  if (!text || queryTokens.length === 0) return matches;

  const textTokens = tokenize(text);

  for (let i = 0; i <= textTokens.length - queryTokens.length; i++) {
    let isMatch = true;
    for (let j = 0; j < queryTokens.length; j++) {
      const word = textTokens[i + j].word;
      const wordMatches = exact ? word === queryTokens[j] : word.startsWith(queryTokens[j]);
      if (!wordMatches) {
        isMatch = false;
        break;
      }
    }
    if (!isMatch) continue;

    const start = textTokens[i].start;
    const end = textTokens[i + queryTokens.length - 1].end;
    const lineStart = text.lastIndexOf('\n', start) + 1;
    const lineEndIdx = text.indexOf('\n', end);
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;

    matches.push(text.slice(lineStart, lineEnd).trim());
  }

  return matches;
}

// Searches lyrics + title for a phrase match. By default each word
// matches as a prefix (e.g. "beg" matches "begged"); wrapping the whole
// query in double quotes ("beg") requires an exact word match instead.
// Artist/album are filters only -- they never affect whether the
// phrase itself matches.
export function search({ query, playlistId, artist, album }) {
  const raw = (query ?? '').trim();
  const exact = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
  const queryTokens = tokenize(exact ? raw.slice(1, -1) : raw).map((t) => t.word);
  if (queryTokens.length === 0) return [];

  const artistTerm = artist?.trim().toLowerCase();
  const albumTerm = album?.trim().toLowerCase();

  const results = [];

  for (const song of loadData()) {
    if (playlistId && playlistId !== 'spotify') {
      const inPlaylist =
        playlistId === 'liked'
          ? song.liked
          : song.playlists.some((p) => p.id === playlistId);
      if (!inPlaylist) continue;
    }

    if (artistTerm && !song.artists.some((a) => a.toLowerCase().includes(artistTerm))) continue;
    if (albumTerm && !(song.album ?? '').toLowerCase().includes(albumTerm)) continue;

    const titleMatches = findMatches(song.name, queryTokens, exact);
    const lyricMatches = findMatches(song.lyrics, queryTokens, exact);
    if (titleMatches.length === 0 && lyricMatches.length === 0) continue;

    results.push({
      id: song.id,
      title: song.name,
      artist: song.artists.join(', '),
      album: song.album,
      duration_ms: song.duration_ms,
      spotifyUrl: song.spotifyUrl,
      matchCount: titleMatches.length + lyricMatches.length,
      snippet: lyricMatches[0] ?? titleMatches[0],
    });
  }

  results.sort((a, b) => b.matchCount - a.matchCount);
  return results;
}
