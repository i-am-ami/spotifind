import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { search } from './search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Overridable so tests can point at fixture data (or a broken/missing
// file, to test the error path) instead of the real library.
const PLAYLISTS_PATH = process.env.SPOTIFIND_PLAYLISTS_PATH
  ? new URL(`file://${process.env.SPOTIFIND_PLAYLISTS_PATH}`)
  : new URL('../data/playlists.json', import.meta.url);

const PORT = process.env.PORT || 8000;

export const app = express();

app.use(express.static(path.join(__dirname, '../webapp')));

app.get('/api/playlists', (req, res) => {
  try {
    const playlists = JSON.parse(fs.readFileSync(PLAYLISTS_PATH));
    res.json(playlists);
  } catch (err) {
    res.status(500).json({ error: 'Could not load playlists.' });
  }
});

app.get('/api/search', (req, res) => {
  const { q, playlist, artist, album } = req.query;

  if (q !== undefined && typeof q !== 'string') {
    return res.status(400).json({ error: 'q must be a single string.' });
  }

  if (!q || !q.trim()) {
    return res.json([]);
  }

  try {
    const results = search({ query: q, playlistId: playlist, artist, album });
    res.json(results);
  } catch (err) {
    console.error('Search failed:', err);
    res.status(500).json({ error: 'Search failed.' });
  }
});

// Allow running directly (`npm run server`) without binding a port when
// merely imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => {
    console.log(`Spotifind server running at http://localhost:${PORT}`);
  });
}
