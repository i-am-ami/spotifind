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
const pagination = document.getElementById("pagination");

const PAGE_SIZE = 15;

let currentSearch = searchInput.value;
let currentPlaylist = "spotify";
let currentArtist = "";
let currentAlbum = "";
let latestMatches = [];
let currentPage = 1;

const SEARCH_DEBOUNCE_MS = 250;
let searchDebounceTimer = null;

async function loadPlaylists() {
  try {
    const res = await fetch("/api/playlists");
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
  // Mirror the server's tokenizing: pull out just the words from the
  // query so stray punctuation in what the user typed (e.g. "love,")
  // doesn't turn into a literal character the snippet must also contain.
  const words = searchTerm.match(/[a-z0-9']+/gi) || [];
  if (words.length === 0) return text;

  const pattern = words.map(escapeRegExp).join("[^a-zA-Z0-9']+");
  const regex = new RegExp(`(${pattern})`, "gi");
  return text.replace(regex, "<mark>$1</mark>");
}

function formatDuration(ms) {
  if (!ms) return "";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function sortMatches(matches) {
  if (sortSelect.value === "title") {
    return [...matches].sort((a, b) => a.title.localeCompare(b.title));
  }

  if (sortSelect.value === "artist") {
    return [...matches].sort((a, b) => a.artist.localeCompare(b.artist));
  }

  return matches;
}

function renderPagination(totalPages) {
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }

  pagination.innerHTML = `
    <button type="button" id="prevPage" ${currentPage <= 1 ? "disabled" : ""}>‹ Prev</button>
    <span>Page ${currentPage} of ${totalPages}</span>
    <button type="button" id="nextPage" ${currentPage >= totalPages ? "disabled" : ""}>Next ›</button>
  `;

  document.getElementById("prevPage").addEventListener("click", () => {
    currentPage = Math.max(1, currentPage - 1);
    renderResults();
  });

  document.getElementById("nextPage").addEventListener("click", () => {
    currentPage = Math.min(totalPages, currentPage + 1);
    renderResults();
  });
}

function renderResults() {
  const term = currentSearch.trim();
  const matches = sortMatches(latestMatches);

  resultCount.textContent =
    `${matches.length} ${matches.length === 1 ? "song" : "songs"} found`;

  if (!term) {
    results.innerHTML = `
      <div class="empty">
        Type a word or phrase to search ${filterSummary.textContent}.
      </div>
    `;
    pagination.innerHTML = "";
    return;
  }

  if (matches.length === 0) {
    results.innerHTML = `
      <div class="empty">
        No songs found for “${term}” in ${filterSummary.textContent}.
      </div>
    `;
    pagination.innerHTML = "";
    return;
  }

  const totalPages = Math.ceil(matches.length / PAGE_SIZE);
  currentPage = Math.min(currentPage, totalPages);
  const pageMatches = matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  results.innerHTML = pageMatches.map(song => `
    <article class="song-card">
      <div class="cover">${song.title.charAt(0).toUpperCase()}</div>

      <div>
        <h3 class="song-title">${song.title}</h3>
        <p class="artist">${song.artist}</p>
        ${song.album ? `<p class="album">${song.album}</p>` : ""}
      </div>

      <p class="lyric">${highlight(song.snippet ?? "", term)}</p>
      <span class="duration">${formatDuration(song.duration_ms)}</span>
      <a class="play-btn" href="${song.spotifyUrl ?? "#"}" target="_blank" rel="noopener" aria-label="Open ${song.title} on Spotify">▶</a>
    </article>
  `).join("");

  renderPagination(totalPages);
}

async function runSearch() {
  currentPage = 1;
  const term = currentSearch.trim();
  if (!term) {
    latestMatches = [];
    renderResults();
    return;
  }

  const params = new URLSearchParams({ q: term });
  if (currentPlaylist && currentPlaylist !== "spotify") params.set("playlist", currentPlaylist);
  if (currentArtist.trim()) params.set("artist", currentArtist.trim());
  if (currentAlbum.trim()) params.set("album", currentAlbum.trim());

  try {
    const res = await fetch(`/api/search?${params}`);
    if (!res.ok) throw new Error(`Search failed (${res.status})`);
    latestMatches = await res.json();
  } catch (err) {
    console.error("Search error:", err);
    latestMatches = [];
  }

  renderResults();
}

function applySearchNow() {
  clearTimeout(searchDebounceTimer);
  currentSearch = searchInput.value;
  runSearch();
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
  runSearch();
});

artistFilterInput.addEventListener("input", () => {
  currentArtist = artistFilterInput.value;
  updateFilterSummary();
  runSearch();
});

albumFilterInput.addEventListener("input", () => {
  currentAlbum = albumFilterInput.value;
  updateFilterSummary();
  runSearch();
});

sortSelect.addEventListener("change", () => {
  currentPage = 1;
  renderResults();
});

async function init() {
  await loadPlaylists();
  updateClearButton();
  updateFilterSummary();
  runSearch();
}

init();
