# Quick Search - Spotlight

A macOS Spotlight-style Chrome extension for lightning-fast fuzzy search across tabs, bookmarks, history, and current page content.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Fuse.js](https://img.shields.io/badge/Powered%20by-Fuse.js-orange)

## Features

| Feature               | Description                                   |
| --------------------- | --------------------------------------------- |
| 🔍 **Fuzzy Search**   | Powered by Fuse.js for typo-tolerant matching |
| 📄 **Page Content**   | Search all visible text on current page       |
| 📑 **Open Tabs**      | Quickly switch between browser tabs           |
| ⭐ **Bookmarks**      | Search your entire bookmark collection        |
| 📜 **History**        | Find recently visited pages                   |
| ⌨️ **Keyboard First** | Full keyboard navigation support              |
| 🌙 **Dark Mode**      | Automatic system theme detection              |
| 🌐 **Multi-language** | 5 languages supported                         |

## Installation

### From Source

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in top-right)
4. Click **Load unpacked**
5. Select the extension folder

### Keyboard Shortcut

- **Windows/Linux**: `Ctrl+Shift+K`
- **macOS**: `Cmd+Shift+K`

> Customize shortcuts at `chrome://extensions/shortcuts`

## Usage

| Key            | Action             |
| -------------- | ------------------ |
| `Ctrl+Shift+K` | Open Spotlight     |
| `↑` / `↓`      | Navigate results   |
| `Enter`        | Open selected item |
| `Esc`          | Close              |

### Search Icons

- 📄 Current page / History
- 📑 Open Tab
- ⭐ Bookmark
- 🔗 Page Link
- 📍 Page Heading
- 📝 Page Text
- 🔘 Button

## Configuration

Click the **Settings ⚙️** icon in the Spotlight footer to customize your experience:

1.  **Search Priority**: Drag and drop to reorder search results (e.g., prioritize Tabs over History).
2.  **Language**: Choose your preferred interface language.
    - **Supported Languages**: English, Traditional Chinese (繁體中文), Japanese (日本語), Korean (한국어), Spanish (Español).
    - **Auto**: Automatically detects your system language.

## Project Structure

```
├── manifest.json      # Extension manifest (v3)
├── background.js      # Service worker
├── content.js         # Spotlight overlay logic
├── spotlight.css      # Overlay styles
├── lib/
│   └── fuse.min.js    # Fuse.js v7.0.0
└── icons/
    └── icon*.png
```

## Permissions

| Permission  | Purpose                                    |
| ----------- | ------------------------------------------ |
| `tabs`      | Access open tabs for search                |
| `bookmarks` | Access bookmarks for search                |
| `history`   | Access browsing history                    |
| `activeTab` | Inject spotlight on current tab            |
| `scripting` | Dynamic content script injection           |
| `storage`   | Save user preferences (priority, language) |

## License

MIT License

## Privacy

See [PrivacyPolicy.md](PrivacyPolicy.md)
