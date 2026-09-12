import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

// This file is deliberately separate from server.test.js: node --test runs
// each test file in its own process, so pointing these env vars at broken
// paths here can't leak into (or be overridden by) the happy-path suite's
// valid fixtures -- both files' module-level PATH constants get computed
// fresh, in their own process, from whatever's set here before import.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SPOTIFIND_SONGS_PATH = path.join(__dirname, 'fixtures/does-not-exist.json');
process.env.SPOTIFIND_LYRICS_PATH = path.join(__dirname, 'fixtures/does-not-exist.json');
process.env.SPOTIFIND_PLAYLISTS_PATH = path.join(__dirname, 'fixtures/does-not-exist.json');

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

async function get(pathAndQuery) {
  return fetch(`${baseUrl}${pathAndQuery}`);
}

test('search() throwing (missing songs/lyrics files) returns 500 with a clean error body', async () => {
  const res = await get('/api/search?q=beg');
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Search failed.' });
});

test('a missing playlists file returns 500 with a clean error body', async () => {
  const res = await get('/api/playlists');
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: 'Could not load playlists.' });
});
