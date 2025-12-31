/**
 * Content Script - Spotlight Overlay
 * Injects and controls the Spotlight search interface
 */

// ============================================
// Configuration
// ============================================
const CONFIG = {
  MAX_RESULTS: 50,
  MAX_PAGE_ITEMS: 200,
  FUSE_OPTIONS: {
    threshold: 0.2, // Stricter matching (0 = exact, 1 = match anything)
    includeMatches: true,
    ignoreLocation: false, // Consider position in string
    distance: 100, // How close match must be to expected location
    minMatchCharLength: 2, // Minimum characters that must match
    keys: [
      { name: "title", weight: 2 },
      { name: "url", weight: 1 },
      { name: "content", weight: 0.5 },
    ],
  },
};

// ============================================
// State
// ============================================
let isOpen = false;
let allItems = [];
let pageItems = [];
let currentHostname = "";
let fuse = null;
let selectedIndex = 0;
let currentResults = [];
let overlayElement = null;
let activeHighlight = null;

// ============================================
// Initialize
// ============================================
function init() {
  currentHostname = window.location.hostname;
  createOverlay();
  setupMessageListener();
}

// Listen for messages from background
function setupMessageListener() {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "toggle-spotlight") {
      toggleSpotlight();
      sendResponse({ success: true });
    }
    return true;
  });
}

// ============================================
// Page Content Extraction - Full Visible Text
// ============================================
function extractPageContent() {
  const items = [];
  const currentUrl = window.location.href;
  const baseUrl = window.location.origin;
  const seenTexts = new Set();

  // 1. Extract all visible text blocks
  const textElements = document.querySelectorAll(
    "p, li, td, th, span, div, a, h1, h2, h3, h4, h5, h6, label, button"
  );

  textElements.forEach((el) => {
    // Skip hidden elements
    if (el.offsetParent === null && el.tagName !== "BODY") return;

    // Skip elements inside the spotlight overlay
    if (el.closest("#qs-spotlight-overlay")) return;

    // Get direct text content (not from children for divs/spans to avoid duplication)
    let text = "";
    if (
      [
        "P",
        "LI",
        "TD",
        "TH",
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
        "LABEL",
        "BUTTON",
      ].includes(el.tagName)
    ) {
      text = el.textContent?.trim();
    } else if (el.tagName === "A") {
      text = el.textContent?.trim();
    } else {
      // For div/span, only get direct text nodes
      const directText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .filter((t) => t)
        .join(" ");
      text = directText;
    }

    if (!text || text.length < 3 || text.length > 300) return;

    // Deduplicate
    const textKey = text.toLowerCase().slice(0, 50);
    if (seenTexts.has(textKey)) return;
    seenTexts.add(textKey);

    // Determine icon based on element type
    let icon = "📝";
    let subtitle = "Text on this page";

    if (["H1", "H2", "H3", "H4", "H5", "H6"].includes(el.tagName)) {
      icon = "📍";
      subtitle = `${el.tagName} heading`;
    } else if (el.tagName === "A" && el.href) {
      icon = "🔗";
      subtitle = formatUrl(el.href);
    } else if (
      el.tagName === "BUTTON" ||
      el.getAttribute("role") === "button"
    ) {
      icon = "🔘";
      subtitle = "Button";
    }

    items.push({
      type: "page",
      title: text,
      url: currentUrl,
      content: subtitle,
      icon: icon,
      isCurrentSite: true,
      element: el, // Store reference to element for scrolling
    });
  });

  // 2. Extract internal links
  const links = document.querySelectorAll("a[href]");
  links.forEach((link) => {
    try {
      const href = link.href;
      if (!href || href.startsWith("javascript:") || href.startsWith("#"))
        return;

      const url = new URL(href, baseUrl);
      if (url.hostname !== currentHostname) return;

      const title =
        link.textContent?.trim() ||
        link.title ||
        link.getAttribute("aria-label");
      if (!title || title.length < 2 || title.length > 200) return;

      const textKey = title.toLowerCase().slice(0, 50);
      if (seenTexts.has(textKey)) return;
      seenTexts.add(textKey);

      items.push({
        type: "page",
        title: title,
        url: url.href,
        content: formatUrl(url.href),
        icon: "🔗",
        isCurrentSite: true,
        element: link,
      });
    } catch (e) {
      // Ignore invalid URLs
    }
  });

  // 3. Add current page as first item
  items.unshift({
    type: "page",
    title: document.title || "Current Page",
    url: currentUrl,
    content: "You are here",
    icon: "📄",
    isCurrentSite: true,
    element: null,
  });

  return items.slice(0, CONFIG.MAX_PAGE_ITEMS);
}

// ============================================
// Overlay Creation
// ============================================
function createOverlay() {
  if (document.getElementById("qs-spotlight-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "qs-spotlight-overlay";
  overlay.className = "qs-spotlight-overlay qs-hidden";

  overlay.innerHTML = `
    <div class="qs-spotlight-backdrop"></div>
    <div class="qs-spotlight-container">
      <div class="qs-spotlight-header">
        <span class="qs-spotlight-icon">🔍</span>
        <input 
          type="text" 
          class="qs-spotlight-input" 
          placeholder="Search this page, tabs, bookmarks..."
          autocomplete="off"
          spellcheck="false"
        >
        <button class="qs-spotlight-close" title="Close (Esc)">✕</button>
      </div>
      <div class="qs-spotlight-body">
        <div class="qs-spotlight-loading">Loading...</div>
        <div class="qs-spotlight-empty qs-hidden">
          <div class="qs-empty-icon">⚡</div>
          <div class="qs-empty-text">Type to search</div>
          <div class="qs-empty-hint">Page Text • Tabs • Bookmarks • History</div>
        </div>
        <div class="qs-spotlight-no-results qs-hidden">
          <div class="qs-no-results-icon">🔎</div>
          <div class="qs-no-results-text">No matches found</div>
          <a class="qs-google-link" target="_blank">
            Search Google for "<span class="qs-google-query"></span>"
          </a>
        </div>
        <ul class="qs-spotlight-results qs-hidden"></ul>
      </div>
      <div class="qs-spotlight-footer">
        <span class="qs-hint"><kbd>↑↓</kbd> Navigate</span>
        <span class="qs-hint"><kbd>Enter</kbd> Go to</span>
        <span class="qs-hint"><kbd>Esc</kbd> Close</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlayElement = overlay;
  setupOverlayEvents(overlay);
}

function setupOverlayEvents(overlay) {
  const backdrop = overlay.querySelector(".qs-spotlight-backdrop");
  const closeBtn = overlay.querySelector(".qs-spotlight-close");
  const input = overlay.querySelector(".qs-spotlight-input");

  backdrop.addEventListener("click", closeSpotlight);
  closeBtn.addEventListener("click", closeSpotlight);
  input.addEventListener("input", handleSearch);
  input.addEventListener("keydown", handleKeydown);
}

// ============================================
// Toggle Spotlight
// ============================================
async function toggleSpotlight() {
  if (isOpen) {
    closeSpotlight();
  } else {
    await openSpotlight();
  }
}

async function openSpotlight() {
  if (!overlayElement) createOverlay();

  // Clear any previous highlight
  clearHighlight();

  isOpen = true;
  overlayElement.classList.remove("qs-hidden");

  const input = overlayElement.querySelector(".qs-spotlight-input");
  setTimeout(() => input.focus(), 10);

  showLoading();

  try {
    // Extract page content first
    pageItems = extractPageContent();

    // Fetch browser data
    const data = await chrome.runtime.sendMessage({
      action: "get-search-data",
    });

    // Mark items from current site
    const browserItems = [
      ...(data.tabs || []),
      ...(data.bookmarks || []),
      ...(data.history || []),
    ].map((item) => ({
      ...item,
      isCurrentSite: isCurrentSiteUrl(item.url),
      element: null,
    }));

    // Combine: page items first
    allItems = [...pageItems, ...browserItems];
    fuse = new Fuse(allItems, CONFIG.FUSE_OPTIONS);
    showEmpty();
  } catch (error) {
    console.error("Error loading data:", error);
    allItems = pageItems;
    fuse = new Fuse(allItems, CONFIG.FUSE_OPTIONS);
    showEmpty();
  }

  document.body.style.overflow = "hidden";
}

function isCurrentSiteUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === currentHostname;
  } catch {
    return false;
  }
}

function closeSpotlight() {
  if (!overlayElement) return;

  isOpen = false;
  overlayElement.classList.add("qs-hidden");

  const input = overlayElement.querySelector(".qs-spotlight-input");
  input.value = "";
  currentResults = [];
  selectedIndex = 0;

  document.body.style.overflow = "";
}

// ============================================
// Highlight Management
// ============================================
function clearHighlight() {
  if (activeHighlight) {
    activeHighlight.classList.remove("qs-page-highlight");
    activeHighlight.style.removeProperty("outline");
    activeHighlight.style.removeProperty("outline-offset");
    activeHighlight.style.removeProperty("box-shadow");
    activeHighlight = null;
  }
  // Also remove class from any lingering highlighted elements
  document.querySelectorAll(".qs-page-highlight").forEach((el) => {
    el.classList.remove("qs-page-highlight");
    el.style.removeProperty("outline");
    el.style.removeProperty("outline-offset");
    el.style.removeProperty("box-shadow");
  });
}

function highlightElement(element) {
  clearHighlight();

  if (!element) return;

  // Add highlight class and inline styles directly to element
  element.classList.add("qs-page-highlight");
  element.style.outline = "3px solid #ffc107";
  element.style.outlineOffset = "3px";
  element.style.boxShadow = "0 0 20px rgba(255, 193, 7, 0.6)";

  activeHighlight = element;

  // Auto-remove after animation
  setTimeout(() => {
    clearHighlight();
  }, 3000);
}

// ============================================
// Search
// ============================================
function handleSearch(e) {
  const query = e.target.value.trim();

  if (query.length === 0) {
    showEmpty();
    return;
  }

  if (!fuse) return;

  let results = fuse.search(query);
  results = smartSort(results, query);
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

    // Priority 1: Current site items
    if (itemA.isCurrentSite !== itemB.isCurrentSite) {
      return itemB.isCurrentSite - itemA.isCurrentSite;
    }

    // Priority 2: Page items first
    if (itemA.isCurrentSite && itemB.isCurrentSite) {
      const isPageA = itemA.type === "page";
      const isPageB = itemB.type === "page";
      if (isPageA !== isPageB) return isPageB - isPageA;
    }

    // Priority 3: Exact match
    const exactA = itemA.title.toLowerCase() === queryLower;
    const exactB = itemB.title.toLowerCase() === queryLower;
    if (exactA !== exactB) return exactB - exactA;

    // Priority 4: Prefix match
    const prefixA = itemA.title.toLowerCase().startsWith(queryLower);
    const prefixB = itemB.title.toLowerCase().startsWith(queryLower);
    if (prefixA !== prefixB) return prefixB - prefixA;

    // Priority 5: Fuse score
    return a.score - b.score;
  });
}

// ============================================
// Keyboard Navigation
// ============================================
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
      closeSpotlight();
      break;
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
  const items = overlayElement.querySelectorAll(".qs-result-item");
  items.forEach((item, index) => {
    item.classList.toggle("qs-active", index === selectedIndex);
  });

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

  // Handle page items with element reference - scroll and highlight
  if (item.element) {
    closeSpotlight();

    // Scroll to center of viewport
    item.element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });

    // Highlight after scroll
    setTimeout(() => {
      highlightElement(item.element);
    }, 300);
    return;
  }

  if (item.type === "tab") {
    chrome.runtime.sendMessage({
      action: "switch-to-tab",
      tabId: item.tabId,
      windowId: item.windowId,
    });
  } else if (item.type === "page" && item.url === window.location.href) {
    closeSpotlight();
    return;
  } else {
    chrome.runtime.sendMessage({
      action: "open-url",
      url: item.url,
    });
  }

  closeSpotlight();
}

// ============================================
// Rendering
// ============================================
function showLoading() {
  const body = overlayElement.querySelector(".qs-spotlight-body");
  body.querySelector(".qs-spotlight-loading").classList.remove("qs-hidden");
  body.querySelector(".qs-spotlight-empty").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-no-results").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-results").classList.add("qs-hidden");
}

function showEmpty() {
  const body = overlayElement.querySelector(".qs-spotlight-body");
  body.querySelector(".qs-spotlight-loading").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-empty").classList.remove("qs-hidden");
  body.querySelector(".qs-spotlight-no-results").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-results").classList.add("qs-hidden");
  currentResults = [];
}

function showNoResults(query) {
  const body = overlayElement.querySelector(".qs-spotlight-body");
  body.querySelector(".qs-spotlight-loading").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-empty").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-no-results").classList.remove("qs-hidden");
  body.querySelector(".qs-spotlight-results").classList.add("qs-hidden");

  const googleQuery = body.querySelector(".qs-google-query");
  const googleLink = body.querySelector(".qs-google-link");
  googleQuery.textContent = query;
  googleLink.href = `https://www.google.com/search?q=${encodeURIComponent(
    query
  )}`;

  currentResults = [];
}

function renderResults(results) {
  const body = overlayElement.querySelector(".qs-spotlight-body");
  const resultsList = body.querySelector(".qs-spotlight-results");

  body.querySelector(".qs-spotlight-loading").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-empty").classList.add("qs-hidden");
  body.querySelector(".qs-spotlight-no-results").classList.add("qs-hidden");
  resultsList.classList.remove("qs-hidden");

  resultsList.innerHTML = results
    .map((result, index) => {
      const item = result.item;
      const matches = result.matches || [];

      // Highlight title if matched
      const titleMatch = matches.find((m) => m.key === "title");
      const highlightedTitle = titleMatch
        ? highlightMatches(item.title, titleMatch.indices)
        : escapeHtml(item.title);

      // Highlight URL if matched
      const urlMatch = matches.find((m) => m.key === "url");
      const contentMatch = matches.find((m) => m.key === "content");

      let displayUrl = item.content || formatUrl(item.url);
      let highlightedUrl;

      if (urlMatch) {
        // Highlight the URL
        highlightedUrl = highlightMatches(
          formatUrl(item.url),
          urlMatch.indices
        );
      } else if (contentMatch) {
        // Highlight the content
        highlightedUrl = highlightMatches(
          item.content || "",
          contentMatch.indices
        );
      } else {
        highlightedUrl = escapeHtml(displayUrl);
      }

      const siteBadge =
        item.isCurrentSite && item.type !== "page"
          ? '<span class="qs-site-badge">This site</span>'
          : "";

      return `
      <li class="qs-result-item ${index === selectedIndex ? "qs-active" : ""} ${
        item.isCurrentSite ? "qs-current-site" : ""
      }" data-index="${index}">
        <span class="qs-result-icon">${item.icon}</span>
        <div class="qs-result-content">
          <div class="qs-result-title">${highlightedTitle}${siteBadge}</div>
          <div class="qs-result-url">${highlightedUrl}</div>
        </div>
      </li>
    `;
    })
    .join("");

  resultsList.querySelectorAll(".qs-result-item").forEach((el) => {
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

  const sortedIndices = [...indices].sort((a, b) => a[0] - b[0]);

  let result = "";
  let lastIndex = 0;

  for (const [start, end] of sortedIndices) {
    if (start > lastIndex) {
      result += escapeHtml(text.slice(lastIndex, start));
    }
    result += `<span class="qs-highlight">${escapeHtml(
      text.slice(start, end + 1)
    )}</span>`;
    lastIndex = end + 1;
  }

  if (lastIndex < text.length) {
    result += escapeHtml(text.slice(lastIndex));
  }

  return result;
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
      parsed.pathname.slice(0, 40) +
      (parsed.pathname.length > 40 ? "..." : "")
    );
  } catch {
    return url.slice(0, 50) + (url.length > 50 ? "..." : "");
  }
}

// Initialize
init();
