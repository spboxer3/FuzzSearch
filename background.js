/**
 * Background Service Worker
 * Handles Chrome API calls and message passing with content script
 */

// Configuration
const CONFIG = {
  HISTORY_DAYS: 30,
  MAX_HISTORY: 500,
};

// Listen for keyboard shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === "toggle-spotlight") {
    await injectAndToggle();
  }
});

// Listen for extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  await injectAndToggle();
});

// Inject content script if needed and toggle spotlight
async function injectAndToggle() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab?.id) return;

  // Skip chrome:// and other restricted URLs
  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("edge://")
  ) {
    console.log("Cannot inject into restricted page:", tab.url);
    return;
  }

  try {
    // Try to send message first
    await chrome.tabs.sendMessage(tab.id, { action: "toggle-spotlight" });
  } catch (error) {
    // Content script not injected yet, inject it first
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["lib/fuse.min.js", "content.js"],
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["spotlight.css"],
      });
      // Wait a bit for script to initialize, then toggle
      setTimeout(async () => {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: "toggle-spotlight" });
        } catch (e) {
          console.error("Failed to toggle after injection:", e);
        }
      }, 100);
    } catch (injectError) {
      console.error("Failed to inject content script:", injectError);
    }
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get-search-data") {
    getAllSearchData().then(sendResponse);
    return true;
  }

  if (request.action === "switch-to-tab") {
    chrome.tabs.update(request.tabId, { active: true });
    chrome.windows.update(request.windowId, { focused: true });
    sendResponse({ success: true });
    return true;
  }

  if (request.action === "open-url") {
    chrome.tabs.create({ url: request.url });
    sendResponse({ success: true });
    return true;
  }
});

// Fetch all searchable data
async function getAllSearchData() {
  try {
    const [tabs, bookmarks, history] = await Promise.all([
      getTabs(),
      getBookmarks(),
      getHistory(),
    ]);
    return { tabs, bookmarks, history };
  } catch (error) {
    console.error("Error fetching search data:", error);
    return { tabs: [], bookmarks: [], history: [] };
  }
}

async function getTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.map((tab) => ({
    type: "tab",
    title: tab.title || "Untitled",
    url: tab.url || "",
    tabId: tab.id,
    windowId: tab.windowId,
    icon: "📑",
  }));
}

async function getBookmarks() {
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
        traverse(node.children, path ? `${path} / ${node.title}` : node.title);
      }
    }
  }

  traverse(tree);
  return bookmarks;
}

async function getHistory() {
  const endTime = Date.now();
  const startTime = endTime - CONFIG.HISTORY_DAYS * 24 * 60 * 60 * 1000;

  const items = await chrome.history.search({
    text: "",
    startTime,
    endTime,
    maxResults: CONFIG.MAX_HISTORY,
  });

  return items.map((item) => ({
    type: "history",
    title: item.title || item.url || "Untitled",
    url: item.url || "",
    lastVisit: item.lastVisitTime,
    icon: "📄",
  }));
}
