const BASE_URL = 'https://lrclib.net/api';

// Matches one or more leading LRC timestamp tags on a line, e.g.
// "[00:12.34]" or the repeated-line form "[00:12.34][00:45.67]". Doesn't
// match metadata tags like "[ar:Artist]" since those don't start with two
// digits.
const LRC_TAG_RE = /\[(\d{2}):(\d{2})(?:\.(\d+))?\]/g;

/**
 * Parses LRCLIB's LRC-format syncedLyrics string into an array of
 * { time, text } lines, sorted by time. A line can carry multiple
 * timestamps (the line repeats at each one); metadata tags and blank/
 * untimed lines are skipped. Returns null for empty/missing input.
 */
export function parseSyncedLyrics(lrcText) {
  if (!lrcText) return null;

  const lines = [];

  for (const rawLine of lrcText.split('\n')) {
    const times = [];
    let match;
    let lastIndex = 0;
    LRC_TAG_RE.lastIndex = 0;

    while ((match = LRC_TAG_RE.exec(rawLine)) !== null) {
      const [, minutes, seconds, fraction] = match;
      const fractionSeconds = fraction ? Number(fraction) / 10 ** fraction.length : 0;
      times.push(Number(minutes) * 60 + Number(seconds) + fractionSeconds);
      lastIndex = LRC_TAG_RE.lastIndex;
    }

    if (times.length === 0) continue; // metadata tag (e.g. [ar:...]) or untimed line

    const text = rawLine.slice(lastIndex).trim();
    for (const time of times) {
      lines.push({ time, text });
    }
  }

  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/**
 * Fetches lyrics for a track using LRCLIB's /api/get endpoint, which
 * does an exact match by track name, artist name, album name, and
 * duration (in whole seconds) rather than a fuzzy search.
 *
 * Returns null if no exact match is found (404), or throws on other
 * request failures.
 */
export async function fetchLyrics(title, artist, album, durationMs) {
  if (!durationMs) {
    // /api/get requires duration -- without it we can't use this endpoint.
    throw new Error(`Missing duration for "${title}" by ${artist}; cannot use /api/get.`);
  }

  const durationSeconds = Math.round(durationMs / 1000);

  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    duration: String(durationSeconds),
  });
  if (album) params.set('album_name', album);

  const res = await fetch(`${BASE_URL}/get?${params}`);

  if (res.status === 404) {
    return null; // no exact match -- not an error, just nothing found
  }

  if (!res.ok) {
    throw new Error(`LRCLIB /get failed (${res.status}) for "${title}" by ${artist}`);
  }

  const data = await res.json();

  if (data.instrumental || !data.plainLyrics) {
    return null;
  }

  return {
    lrclibId: data.id,
    matchedTitle: data.trackName,
    matchedArtist: data.artistName,
    lyrics: data.plainLyrics,
    syncedLyrics: parseSyncedLyrics(data.syncedLyrics),
  };
}
