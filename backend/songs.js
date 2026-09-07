import fs from 'fs';
import { getSpotifyApi } from './spotauth.js';

const SONG_DATA_PATH = new URL('../data/songs.json', import.meta.url);
const PLAYLISTS_PATH = new URL('../data/playlists.json', import.meta.url);
const PAGE_SIZE = 50;

async function getAllSavedTracks(spotifyApi) {
  const tracks = [];
  let offset = 0;

  while (true) {
    const res = await spotifyApi.getMySavedTracks({ limit: PAGE_SIZE, offset });
    tracks.push(...res.body.items.map((item) => item.track));
    offset += PAGE_SIZE;
    if (res.body.items.length < PAGE_SIZE) break;
  }

  return tracks;
}

async function getAllPlaylists(spotifyApi) {
  const playlists = [];
  let offset = 0;

  while (true) {
    const res = await spotifyApi.getUserPlaylists({ limit: PAGE_SIZE, offset });
    playlists.push(...res.body.items);
    offset += PAGE_SIZE;
    if (res.body.items.length < PAGE_SIZE) break;
  }

  return playlists;
}

async function getPlaylistTracks(spotifyApi, playlistId) {
  const tracks = [];
  let offset = 0;
  const accessToken = spotifyApi.getAccessToken();
 
  while (true) {
    const url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
 
    if (!res.ok) {
      throw new Error(`Failed to fetch playlist items (${res.status}) for playlist ${playlistId}`);
    }
 
    const body = await res.json();
    // Field renamed too: items[].track -> items[].item
    tracks.push(...body.items.map((entry) => entry.item ?? entry.track).filter(Boolean));
    offset += PAGE_SIZE;
    if (body.items.length < PAGE_SIZE) break;
  }
 
  return tracks;
}

async function main() {
  const spotifyApi = await getSpotifyApi();

  console.log('Fetching saved (liked) tracks...');
  const savedTracks = await getAllSavedTracks(spotifyApi);
  console.log(`Found ${savedTracks.length} saved tracks.`);

  console.log('Fetching playlists...');
  const playlists = await getAllPlaylists(spotifyApi);
  console.log(`Found ${playlists.length} playlists.`);

  // Track each track alongside where it came from, so membership survives dedup.
  const entries = savedTracks.map((track) => ({ track, source: { type: 'liked' } }));
  const fetchedPlaylists = [];

  for (const playlist of playlists) {
    console.log(`Fetching tracks for playlist "${playlist.name}"...`);
	//if getPlaylistTracks fails, it will throw an error and stop the script. We can catch that error and continue with the next playlist.
    try {
		const playlistTracks = await getPlaylistTracks(spotifyApi, playlist.id);
		for (const track of playlistTracks) {
			entries.push({ track, source: { type: 'playlist', id: playlist.id, name: playlist.name } });
		}
		fetchedPlaylists.push(playlist);
	} catch (err) {
      console.error(`Error fetching tracks for playlist "${playlist.name}":`, err);
    }
  }


  // Dedupe by Spotify track ID, skipping local files/episodes that lack
  // the name/artist/duration lrclib needs to look up lyrics. Merge playlist
  // membership across all occurrences of the same track.
  const uniqueTracks = new Map();
  for (const { track, source } of entries) {
    if (!track?.id) continue;
    if (!track.name || !track.artists?.length || !track.duration_ms) continue;

    if (!uniqueTracks.has(track.id)) {
      uniqueTracks.set(track.id, {
        id: track.id,
        name: track.name,
        artists: track.artists.map((a) => a.name),
        album: track.album?.name ?? null,
        duration_ms: track.duration_ms ?? null,
        spotifyUrl: track.external_urls?.spotify ?? null,
        liked: false,
        playlists: [],
      });
    }

    const entry = uniqueTracks.get(track.id);
    if (source.type === 'liked') {
      entry.liked = true;
    } else if (!entry.playlists.some((p) => p.id === source.id)) {
      entry.playlists.push({ id: source.id, name: source.name });
    }
  }

  const library = Array.from(uniqueTracks.values());
  fs.mkdirSync(new URL('../data', import.meta.url), { recursive: true });
  fs.writeFileSync(SONG_DATA_PATH, JSON.stringify(library, null, 2));
  fs.writeFileSync(
    PLAYLISTS_PATH,
    JSON.stringify(fetchedPlaylists.map((p) => ({ id: p.id, name: p.name })), null, 2)
  );

  console.log(`Saved ${library.length} unique tracks to data/songs.json`);
  console.log(`Saved ${fetchedPlaylists.length} playlists to data/playlists.json`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});