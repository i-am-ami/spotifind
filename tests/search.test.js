import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
import { fileURLToPath } from 'url';

// Point search.js at the fixture library instead of the real (constantly
// changing) one. Must happen before the dynamic import below, since a
// static import would be hoisted ahead of these assignments.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.SPOTIFIND_SONGS_PATH = path.join(__dirname, 'fixtures/songs.json');
process.env.SPOTIFIND_LYRICS_PATH = path.join(__dirname, 'fixtures/lyrics.json');

const { search } = await import('../backend/search.js');

// Track/playlist IDs from tests/fixtures -- see fixtures/README.md for
// what each one is meant to test. Kept as maps so new fixture entries
// just add a line here.
const TRACKS = {
  BEGGIN: '3Wrjm47oTz2sjIgck11l5e',
  BEG_FOR_YOU: '11M8c9SHQYpd8DOrmcu25k',
  PETAL: '70pVCVMGjmIWPbWXDwf11e',
  POP_GIRL: '1Gc4HLasqihMmsAJQacNuO',
  FIND_GOD: '51RDaTRAEHSitpeucJiHyU',
  DOG_DAYS: '1YLJVmuzeM2YSUkCCaTNUB',
  GET_UP: '1wUnuiXMMvhudmzvcCtlZP',
};

const PLAYLISTS = {
  COVER_OF_VOGUE: '2GflHCKSH0uhzacsAxUKhn',
  DOG_DAYS: '5ANu6xDrhXMaeNf5Trex39',
};

function idsOf(results) {
  return results.map((r) => r.id);
}

test('prefix matching: unquoted "beg" matches "beggin\'"', () => {
  const ids = idsOf(search({ query: 'beg' }));
  assert.ok(ids.includes(TRACKS.BEGGIN));
  assert.ok(ids.includes(TRACKS.BEG_FOR_YOU));
});

test('exact quoted match: "beg" in quotes only matches the standalone word', () => {
  const ids = idsOf(search({ query: '"beg"' }));
  assert.ok(ids.includes(TRACKS.BEG_FOR_YOU));
  assert.ok(
    !ids.includes(TRACKS.BEGGIN),
    "Beggin' should not exact-match quoted \"beg\" since its token is \"beggin'\" (apostrophe included)"
  );
});

test('punctuation directly touching a match word does not block it', () => {
  const ids = idsOf(search({ query: 'beg for you' }));
  assert.ok(ids.includes(TRACKS.BEG_FOR_YOU), 'should match despite parens directly touching some occurrences');
});

test('case-insensitivity: lowercase query matches a capitalized lyric word', () => {
  const ids = idsOf(search({ query: 'skin clear' }));
  assert.ok(ids.includes(TRACKS.POP_GIRL));
});

test('a phrase spanning a line break still matches', () => {
  const ids = idsOf(search({ query: 'again they' }));
  assert.ok(ids.includes(TRACKS.PETAL));
});

test('non-adjacent words do not match -- word order/adjacency is required', () => {
  const ids = idsOf(search({ query: 'need to save' }));
  assert.ok(!ids.includes(TRACKS.PETAL), '"need someone to save" should not match query "need to save"');
});

test('a repeated phrase produces matchCount > 1', () => {
  const track = search({ query: "heartbreak won't bite" }).find((r) => r.id === TRACKS.PETAL);
  assert.ok(track);
  assert.equal(track.matchCount, 2);
});

test('a hyphen acts as a word separator', () => {
  const ids = idsOf(search({ query: 'iced out' }));
  assert.ok(ids.includes(TRACKS.POP_GIRL));
});

test('numbers are searchable tokens', () => {
  const ids = idsOf(search({ query: '2012' }));
  assert.ok(ids.includes(TRACKS.POP_GIRL));
});

test('overlapping sliding-window matches are counted separately', () => {
  const track = search({ query: 'pop pop' }).find((r) => r.id === TRACKS.POP_GIRL);
  assert.ok(track);
  assert.equal(track.matchCount, 2, '"pop-pop-pop" should yield 2 overlapping matches for a 2-word query');
});

test('a title-only match is found even when lyrics are null', () => {
  const track = search({ query: 'find god' }).find((r) => r.id === TRACKS.FIND_GOD);
  assert.ok(track);
  assert.equal(track.snippet, 'FIND GOD (feat. Dominic Fike)');
});

test('title + lyrics both matching sums matchCount and prefers the lyric snippet', () => {
  const track = search({ query: 'petal' }).find((r) => r.id === TRACKS.PETAL);
  assert.ok(track);
  assert.equal(track.matchCount, 3, '1 title match + 2 lyric matches ("Petal in the pavement" x2)');
  assert.equal(track.snippet, 'Petal in the pavement');
});

test('liked filter excludes liked:false songs', () => {
  const ids = idsOf(search({ query: 'dog days', playlistId: 'liked' }));
  assert.ok(!ids.includes(TRACKS.DOG_DAYS));
});

test('liked filter includes liked:true songs', () => {
  const ids = idsOf(search({ query: 'beg', playlistId: 'liked' }));
  assert.ok(ids.includes(TRACKS.BEG_FOR_YOU));
});

test('playlist filter includes a song that belongs to it', () => {
  const ids = idsOf(search({ query: 'dog days', playlistId: PLAYLISTS.DOG_DAYS }));
  assert.ok(ids.includes(TRACKS.DOG_DAYS));
});

test('playlist filter excludes a matching song when it is in a different playlist', () => {
  const ids = idsOf(search({ query: 'dog days', playlistId: PLAYLISTS.COVER_OF_VOGUE }));
  assert.ok(!ids.includes(TRACKS.DOG_DAYS), 'phrase matches, but the song is not in this playlist');
});

test('artist filter matches a non-first artist in a multi-artist song', () => {
  const ids = idsOf(search({ query: 'find god', artist: 'Dominic Fike' }));
  assert.ok(ids.includes(TRACKS.FIND_GOD));
});

test('album filter matches by substring', () => {
  const ids = idsOf(search({ query: 'skin clear', album: 'POP GIRLS' }));
  assert.ok(ids.includes(TRACKS.POP_GIRL));
});

test('playlist + artist + album filters all apply together', () => {
  const ids = idsOf(
    search({
      query: 'skin clear',
      playlistId: PLAYLISTS.COVER_OF_VOGUE,
      artist: 'BAYLI',
      album: 'POP GIRLS CLUB',
    })
  );
  assert.ok(ids.includes(TRACKS.POP_GIRL));
});

test('a filter that matches no one returns nothing, even if the phrase matches', () => {
  const results = search({ query: 'skin clear', artist: 'Nonexistent Artist' });
  assert.equal(results.length, 0);
});

test('the decoy song never appears for unrelated queries', () => {
  for (const query of ['beg', 'love', 'dog days', 'pop', 'petal', 'find god']) {
    const ids = idsOf(search({ query }));
    assert.ok(!ids.includes(TRACKS.GET_UP), `query "${query}" should not match the decoy song`);
  }
});

test('empty query returns no results', () => {
  assert.deepEqual(search({ query: '' }), []);
});

test('whitespace-only query returns no results', () => {
  assert.deepEqual(search({ query: '   ' }), []);
});

test('a query longer than any fixture text returns no results without erroring', () => {
  const results = search({
    query: 'this phrase has way more words than any fixture title or lyric line contains at all',
  });
  assert.deepEqual(results, []);
});

test('results are sorted by matchCount descending', () => {
  const results = search({ query: 'beg' });
  assert.ok(results.length >= 2);
  for (let i = 1; i < results.length; i++) {
    assert.ok(results[i - 1].matchCount >= results[i].matchCount);
  }
});
