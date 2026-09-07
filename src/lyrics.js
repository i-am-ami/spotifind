import fs from 'fs';
import { fetchLyrics } from './lrclib.js';

const LIBRARY_PATH = new URL('../data/songs.json', import.meta.url);
const LYRICS_PATH = new URL('../data/lyrics.json', import.meta.url);

const DELAY_MS = 1000; // be polite to the free API between requests
const SAVE_EVERY = 5; // flush progress periodically so a crash doesn't lose work

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 
 * @param {*} path 
 * @param {*} fallback 
 * @returns 
 */
function loadJson(path, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path));
  } catch {
    return fallback;
  }
}


/**
 * Saves the lyrics map to data/lyrics.json. The map is keyed by Spotify track ID, and each value is an object containing:
 * - title: the track name from Spotify
 * - artist: the first artist name from Spotify
 * - matchedTitle: the track name returned by LRCLIB (may differ in capitalization, punctuation, etc.)
 * - matchedArtist: the artist name returned by LRCLIB (may differ in capitalization, punctuation, etc.)
 * - lyrics: the plain text lyrics returned by LRCLIB, or null if no lyrics were found
 * @param {} lyricsMap 
 */
function saveLyrics(lyricsMap) {
  fs.writeFileSync(LYRICS_PATH, JSON.stringify(lyricsMap, null, 2));
}

/**
 * Main function to fetch lyrics for all tracks in the library.
 */
async function main() {
  const library = loadJson(LIBRARY_PATH, null);
  if (!library) {
    console.error('No data/songs.json found.');
    process.exit(1);
  }

  // Keyed by Spotify track ID so re-runs only fetch what's missing.
  const lyricsMap = loadJson(LYRICS_PATH, {});

  const pending = library.filter((track) => !(track.id in lyricsMap));
  console.log(`${library.length} tracks in library, ${pending.length} need lyrics fetched.`);

  let processed = 0;
  let found = 0;
  for (const track of pending) {
    const artist = track.artists[0];
    try {
      const result = await fetchLyrics(track.name, artist, track.album, track.duration_ms);
      if (result) {
        lyricsMap[track.id] = {
          title: track.name,
          artist,
          matchedTitle: result.matchedTitle,
          matchedArtist: result.matchedArtist,
          lyrics: result.lyrics,
        };
		console.log(`Lyrics found: "${track.name}" - ${artist} (matched: "${result.matchedTitle}" - ${result.matchedArtist})`);
        found++;
      } else {
        lyricsMap[track.id] = { title: track.name, artist, lyrics: null };
        console.log(`No lyrics found: "${track.name}" - ${artist}`);
      }
    } catch (err) {
      console.error(`Error fetching "${track.name}" - ${artist}}\`: ${err.message}`);
    }

    processed++;
    if (processed % SAVE_EVERY === 0) {
      saveLyrics(lyricsMap);
      console.log(`Progress: ${processed}/${pending.length} (saved checkpoint)`);
    }

    await sleep(DELAY_MS);
  }

  saveLyrics(lyricsMap);
  console.log(`Done. Lyrics found for ${found}/${pending.length} newly processed tracks.`);
  console.log(`Total cached: ${Object.keys(lyricsMap).length} tracks -> data/lyrics.json`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});