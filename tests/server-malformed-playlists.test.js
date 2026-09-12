import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

// Separate process/file from server-errors.test.js on purpose: this one
// exercises JSON.parse throwing on malformed content, not fs.readFileSync
// throwing on a missing file -- a distinct failure path through the same
// try/catch, worth checking on its own.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SPOTIFIND_SONGS_PATH = path.join(__dirname, 'fixtures/songs.json');
process.env.SPOTIFIND_LYRICS_PATH = path.join(__dirname, 'fixtures/lyrics.json');
process.env.SPOTIFIND_PLAYLISTS_PATH = path.join(__dirname, 'fixtures/broken-playlists.json');

const { app } = await import('../backend/server.js');

let server;
let baseUrl;

before(async () => {
  server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
});

test('malformed JSON in the playlists file returns 500 with a clean error body', async () => {
  const res = await fetch(`${baseUrl}/api/playlists`);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Could not load playlists.' });
});
