/**
 * Options Page - Settings Logic
 * Drag and drop priority sorting with chrome.storage.sync
 * Language selection with manual override (applied on save only)
 */

const DEFAULT_PRIORITY = ["page", "tab", "bookmark", "history"];
const SUPPORTED_LOCALES = ["en", "zh_TW", "ja", "ko", "es"];

// Locale messages cache
let localeMessages = null;
let savedLocale = "auto"; // The currently saved locale

// DOM Elements
const priorityList = document.getElementById("priorityList");
const saveBtn = document.getElementById("saveBtn");
const resetBtn = document.getElementById("resetBtn");
const languageSelect = document.getElementById("languageSelect");
const toast = document.getElementById("toast");

// Drag state
let draggedItem = null;

// ============================================
// Initialize
// ============================================
document.addEventListener("DOMContentLoaded", async () => {
  await loadSettings();
  await applyI18n(savedLocale);
  setupDragAndDrop();
  setupButtons();
});

// ============================================
// i18n with Manual Override
// ============================================
async function loadLocaleMessages(locale) {
  try {
    const response = await fetch(
      chrome.runtime.getURL(`_locales/${locale}/messages.json`)
    );
    return await response.json();
  } catch (e) {
    console.error(`Failed to load locale ${locale}:`, e);
    return null;
  }
}

function getMessage(key) {
  // If using manual locale, get from cached messages
  if (savedLocale !== "auto" && localeMessages && localeMessages[key]) {
    return localeMessages[key].message;
  }
  // Otherwise use Chrome's i18n
  return chrome.i18n.getMessage(key);
}

async function applyI18n(locale) {
  // If manual locale selected, load its messages
  if (locale !== "auto") {
    localeMessages = await loadLocaleMessages(locale);
  } else {
    localeMessages = null;
  }

  // Temporarily set savedLocale for getMessage to work
  const prevLocale = savedLocale;
  savedLocale = locale;

  // Apply localized text to all elements with data-i18n attribute
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    const message = getMessage(key);
    if (message) {
      el.textContent = message;
    }
  });

  // Update page title
  document.title = getMessage("settingsTitle") || document.title;

  // Update languageAuto option text
  const autoOption = languageSelect.querySelector('option[value="auto"]');
  if (autoOption) {
    autoOption.textContent =
      getMessage("languageAuto") || "Auto (System language)";
  }

  // Restore savedLocale
  savedLocale = prevLocale;
}

// ============================================
// Load Settings
// ============================================
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(["typePriority", "language"]);

    // Load priority
    const priority = result.typePriority || DEFAULT_PRIORITY;
    reorderList(priority);

    // Load language
    savedLocale = result.language || "auto";
    languageSelect.value = savedLocale;
  } catch (e) {
    console.error("Error loading settings:", e);
  }
}

function reorderList(priority) {
  const items = Array.from(priorityList.querySelectorAll(".priority-item"));
  const itemMap = {};

  items.forEach((item) => {
    itemMap[item.dataset.type] = item;
  });

  // Clear and re-add in order
  priorityList.innerHTML = "";
  priority.forEach((type) => {
    if (itemMap[type]) {
      priorityList.appendChild(itemMap[type]);
    }
  });

  // Re-setup drag and drop after reordering
  setupDragAndDrop();
}

// ============================================
// Drag and Drop
// ============================================
function setupDragAndDrop() {
  const items = priorityList.querySelectorAll(".priority-item");

  items.forEach((item) => {
    item.addEventListener("dragstart", handleDragStart);
    item.addEventListener("dragend", handleDragEnd);
    item.addEventListener("dragover", handleDragOver);
    item.addEventListener("dragenter", handleDragEnter);
    item.addEventListener("dragleave", handleDragLeave);
    item.addEventListener("drop", handleDrop);
  });
}

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add("dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", this.dataset.type);
}

function handleDragEnd(e) {
  this.classList.remove("dragging");
  document.querySelectorAll(".priority-item").forEach((item) => {
    item.classList.remove("drag-over");
  });
  draggedItem = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}

function handleDragEnter(e) {
  e.preventDefault();
  if (this !== draggedItem) {
    this.classList.add("drag-over");
  }
}

function handleDragLeave(e) {
  this.classList.remove("drag-over");
}

function handleDrop(e) {
  e.preventDefault();
  this.classList.remove("drag-over");

  if (this !== draggedItem && draggedItem) {
    const allItems = Array.from(
      priorityList.querySelectorAll(".priority-item")
    );
    const draggedIndex = allItems.indexOf(draggedItem);
    const targetIndex = allItems.indexOf(this);

    if (draggedIndex < targetIndex) {
      this.parentNode.insertBefore(draggedItem, this.nextSibling);
    } else {
      this.parentNode.insertBefore(draggedItem, this);
    }
  }
}

// ============================================
// Save / Reset
// ============================================
function setupButtons() {
  saveBtn.addEventListener("click", saveSettings);
  resetBtn.addEventListener("click", resetSettings);
}

async function saveSettings() {
  const items = priorityList.querySelectorAll(".priority-item");
  const priority = Array.from(items).map((item) => item.dataset.type);
  const newLanguage = languageSelect.value;

  try {
    await chrome.storage.sync.set({
      typePriority: priority,
      language: newLanguage,
    });

    // Update savedLocale and apply language change AFTER save
    savedLocale = newLanguage;
    await applyI18n(savedLocale);

    showToast(getMessage("settingsSaved") || "Settings saved!");
  } catch (e) {
    console.error("Error saving settings:", e);
    showToast("Error saving settings");
  }
}

async function resetSettings() {
  reorderList(DEFAULT_PRIORITY);
  languageSelect.value = "auto";
  savedLocale = "auto";
  localeMessages = null;
  await applyI18n("auto");
  showToast(getMessage("resetToDefault") || "Reset to default");
}

// ============================================
// Toast
// ============================================
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000);
}
