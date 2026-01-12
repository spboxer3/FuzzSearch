<p align="center"><img src="icons/icon128.png"></p>

<h1 align="center">FuzzSearch</h1>

<p align="center">English | <a href="readme_zh-TW.md">繁體中文</a> | <a href="PrivacyPolicy.md">Privacy Policy</a></p>

A macOS Spotlight-style Chrome extension for lightning-fast fuzzy search across tabs, bookmarks, history, and current page content.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Fuse.js](https://img.shields.io/badge/Powered%20by-Fuse.js-orange)

## Features

| Feature               | Description                                                            |
| --------------------- | ---------------------------------------------------------------------- |
| 🔍 **Fuzzy Search**   | Powered by Fuse.js (typo-tolerant, supports URL params like `?id=123`) |
| 📄 **Page Content**   | Search visible text & detect **hidden links** (marked with Hidden tag) |
| 📑 **Open Tabs**      | Quickly switch between browser tabs                                    |
| ⭐ **Bookmarks**      | Search your entire bookmark collection                                 |
| 📜 **History**        | Find recently visited pages                                            |
| ⌨️ **Keyboard First** | Full keyboard navigation support                                       |
| 🌙 **Dark Mode**      | Automatically detects system theme                                     |
| 🌐 **Multi-language** | Supports English, Chinese, Japanese, Korean, Spanish                   |

## Installation

### From Source

1. Download this project
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (top right)
4. Click **Load unpacked**
5. Select the extension folder

### Keyboard Shortcuts

- **Windows/Linux**: `Ctrl+Shift+F`
- **macOS**: `Cmd+Shift+F`

> You can customize shortcuts at `chrome://extensions/shortcuts`

## Usage

| Key            | Action           |
| -------------- | ---------------- |
| `Ctrl+Shift+F` | Open Spotlight   |
| `↑` / `↓`      | Navigate results |
| `Enter`        | Open selected    |
| `Esc`          | Close            |

### Search Icon Legend

- 📄 Current Page / History
- 📑 Open Tabs
- ⭐ Bookmarks
- 🔗 Page Links
- 📍 Page Title
- 📝 Page Text
- 🔘 Buttons

## Settings & Customization

Click the **Settings ⚙️** button at the bottom of the Spotlight interface to customize your experience:

1. **Search Priority**: Drag items to reorder search results (e.g., show tabs before history).
2. **Language**: Select interface language.
   - **Supported Languages**: English, 繁體中文, 日本語, 한국어, Español.
   - **Auto**: Automatically uses your browser's system language.

## Project Structure

```
├── manifest.json      # Extension manifest (v3)
├── background.js      # Service Worker
├── content.js         # Spotlight overlay logic
├── spotlight.css      # Overlay styles
├── options.html       # Settings page
├── options.js         # Settings logic
├── popup.html         # Popup interface
├── lib/
│   └── fuse.min.js    # Fuse.js v7.0.0
├── icons/
│   └── icon*.png
└── _locales/          # Internationalization
    ├── en/
    ├── zh_TW/
    ├── ja/
    ├── ko/
    └── es/
```

## Permissions

| Permission  | Purpose                                    |
| ----------- | ------------------------------------------ |
| `tabs`      | Access open tabs for search                |
| `bookmarks` | Access bookmarks for search                |
| `history`   | Access browsing history                    |
| `activeTab` | Inject Spotlight into current tab          |
| `scripting` | Dynamically inject content scripts         |
| `storage`   | Save user preferences (priority, language) |

## License

MIT License

## Privacy Policy

See [PrivacyPolicy.md](PrivacyPolicy.md)
