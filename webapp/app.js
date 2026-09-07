// Demo data. Your backend will later replace this with Spotify/lyrics results.
const songs = [
  {
    title: "Love Me Like You Do",
    artist: "Ellie Goulding",
    album: "Fifty Shades of Grey (Original Motion Picture Soundtrack)",
    lyric: "You're the love of my life, you're the air that I breathe...",
    duration: "4:12",
    cover: "♡",
    liked: true,
    playlists: [{ id: "demo-main-character", name: "Main Character" }]
  },
  {
    title: "All of Me",
    artist: "John Legend",
    album: "Love in the Future",
    lyric: "'Cause all of me loves all of you",
    duration: "4:29",
    cover: "☾",
    liked: true,
    playlists: [{ id: "demo-chill", name: "Chill Mix" }]
  },
  {
    title: "Lover",
    artist: "Taylor Swift",
    album: "Lover",
    lyric: "Can I go where you go? Can we always be this close forever?",
    duration: "3:41",
    cover: "🌸",
    liked: true,
    playlists: [{ id: "demo-main-character", name: "Main Character" }]
  },
  {
    title: "The Night We Met",
    artist: "Lord Huron",
    album: "Strange Trails",
    lyric: "I had all and then most of you, some and now none of you",
    duration: "3:28",
    cover: "☁",
    liked: false,
    playlists: [
      { id: "demo-study", name: "Study Playlist" },
      { id: "demo-chill", name: "Chill Mix" }
    ]
  },
  {
    title: "Dreams",
    artist: "Fleetwood Mac",
    album: "Rumours",
    lyric: "Thunder only happens when it's raining, players only love you when they're playing",
    duration: "4:17",
    cover: "✦",
    liked: false,
    playlists: [
      { id: "demo-summer", name: "Summer Songs" },
      { id: "demo-chill", name: "Chill Mix" }
    ]
  },
  {
    title: "Goodbye",
    artist: "Mimi Webb",
    album: "Amelia",
    lyric: "This is goodbye, but I still hear your name in every song",
    duration: "3:02",
    cover: "🌙",
    liked: false,
    playlists: [{ id: "demo-main-character", name: "Main Character" }]
  }
];

const scopeNames = {
  spotify: "All Spotify",
  liked: "Liked Songs"
};

const searchForm = document.getElementById("searchForm");
const searchInput = document.getElementById("searchInput");
const clearButton = document.getElementById("clearButton");
const results = document.getElementById("results");
const resultCount = document.getElementById("resultCount");
const sortSelect = document.getElementById("sortSelect");
const scopeSelect = document.getElementById("scopeSelect");
const artistFilterInput = document.getElementById("artistFilter");
const albumFilterInput = document.getElementById("albumFilter");
const filterSummary = document.getElementById("filterSummary");

let currentSearch = searchInput.value;
let currentPlaylist = "spotify";
let currentArtist = "";
let currentAlbum = "";

const SEARCH_DEBOUNCE_MS = 250;
let searchDebounceTimer = null;

async function loadPlaylists() {
  try {
    const res = await fetch("../data/playlists.json");
    if (!res.ok) throw new Error(`Failed to load playlists (${res.status})`);
    const playlists = await res.json();

    for (const playlist of playlists) {
      scopeNames[playlist.id] = playlist.name;
      const option = document.createElement("option");
      option.value = playlist.id;
      option.textContent = playlist.name;
      scopeSelect.appendChild(option);
    }
  } catch (err) {
    console.error("Could not load playlists:", err);
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text, searchTerm) {
  if (!searchTerm) return text;
  const regex = new RegExp(`(${escapeRegExp(searchTerm)})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

function updateClearButton() {
  clearButton.style.display = searchInput.value.trim() ? "block" : "none";
}

function updateFilterSummary() {
  const parts = [scopeNames[currentPlaylist] ?? "All Spotify"];
  if (currentArtist.trim()) parts.push(`Artist: ${currentArtist.trim()}`);
  if (currentAlbum.trim()) parts.push(`Album: ${currentAlbum.trim()}`);
  filterSummary.textContent = parts.join(" · ");
  scopeSelect.value = currentPlaylist;
}

function getMatches() {
  const term = currentSearch.trim().toLowerCase();
  const artistTerm = currentArtist.trim().toLowerCase();
  const albumTerm = currentAlbum.trim().toLowerCase();
  if (!term) return [];

  return songs.filter(song => {
    const inPlaylist =
      currentPlaylist === "spotify" ||
      (currentPlaylist === "liked"
        ? song.liked
        : song.playlists.some(p => p.id === currentPlaylist));

    const matchesArtist = !artistTerm || song.artist.toLowerCase().includes(artistTerm);
    const matchesAlbum = !albumTerm || (song.album ?? "").toLowerCase().includes(albumTerm);

    const containsSearch =
      song.lyric.toLowerCase().includes(term) ||
      song.title.toLowerCase().includes(term) ||
      song.artist.toLowerCase().includes(term);

    return inPlaylist && matchesArtist && matchesAlbum && containsSearch;
  });
}

function sortMatches(matches) {
  if (sortSelect.value === "title") {
    return [...matches].sort((a, b) => a.title.localeCompare(b.title));
  }

  if (sortSelect.value === "artist") {
    return [...matches].sort((a, b) => a.artist.localeCompare(b.artist));
  }

  return matches;
}

function render() {
  const term = currentSearch.trim();
  const matches = sortMatches(getMatches());

  resultCount.textContent =
    `${matches.length} ${matches.length === 1 ? "song" : "songs"} found`;

  if (!term) {
    results.innerHTML = `
      <div class="empty">
        Type a word or phrase to search ${filterSummary.textContent}.
      </div>
    `;
    return;
  }

  if (matches.length === 0) {
    results.innerHTML = `
      <div class="empty">
        No songs found for “${term}” in ${filterSummary.textContent}.
      </div>
    `;
    return;
  }

  results.innerHTML = matches.map(song => `
    <article class="song-card">
      <div class="cover">${song.cover}</div>

      <div>
        <h3 class="song-title">${song.title}</h3>
        <p class="artist">${song.artist}</p>
      </div>

      <p class="lyric">${highlight(song.lyric, term)}</p>
      <span class="duration">${song.duration}</span>
      <button class="play-btn" type="button" aria-label="Play ${song.title}">▶</button>
    </article>
  `).join("");
}

function applySearchNow() {
  clearTimeout(searchDebounceTimer);
  currentSearch = searchInput.value;
  render();
}

searchForm.addEventListener("submit", event => {
  event.preventDefault();
  applySearchNow();
});

searchInput.addEventListener("input", () => {
  updateClearButton();
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(applySearchNow, SEARCH_DEBOUNCE_MS);
});

clearButton.addEventListener("click", () => {
  searchInput.value = "";
  applySearchNow();
  updateClearButton();
  searchInput.focus();
});

scopeSelect.addEventListener("change", () => {
  currentPlaylist = scopeSelect.value;
  updateFilterSummary();
  render();
});

artistFilterInput.addEventListener("input", () => {
  currentArtist = artistFilterInput.value;
  updateFilterSummary();
  render();
});

albumFilterInput.addEventListener("input", () => {
  currentAlbum = albumFilterInput.value;
  updateFilterSummary();
  render();
});

sortSelect.addEventListener("change", render);

async function init() {
  await loadPlaylists();
  updateClearButton();
  updateFilterSummary();
  render();
}

init();
