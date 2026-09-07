const BASE_URL = 'https://lrclib.net/api';

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
  };
}