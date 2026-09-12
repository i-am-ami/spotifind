import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

// Point server.js (and the search.js it imports) at the fixture library.
// Must happen before the dynamic import below, since a static import
// would be hoisted ahead of these assignments.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SPOTIFIND_SONGS_PATH = path.join(__dirname, 'fixtures/songs.json');
process.env.SPOTIFIND_LYRICS_PATH = path.join(__dirname, 'fixtures/lyrics.json');
process.env.SPOTIFIND_PLAYLISTS_PATH = path.join(__dirname, 'fixtures/playlists.json');

const { app } = await import('../backend/server.js');

const PLAYLISTS = {
  COVER_OF_VOGUE: '2GflHCKSH0uhzacsAxUKhn',
  DOG_DAYS: '5ANu6xDrhXMaeNf5Trex39',
};

const TRACKS = {
  DOG_DAYS: '1YLJVmuzeM2YSUkCCaTNUB',
  FIND_GOD: '51RDaTRAEHSitpeucJiHyU',
  POP_GIRL: '1Gc4HLasqihMmsAJQacNuO',
};

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
  const res = await fetch(`${baseUrl}${pathAndQuery}`);
  return res;
}

test('normal search query returns 200 and a JSON array', async () => {
  const res = await get('/api/search?q=beg');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.length > 0);
});

test('missing q param returns 200 and []', async () => {
  const res = await get('/api/search');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('empty q param returns 200 and []', async () => {
  const res = await get('/api/search?q=');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('whitespace-only q param returns 200 and []', async () => {
  const res = await get('/api/search?q=%20%20');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('q + playlist round-trips into search()', async () => {
  const res = await get(`/api/search?q=dog+days&playlist=${PLAYLISTS.DOG_DAYS}`);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.some((r) => r.id === TRACKS.DOG_DAYS));
});

test('q + artist round-trips into search()', async () => {
  const res = await get('/api/search?q=find+god&artist=Dominic+Fike');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.some((r) => r.id === TRACKS.FIND_GOD));
});

test('q + album round-trips into search()', async () => {
  const res = await get('/api/search?q=skin+clear&album=POP+GIRLS');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.some((r) => r.id === TRACKS.POP_GIRL));
});

test('unknown playlist id returns 200 and [], not an error', async () => {
  const res = await get('/api/search?q=beg&playlist=nonexistent');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('unknown artist returns 200 and [], not an error', async () => {
  const res = await get('/api/search?q=beg&artist=nonexistent');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('unknown album returns 200 and [], not an error', async () => {
  const res = await get('/api/search?q=beg&album=nonexistent');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), []);
});

test('a URL-encoded quoted query survives to exact-match mode', async () => {
  const res = await get('/api/search?q=%22beg%22');
  assert.equal(res.status, 200);
  const body = await res.json();
  const beggin = body.find((r) => r.title === "Beggin'");
  assert.equal(beggin, undefined, 'exact "beg" should not match the token "beggin\'"');
});

test('a duplicate q param returns 400', async () => {
  const res = await get('/api/search?q=beg&q=love');
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.ok(body.error);
});

test('GET /api/playlists returns 200 and the fixture playlists', async () => {
  const res = await get('/api/playlists');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.ok(body.some((p) => p.id === PLAYLISTS.DOG_DAYS));
});

test('static files are served from webapp/', async () => {
  const res = await get('/index.html');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /html/);
});

test('static JS files are served with a JS content-type', async () => {
  const res = await get('/app.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /javascript/);
});

test('an unknown static file path returns 404', async () => {
  const res = await get('/does-not-exist.xyz');
  assert.equal(res.status, 404);
});

test('an unknown API route returns 404, not a catch-all', async () => {
  const res = await get('/api/does-not-exist');
  assert.equal(res.status, 404);
});
