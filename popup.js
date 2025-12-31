/**
 * Quick Search - Chrome Extension
 * Command Palette style fuzzy search for tabs, bookmarks, and history
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
  MAX_RESULTS: 50,
  RECENT_ITEMS: 8,
  HISTORY_DAYS: 30,
  FUSE_OPTIONS: {
    threshold: 0.4,
    includeMatches: true,
    ignoreLocation: true,
    keys: [
      { name: "title", weight: 2 },
      { name: "url", weight: 1 },
    ],
  },
};

// ============================================
// State
// ============================================
let allItems = [];
let fuse = null;
let selectedIndex = 0;
let currentResults = [];

// ============================================
// DOM Elements
// ============================================
const searchInput = document.getElementById("searchInput");
const clearBtn = document.getElementById("clearBtn");
const resultsContainer = document.getElementById("resultsContainer");
const emptyState = document.getElementById("emptyState");
const noResults = document.getElementById("noResults");
const resultsList = document.getElementById("resultsList");
const recentList = document.getElementById("recentList");
const googleSearchLink = document.getElementById("googleSearchLink");
const googleSearchQuery = document.getElementById("googleSearchQuery");

// ============================================
// Initialization
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  // Auto-focus input (0ms)
  searchInput.focus();

  // Load all data
  await loadAllData();

  // Initialize Fuse.js
  fuse = new Fuse(allItems, CONFIG.FUSE_OPTIONS);

  // Load recent items for empty state
  await loadRecentItems();

  // Setup event listeners
  setupEventListeners();
});

// ============================================
// Data Loading
// ============================================
async function loadAllData() {
  const [tabs, bookmarks, history] = await Promise.all([
    loadTabs(),
    loadBookmarks(),
    loadHistory(),
  ]);

  allItems = [...tabs, ...bookmarks, ...history];
}

async function loadTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    return tabs.map((tab) => ({
      type: "tab",
      title: tab.title || "Untitled",
      url: tab.url || "",
      tabId: tab.id,
      windowId: tab.windowId,
      icon: "📑",
    }));
  } catch (e) {
    console.error("Error loading tabs:", e);
    return [];
  }
}

async function loadBookmarks() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const bookmarks = [];

    function traverse(nodes, path = "") {
      for (const node of nodes) {
        if (node.url) {
          bookmarks.push({
            type: "bookmark",
            title: node.title || "Untitled",
            url: node.url,
            path: path,
            icon: "⭐",
          });
        }
        if (node.children) {
          traverse(
            node.children,
            path ? `${path} / ${node.title}` : node.title
          );
        }
      }
    }

    traverse(tree);
    return bookmarks;
  } catch (e) {
    console.error("Error loading bookmarks:", e);
    return [];
  }
}

async function loadHistory() {
  try {
    const endTime = Date.now();
    const startTime = endTime - CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1000;

    const historyItems = await chrome.history.search({
      text: "",
      startTime,
      endTime,
      maxResults: 500,
    });

    return historyItems.map((item) => ({
      type: "history",
      title: item.title || item.url || "Untitled",
      url: item.url || "",
      lastVisit: item.lastVisitTime,
      icon: "📄",
    }));
  } catch (e) {
    console.error("Error loading history:", e);
    return [];
  }
}

async function loadRecentItems() {
  try {
    const historyItems = await chrome.history.search({
      text: "",
      startTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
      maxResults: CONFIG.RECENT_ITEMS,
    });

    recentList.innerHTML = historyItems
      .map(
        (item) => `
      <li class="recent-item" data-url="${escapeHtml(item.url)}">
        <span class="result-icon">📄</span>
        <span class="result-title">${escapeHtml(item.title || item.url)}</span>
      </li>
    `
      )
      .join("");

    // Add click handlers for recent items
    recentList.querySelectorAll(".recent-item").forEach((el) => {
      el.addEventListener("click", () => {
        const url = el.dataset.url;
        if (url) chrome.tabs.create({ url });
      });
    });
  } catch (e) {
    console.error("Error loading recent items:", e);
  }
}

// ============================================
// Event Listeners
// ============================================
function setupEventListeners() {
  // Search input
  searchInput.addEventListener("input", handleSearch);

  // Clear button
  clearBtn.addEventListener("click", clearSearch);

  // Keyboard navigation
  document.addEventListener("keydown", handleKeydown);
}

function handleSearch() {
  const query = searchInput.value.trim();

  // Toggle clear button
  clearBtn.classList.toggle("visible", query.length > 0);

  if (query.length === 0) {
    showEmptyState();
    return;
  }

  // Perform fuzzy search
  let results = fuse.search(query);

  // Apply smart sorting
  results = smartSort(results, query);

  // Limit results
  results = results.slice(0, CONFIG.MAX_RESULTS);

  if (results.length === 0) {
    showNoResults(query);
    return;
  }

  currentResults = results;
  selectedIndex = 0;
  renderResults(results);
}

function smartSort(results, query) {
  const queryLower = query.toLowerCase();

  return results.sort((a, b) => {
    const itemA = a.item;
    const itemB = b.item;

    // Check exact match in title
    const exactA = itemA.title.toLowerCase() === queryLower;
    const exactB = itemB.title.toLowerCase() === queryLower;
    if (exactA !== exactB) return exactB - exactA;

    // Check prefix match in title
    const prefixA = itemA.title.toLowerCase().startsWith(queryLower);
    const prefixB = itemB.title.toLowerCase().startsWith(queryLower);
    if (prefixA !== prefixB) return prefixB - prefixA;

    // Check prefix match in URL
    const urlPrefixA = itemA.url.toLowerCase().includes(queryLower);
    const urlPrefixB = itemB.url.toLowerCase().includes(queryLower);
    if (urlPrefixA !== urlPrefixB) return urlPrefixB - urlPrefixA;

    // Fall back to Fuse.js score
    return a.score - b.score;
  });
}

function handleKeydown(e) {
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      navigateResults(1);
      break;
    case "ArrowUp":
      e.preventDefault();
      navigateResults(-1);
      break;
    case "Enter":
      e.preventDefault();
      executeAction();
      break;
    case "Escape":
      e.preventDefault();
      if (searchInput.value) {
        clearSearch();
      } else {
        window.close();
      }
      break;
  }

  // Ctrl+C to copy URL
  if (e.ctrlKey && e.key === "c" && currentResults.length > 0) {
    e.preventDefault();
    const item = currentResults[selectedIndex]?.item;
    if (item?.url) {
      navigator.clipboard.writeText(item.url);
      showToast("URL copied!");
    }
  }
}

function navigateResults(direction) {
  if (currentResults.length === 0) return;

  selectedIndex += direction;

  if (selectedIndex < 0) {
    selectedIndex = currentResults.length - 1;
  } else if (selectedIndex >= currentResults.length) {
    selectedIndex = 0;
  }

  updateSelectedItem();
}

function updateSelectedItem() {
  const items = resultsList.querySelectorAll(".result-item");
  items.forEach((item, index) => {
    item.classList.toggle("active", index === selectedIndex);
  });

  // Scroll into view
  const activeItem = items[selectedIndex];
  if (activeItem) {
    activeItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

function executeAction() {
  if (currentResults.length === 0) return;

  const result = currentResults[selectedIndex];
  if (!result) return;

  const item = result.item;

  if (item.type === "tab") {
    // Switch to existing tab
    chrome.tabs.update(item.tabId, { active: true });
    chrome.windows.update(item.windowId, { focused: true });
    window.close();
  } else {
    // Open URL in new tab
    chrome.tabs.create({ url: item.url });
    window.close();
  }
}

function clearSearch() {
  searchInput.value = "";
  clearBtn.classList.remove("visible");
  showEmptyState();
  searchInput.focus();
}

// ============================================
// Rendering
// ============================================
function renderResults(results) {
  emptyState.classList.add("hidden");
  noResults.classList.add("hidden");
  resultsList.classList.remove("hidden");

  resultsList.innerHTML = results
    .map((result, index) => {
      const item = result.item;
      const matches = result.matches || [];

      // Highlight title
      const titleMatch = matches.find((m) => m.key === "title");
      const highlightedTitle = titleMatch
        ? highlightMatches(item.title, titleMatch.indices)
        : escapeHtml(item.title);

      // Highlight URL
      const urlMatch = matches.find((m) => m.key === "url");
      const highlightedUrl = urlMatch
        ? highlightMatches(item.url, urlMatch.indices)
        : escapeHtml(formatUrl(item.url));

      return `
      <li class="result-item ${index === selectedIndex ? "active" : ""}" 
          data-index="${index}">
        <span class="result-icon">${item.icon}</span>
        <div class="result-content">
          <div class="result-title">${highlightedTitle}</div>
          <div class="result-url">${highlightedUrl}</div>
        </div>
      </li>
    `;
    })
    .join("");

  // Add click handlers
  resultsList.querySelectorAll(".result-item").forEach((el) => {
    el.addEventListener("click", () => {
      selectedIndex = parseInt(el.dataset.index, 10);
      executeAction();
    });

    el.addEventListener("mouseenter", () => {
      selectedIndex = parseInt(el.dataset.index, 10);
      updateSelectedItem();
    });
  });
}

function highlightMatches(text, indices) {
  if (!indices || indices.length === 0) {
    return escapeHtml(text);
  }

  // Sort indices and merge overlapping
  const sortedIndices = [...indices].sort((a, b) => a[0] - b[0]);

  let result = "";
  let lastIndex = 0;

  for (const [start, end] of sortedIndices) {
    // Add non-highlighted text before this match
    if (start > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, start));
    }

    // Add highlighted match
    result += `<span class="highlight">${escapeHtml(
      text.slice(start, end + 1)
    )}</span>`;
    lastIndex = end + 1;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result;
}

function showEmptyState() {
  emptyState.classList.remove("hidden");
  noResults.classList.add("hidden");
  resultsList.classList.add("hidden");
  currentResults = [];
  selectedIndex = 0;
}

function showNoResults(query) {
  emptyState.classList.add("hidden");
  noResults.classList.remove("hidden");
  resultsList.classList.add("hidden");

  googleSearchQuery.textContent = query;
  googleSearchLink.href = `https://www.google.com/search?q=${encodeURIComponent(
    query
  )}`;

  currentResults = [];
  selectedIndex = 0;
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--text-primary);
    color: var(--bg-primary);
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 13px;
    z-index: 1000;
    animation: fadeIn 0.2s ease;
  `;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 1500);
}

// ============================================
// Utilities
// ============================================
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.hostname +
      parsed.pathname.slice(0, 50) +
      (parsed.pathname.length > 50 ? "..." : "")
    );
  } catch {
    return url.slice(0, 60) + (url.length > 60 ? "..." : "");
  }
}
