import fs from 'fs';
import { getSpotifyApi } from './spotauth.js';

const SONG_DATA_PATH = new URL('../data/songs.json', import.meta.url);
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

  const allTracks = [...savedTracks];

  for (const playlist of playlists) {
    console.log(`Fetching tracks for playlist "${playlist.name}"...`);
	//if getPlaylistTracks fails, it will throw an error and stop the script. We can catch that error and continue with the next playlist.
    try {
		const playlistTracks = await getPlaylistTracks(spotifyApi, playlist.id);
		allTracks.push(...playlistTracks);
	} catch (err) {
      console.error(`Error fetching tracks for playlist "${playlist.name}":`, err);
    }
  }


  // Dedupe by Spotify track ID, skipping local files/episodes that lack
  // the name/artist/duration lrclib needs to look up lyrics.
  const uniqueTracks = new Map();
  for (const track of allTracks) {
    if (!track?.id || uniqueTracks.has(track.id)) continue;
    if (!track.name || !track.artists?.length || !track.duration_ms) continue;
    uniqueTracks.set(track.id, {
      id: track.id,
      name: track.name,
      artists: track.artists.map((a) => a.name),
      album: track.album?.name ?? null,
	  duration_ms: track.duration_ms ?? null,
      spotifyUrl: track.external_urls?.spotify ?? null,
    });
  }

  const library = Array.from(uniqueTracks.values());
  fs.mkdirSync(new URL('../data', import.meta.url), { recursive: true });
  fs.writeFileSync(SONG_DATA_PATH, JSON.stringify(library, null, 2));

  console.log(`Saved ${library.length} unique tracks to data/songs.json`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});