import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchLyrics, parseSyncedLyrics } from '../backend/lrclib.js';

// ---- parseSyncedLyrics -------------------------------------------------

test('parseSyncedLyrics: parses a normal multi-line LRC block', () => {
  const lrc = '[00:12.34]First line\n[00:15.67]Second line';
  assert.deepEqual(parseSyncedLyrics(lrc), [
    { time: 12.34, text: 'First line' },
    { time: 15.67, text: 'Second line' },
  ]);
});

test('parseSyncedLyrics: a line with multiple timestamps repeats the text at each time', () => {
  const lrc = '[00:12.00][00:45.00]Chorus line';
  assert.deepEqual(parseSyncedLyrics(lrc), [
    { time: 12, text: 'Chorus line' },
    { time: 45, text: 'Chorus line' },
  ]);
});

test('parseSyncedLyrics: metadata tags are skipped, not parsed as timestamps', () => {
  const lrc = '[ar:Some Artist]\n[ti:Some Title]\n[00:01.00]Actual lyric';
  assert.deepEqual(parseSyncedLyrics(lrc), [{ time: 1, text: 'Actual lyric' }]);
});

test('parseSyncedLyrics: null/empty input returns null', () => {
  assert.equal(parseSyncedLyrics(null), null);
  assert.equal(parseSyncedLyrics(''), null);
  assert.equal(parseSyncedLyrics(undefined), null);
});

test('parseSyncedLyrics: handles both 2-digit (hundredths) and 3-digit (millisecond) fractions', () => {
  const lrc = '[00:01.50]Two-digit\n[00:02.500]Three-digit';
  assert.deepEqual(parseSyncedLyrics(lrc), [
    { time: 1.5, text: 'Two-digit' },
    { time: 2.5, text: 'Three-digit' },
  ]);
});

test('parseSyncedLyrics: out-of-order source lines are sorted by time', () => {
  const lrc = '[00:30.00]Later line\n[00:05.00]Earlier line';
  assert.deepEqual(parseSyncedLyrics(lrc), [
    { time: 5, text: 'Earlier line' },
    { time: 30, text: 'Later line' },
  ]);
});

test('parseSyncedLyrics: a timestamp with no following text keeps an empty-string entry', () => {
  const lrc = '[00:10.00]';
  assert.deepEqual(parseSyncedLyrics(lrc), [{ time: 10, text: '' }]);
});

test('parseSyncedLyrics: minutes past 59 accumulate correctly', () => {
  const lrc = '[75:00.00]Long track line';
  assert.deepEqual(parseSyncedLyrics(lrc), [{ time: 75 * 60, text: 'Long track line' }]);
});

// ---- fetchLyrics --------------------------------------------------------

function mockFetchOnce(t, handler) {
  t.mock.method(globalThis, 'fetch', handler);
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('fetchLyrics: throws when duration is missing, without making a request', async (t) => {
  let called = false;
  mockFetchOnce(t, async () => {
    called = true;
    throw new Error('should not be called');
  });

  await assert.rejects(() => fetchLyrics('Song', 'Artist', 'Album', undefined), /Missing duration/);
  assert.equal(called, false);
});

test('fetchLyrics: a full match returns lyrics and parsed synced lyrics', async (t) => {
  mockFetchOnce(t, async () =>
    jsonResponse(200, {
      id: 42,
      trackName: 'Matched Title',
      artistName: 'Matched Artist',
      instrumental: false,
      plainLyrics: 'Line one\nLine two',
      syncedLyrics: '[00:01.00]Line one\n[00:04.00]Line two',
    })
  );

  const result = await fetchLyrics('Song', 'Artist', 'Album', 180000);
  assert.deepEqual(result, {
    lrclibId: 42,
    matchedTitle: 'Matched Title',
    matchedArtist: 'Matched Artist',
    lyrics: 'Line one\nLine two',
    syncedLyrics: [
      { time: 1, text: 'Line one' },
      { time: 4, text: 'Line two' },
    ],
  });
});

test('fetchLyrics: plainLyrics present but no syncedLyrics from the API', async (t) => {
  mockFetchOnce(t, async () =>
    jsonResponse(200, {
      id: 1,
      trackName: 'Title',
      artistName: 'Artist',
      instrumental: false,
      plainLyrics: 'Some lyrics',
      // syncedLyrics omitted entirely, as LRCLIB does for unsynced-only tracks
    })
  );

  const result = await fetchLyrics('Song', 'Artist', 'Album', 180000);
  assert.equal(result.lyrics, 'Some lyrics');
  assert.equal(result.syncedLyrics, null);
});

test('fetchLyrics: instrumental tracks return null even if lyrics fields are present', async (t) => {
  mockFetchOnce(t, async () =>
    jsonResponse(200, {
      id: 1,
      trackName: 'Title',
      artistName: 'Artist',
      instrumental: true,
      plainLyrics: 'should be ignored',
    })
  );

  assert.equal(await fetchLyrics('Song', 'Artist', 'Album', 180000), null);
});

test('fetchLyrics: missing plainLyrics (not instrumental) returns null', async (t) => {
  mockFetchOnce(t, async () =>
    jsonResponse(200, {
      id: 1,
      trackName: 'Title',
      artistName: 'Artist',
      instrumental: false,
      plainLyrics: '',
    })
  );

  assert.equal(await fetchLyrics('Song', 'Artist', 'Album', 180000), null);
});

test('fetchLyrics: a 404 (no match) returns null, not an error', async (t) => {
  mockFetchOnce(t, async () => new Response(null, { status: 404 }));
  assert.equal(await fetchLyrics('Song', 'Artist', 'Album', 180000), null);
});

test('fetchLyrics: a non-404 error status throws', async (t) => {
  mockFetchOnce(t, async () => new Response(null, { status: 500 }));
  await assert.rejects(
    () => fetchLyrics('Song', 'Artist', 'Album', 180000),
    /LRCLIB \/get failed \(500\)/
  );
});

test('fetchLyrics: request includes track/artist/duration and album params', async (t) => {
  let capturedUrl;
  mockFetchOnce(t, async (url) => {
    capturedUrl = url;
    return jsonResponse(200, {
      id: 1,
      trackName: 'Title',
      artistName: 'Artist',
      instrumental: false,
      plainLyrics: 'lyrics',
    });
  });

  await fetchLyrics('My Song', 'My Artist', 'My Album', 185000);

  const parsed = new URL(capturedUrl);
  assert.equal(parsed.searchParams.get('track_name'), 'My Song');
  assert.equal(parsed.searchParams.get('artist_name'), 'My Artist');
  assert.equal(parsed.searchParams.get('album_name'), 'My Album');
  assert.equal(parsed.searchParams.get('duration'), '185'); // rounded from ms to whole seconds
});

test('fetchLyrics: album param is omitted when no album is given', async (t) => {
  let capturedUrl;
  mockFetchOnce(t, async (url) => {
    capturedUrl = url;
    return jsonResponse(200, {
      id: 1,
      trackName: 'Title',
      artistName: 'Artist',
      instrumental: false,
      plainLyrics: 'lyrics',
    });
  });

  await fetchLyrics('My Song', 'My Artist', null, 185000);

  const parsed = new URL(capturedUrl);
  assert.equal(parsed.searchParams.has('album_name'), false);
});
