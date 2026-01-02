/**
 * Content Script - Spotlight Overlay
 * Injects and controls the Spotlight search interface
 */
(function () {
  if (window.hasRunSpotlight) return;
  window.hasRunSpotlight = true;

  // ============================================
  // Configuration
  // ============================================
  const CONFIG = {
    MAX_RESULTS: 50,
    MAX_PAGE_ITEMS: 200,
    FUSE_OPTIONS: {
      threshold: 0.4, // Stricter matching (0 = exact, 1 = match anything)
      includeMatches: true,
      ignoreLocation: true, // Consider position in string
      distance: 100, // How close match must be to expected location
      minMatchCharLength: 2, // Minimum characters that must match
      keys: [
        { name: "title", weight: 2 },
        { name: "displayUrl", weight: 1 },
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
  let typePriority = ["page", "tab", "bookmark", "history"]; // Default priority
  let cachedLocaleMessages = null;
  let cachedLocale = null;
  let lastUsedLanguage = null; // Track the saved language setting
  let currentI18n = {};

  // Helper function to get localized messages with manual override support
  async function getLocalizedMessages() {
    try {
      const settings = await chrome.storage.sync.get("language");
      const lang = settings.language || "auto";

      // Update cache tracking
      lastUsedLanguage = lang;

      // If auto, use Chrome's i18n
      if (lang === "auto") {
        cachedLocale = "auto";
        cachedLocaleMessages = null;
        return {
          searchPlaceholder: chrome.i18n.getMessage("searchPlaceholder"),
          close: chrome.i18n.getMessage("close"),
          loading: chrome.i18n.getMessage("loading"),
          typeToSearch: chrome.i18n.getMessage("typeToSearch"),
          searchHint: chrome.i18n.getMessage("searchHint"),
          noResults: chrome.i18n.getMessage("noResults"),
          searchGoogle: chrome.i18n.getMessage("searchGoogle"),
          navigate: chrome.i18n.getMessage("navigate"),
          goTo: chrome.i18n.getMessage("goTo"),
          settings: chrome.i18n.getMessage("settings"),
          thisSite: chrome.i18n.getMessage("thisSite"),
          tagPage: chrome.i18n.getMessage("tagPage"),
          tagTab: chrome.i18n.getMessage("tagTab"),
          tagBookmark: chrome.i18n.getMessage("tagBookmark"),
          tagHistory: chrome.i18n.getMessage("tagHistory"),
          tagLink: chrome.i18n.getMessage("tagLink"),
          tagHeader: chrome.i18n.getMessage("tagHeader"),
          tagButton: chrome.i18n.getMessage("tagButton"),
          tagText: chrome.i18n.getMessage("tagText"),
          searchMinLength: chrome.i18n.getMessage("searchMinLength"),
          tagHidden: chrome.i18n.getMessage("tagHidden"),
        };
      }

      // If manual language, load from locale file
      if (cachedLocale !== lang) {
        const response = await fetch(
          chrome.runtime.getURL(`_locales/${lang}/messages.json`)
        );
        cachedLocaleMessages = await response.json();
        cachedLocale = lang;
      }

      const msg = (key) =>
        cachedLocaleMessages[key]?.message || chrome.i18n.getMessage(key);

      return {
        searchPlaceholder: msg("searchPlaceholder"),
        close: msg("close"),
        loading: msg("loading"),
        typeToSearch: msg("typeToSearch"),
        searchHint: msg("searchHint"),
        noResults: msg("noResults"),
        searchGoogle: msg("searchGoogle"),
        navigate: msg("navigate"),
        goTo: msg("goTo"),
        settings: msg("settings"),
        thisSite: msg("thisSite"),
        tagPage: msg("tagPage"),
        tagTab: msg("tagTab"),
        tagBookmark: msg("tagBookmark"),
        tagHistory: msg("tagHistory"),
        tagLink: msg("tagLink"),
        tagHeader: msg("tagHeader"),
        tagButton: msg("tagButton"),
        tagText: msg("tagText"),
        searchMinLength: msg("searchMinLength"),
        tagHidden: msg("tagHidden"),
      };
    } catch (e) {
      return {
        searchPlaceholder: chrome.i18n.getMessage("searchPlaceholder"),
        close: chrome.i18n.getMessage("close"),
        loading: chrome.i18n.getMessage("loading"),
        typeToSearch: chrome.i18n.getMessage("typeToSearch"),
        searchHint: chrome.i18n.getMessage("searchHint"),
        noResults: chrome.i18n.getMessage("noResults"),
        searchGoogle: chrome.i18n.getMessage("searchGoogle"),
        navigate: chrome.i18n.getMessage("navigate"),
        goTo: chrome.i18n.getMessage("goTo"),
        settings: chrome.i18n.getMessage("settings"),
        thisSite: chrome.i18n.getMessage("thisSite"),
        tagPage: chrome.i18n.getMessage("tagPage"),
        tagTab: chrome.i18n.getMessage("tagTab"),
        tagBookmark: chrome.i18n.getMessage("tagBookmark"),
        tagHistory: chrome.i18n.getMessage("tagHistory"),
        tagLink: chrome.i18n.getMessage("tagLink"),
        tagHeader: chrome.i18n.getMessage("tagHeader"),
        tagButton: chrome.i18n.getMessage("tagButton"),
        tagText: chrome.i18n.getMessage("tagText"),
        searchMinLength: chrome.i18n.getMessage("searchMinLength"),
        tagHidden: chrome.i18n.getMessage("tagHidden"),
      };
    }
  }

  // ============================================
  // Initialize
  // ============================================
  async function init() {
    currentHostname = window.location.hostname;
    await createOverlay();
    setupMessageListener();
    setupStorageListener();
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

  // Listen for storage changes (language setting)
  function setupStorageListener() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === "sync" && changes.language) {
        // Language setting changed, recreate overlay immediately
        const newLang = changes.language.newValue || "auto";

        // Force rebuild overlay with new language
        if (overlayElement) {
          overlayElement.remove();
          overlayElement = null;
        }
        lastUsedLanguage = null;
        cachedLocale = null;
        cachedLocaleMessages = null;

        // Recreate overlay with new language
        createOverlay();
      }
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
        displayUrl: formatUrl(currentUrl),
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

        const hidden = !isVisible(link);
        const textKey = title.toLowerCase().slice(0, 50);
        if (seenTexts.has(textKey)) return;
        seenTexts.add(textKey);

        items.push({
          type: "page",
          title: title,
          url: url.href,
          displayUrl: formatUrl(url.href),
          content: formatUrl(url.href),
          icon: "🔗",
          isCurrentSite: true,
          element: link,
          isHidden: hidden,
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
      displayUrl: formatUrl(currentUrl),
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
  async function createOverlay() {
    // If overlay already exists in DOM, just get the reference
    const existing = document.getElementById("qs-spotlight-overlay");
    if (existing) {
      overlayElement = existing;
      return;
    }

    const overlay = document.createElement("div");
    overlay.id = "qs-spotlight-overlay";
    overlay.className = "qs-spotlight-overlay qs-hidden";

    // Get i18n messages (with manual language override support)
    currentI18n = await getLocalizedMessages();
    const i18n = currentI18n;

    overlay.innerHTML = `
    <div class="qs-spotlight-backdrop"></div>
    <div class="qs-spotlight-container">
      <div class="qs-spotlight-header">
        <span class="qs-spotlight-icon">🔍</span>
        <input 
          type="text" 
          class="qs-spotlight-input" 
          placeholder="${i18n.searchPlaceholder}"
          autocomplete="off"
          spellcheck="false"
        >
        <button class="qs-spotlight-close" title="${i18n.close} (Esc)">✕</button>
      </div>
      <div class="qs-spotlight-body">
        <div class="qs-spotlight-loading">${i18n.loading}</div>
        <div class="qs-spotlight-empty qs-hidden">
          <div class="qs-empty-icon">⚡</div>
          <div class="qs-empty-text">${i18n.typeToSearch}</div>
          <div class="qs-empty-hint">${i18n.searchHint}</div>
        </div>
        <div class="qs-spotlight-no-results qs-hidden">
          <div class="qs-no-results-icon">🔎</div>
          <div class="qs-no-results-text">${i18n.noResults}</div>
          <a class="qs-google-link" target="_blank">
            ${i18n.searchGoogle} "<span class="qs-google-query"></span>"
          </a>
        </div>
        <ul class="qs-spotlight-results qs-hidden"></ul>
      </div>
      <div class="qs-spotlight-footer">
        <span class="qs-hint"><kbd class="qs-kbd">↑↓</kbd> ${i18n.navigate}</span>
        <span class="qs-hint"><kbd class="qs-kbd">Enter</kbd> ${i18n.goTo}</span>
        <span class="qs-hint"><kbd class="qs-kbd">Esc</kbd> ${i18n.close}</span>
        <button class="qs-settings-btn" title="${i18n.settings}">⚙️</button>
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
    const settingsBtn = overlay.querySelector(".qs-settings-btn");

    backdrop.addEventListener("click", closeSpotlight);
    closeBtn.addEventListener("click", closeSpotlight);
    input.addEventListener("input", handleSearch);
    input.addEventListener("keydown", handleKeydown);

    settingsBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "open-options" });
      closeSpotlight();
    });
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
    // Check if language has changed and recreate overlay if needed
    const settings = await chrome.storage.sync.get("language");
    const currentLang = settings.language || "auto";

    // Compare with lastUsedLanguage to detect changes
    if (lastUsedLanguage !== null && lastUsedLanguage !== currentLang) {
      // Language changed, remove old overlay and recreate
      if (overlayElement) {
        overlayElement.remove();
        overlayElement = null;
      }
    }

    if (!overlayElement) await createOverlay();

    // Clear any previous highlight
    clearHighlight();

    isOpen = true;
    overlayElement.classList.remove("qs-hidden");

    const input = overlayElement.querySelector(".qs-spotlight-input");
    setTimeout(() => input.focus(), 10);

    showLoading();

    try {
      // Load user priority settings
      const settings = await chrome.storage.sync.get("typePriority");
      if (settings.typePriority) {
        typePriority = settings.typePriority;
      }

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
        displayUrl: formatUrl(item.url),
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
      activeHighlight.style.removeProperty("background-color");
      activeHighlight.style.removeProperty("border-radius");
      activeHighlight = null;
    }
    // Also remove class from any lingering highlighted elements
    document.querySelectorAll(".qs-page-highlight").forEach((el) => {
      el.classList.remove("qs-page-highlight");
      el.style.removeProperty("background-color");
      el.style.removeProperty("border-radius");
    });
  }

  function highlightElement(element) {
    clearHighlight();

    if (!element) return;

    // Add highlight with background color only
    element.classList.add("qs-page-highlight");
    element.style.backgroundColor = "rgba(255, 235, 59, 0.5)";
    element.style.borderRadius = "4px";

    activeHighlight = element;

    // Auto-remove after 3 seconds
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

    if (query.length < 2) {
      showMinLengthHint();
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

      // Priority 1: User-defined type priority
      const typeA = itemA.type === "page" ? "page" : itemA.type;
      const typeB = itemB.type === "page" ? "page" : itemB.type;
      const priorityA = typePriority.indexOf(typeA);
      const priorityB = typePriority.indexOf(typeB);

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      // Priority 2: Current site items within same type
      if (itemA.isCurrentSite !== itemB.isCurrentSite) {
        return itemB.isCurrentSite - itemA.isCurrentSite;
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

  async function executeAction() {
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

    // Close spotlight for all navigation actions
    closeSpotlight();

    try {
      if (item.type === "tab") {
        await chrome.runtime.sendMessage({
          action: "switch-to-tab",
          tabId: item.tabId,
          windowId: item.windowId,
        });
      } else if (item.type === "page" && item.url === window.location.href) {
        // Already on the page
        return;
      } else {
        // Bookmarks, History, and other pages -> Open in new tab
        await chrome.runtime.sendMessage({
          action: "open-url",
          url: item.url,
        });
      }
    } catch (e) {
      console.error("Navigation failed:", e);
    }
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

    const textEl = body.querySelector(".qs-empty-text");
    if (textEl) textEl.textContent = currentI18n.typeToSearch;
    currentResults = [];
  }

  function showMinLengthHint() {
    const body = overlayElement.querySelector(".qs-spotlight-body");
    body.querySelector(".qs-spotlight-loading").classList.add("qs-hidden");
    body.querySelector(".qs-spotlight-empty").classList.remove("qs-hidden");
    body.querySelector(".qs-spotlight-no-results").classList.add("qs-hidden");
    body.querySelector(".qs-spotlight-results").classList.add("qs-hidden");

    const textEl = body.querySelector(".qs-empty-text");
    if (textEl) textEl.textContent = currentI18n.searchMinLength;
    currentResults = [];
  }

  function showNoResults(query) {
    const body = overlayElement.querySelector(".qs-spotlight-body");
    body.querySelector(".qs-spotlight-loading").classList.add("qs-hidden");
    body.querySelector(".qs-spotlight-empty").classList.add("qs-hidden");
    body
      .querySelector(".qs-spotlight-no-results")
      .classList.remove("qs-hidden");
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
        const urlMatch = matches.find((m) => m.key === "displayUrl");
        const contentMatch = matches.find((m) => m.key === "content");

        let displayUrl = item.content || item.displayUrl || formatUrl(item.url);
        let highlightedUrl;

        if (urlMatch) {
          // Highlight the URL
          highlightedUrl = highlightMatches(item.displayUrl, urlMatch.indices);
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
            ? `<span class="qs-site-badge">${currentI18n.thisSite}</span>`
            : "";

        const hiddenBadge = item.isHidden
          ? `<span class="qs-hidden-tag">${currentI18n.tagHidden}</span>`
          : "";

        // Determine tag
        let tagClass = "qs-tag-page";
        let tagLabel = currentI18n.tagPage || "Page";

        if (item.type === "tab") {
          tagClass = "qs-tag-tab";
          tagLabel = currentI18n.tagTab || "Tab";
        } else if (item.type === "bookmark") {
          tagClass = "qs-tag-bookmark";
          tagLabel = currentI18n.tagBookmark || "Bookmark";
        } else if (item.type === "history") {
          tagClass = "qs-tag-history";
          tagLabel = currentI18n.tagHistory || "History";
        } else if (item.type === "page") {
          if (item.icon === "🔗") {
            tagClass = "qs-tag-link";
            tagLabel = currentI18n.tagLink || "Link";
          } else if (item.icon === "📍") {
            tagClass = "qs-tag-header";
            tagLabel = currentI18n.tagHeader || "Header";
          } else if (item.icon === "🔘") {
            tagClass = "qs-tag-button";
            tagLabel = currentI18n.tagButton || "Button";
          } else if (item.icon === "📝") {
            tagClass = "qs-tag-text";
            tagLabel = currentI18n.tagText || "Text";
          }
        }

        return `
       <li class="qs-result-item ${
         index === selectedIndex ? "qs-active" : ""
       } ${
          item.type === "page" ? "qs-current-site" : ""
        }" data-index="${index}">
         <span class="qs-type-tag ${tagClass}">${tagLabel}</span>
         <div class="qs-result-content">
          <div class="qs-result-title">${highlightedTitle}${siteBadge}${hiddenBadge}</div>
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
      let formatted = parsed.hostname + parsed.pathname + parsed.search;
      if (formatted.length > 100) {
        formatted = formatted.slice(0, 100) + "...";
      }
      return formatted;
    } catch {
      return url.slice(0, 50) + (url.length > 50 ? "..." : "");
    }
  }

  function isVisible(el) {
    if (!el) return false;
    return !!(
      el.offsetWidth ||
      el.offsetHeight ||
      (el.getClientRects && el.getClientRects().length)
    );
  }

  // Initialize
  init();
})();
