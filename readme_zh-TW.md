# Quick Search - Spotlight

macOS Spotlight 風格的 Chrome 擴充功能，支援分頁、書籤、歷史記錄和當前頁面內容的模糊搜尋。

![Chrome Extension](https://img.shields.io/badge/Chrome-擴充功能-green)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Fuse.js](https://img.shields.io/badge/Powered%20by-Fuse.js-orange)

## 功能特色

| 功能              | 說明                                        |
| ----------------- | ------------------------------------------- |
| 🔍 **模糊搜尋**   | 使用 Fuse.js (容許錯字、支援網址參數搜尋)   |
| 📄 **頁面內容**   | 搜尋頁面文字，自動偵測隱藏連結 (Hidden Tag) |
| 📑 **開啟分頁**   | 快速切換瀏覽器分頁                          |
| ⭐ **書籤**       | 搜尋所有書籤                                |
| 📜 **歷史記錄**   | 尋找最近訪問的頁面                          |
| ⌨️ **鍵盤優先**   | 完整的鍵盤導航支援                          |
| 🌙 **深色模式**   | 自動偵測系統主題                            |
| 🌐 **多語系支援** | 支援 English, 中文, 日文, 韓文, 西班牙文    |

## 安裝方式

### 從原始碼安裝

1. 下載此專案
2. 開啟 Chrome 並前往 `chrome://extensions`
3. 開啟右上角的 **開發人員模式**
4. 點擊 **載入未封裝項目**
5. 選擇擴充功能資料夾

### 快捷鍵

- **Windows/Linux**: `Ctrl+Shift+F`
- **macOS**: `Cmd+Shift+F`

> 可在 `chrome://extensions/shortcuts` 自訂快捷鍵

## 使用方式

| 按鍵           | 動作           |
| -------------- | -------------- |
| `Ctrl+Shift+F` | 開啟 Spotlight |
| `↑` / `↓`      | 瀏覽結果       |
| `Enter`        | 開啟選中項目   |
| `Esc`          | 關閉           |

### 搜尋圖示說明

- 📄 當前頁面 / 歷史記錄
- 📑 開啟的分頁
- ⭐ 書籤
- 🔗 頁面連結
- 📍 頁面標題
- 📝 頁面文字
- 🔘 按鈕

## 設定與自訂

點擊 Spotlight 介面下方的 **設定 ⚙️** 按鈕即可自訂您的使用體驗：

1.  **搜尋優先順序**：拖曳項目以重新排序搜尋結果（例如：將分頁顯示在歷史記錄之前）。
2.  **語言 (Language)**：選擇介面顯示語言。
    - **支援語言**：English, 繁體中文, 日本語, 한국어, Español。
    - **自動 (Auto)**：自動偵測並使用您瀏覽器的系統語言。

## 專案結構

```
├── manifest.json      # 擴充功能清單 (v3)
├── background.js      # Service Worker
├── content.js         # Spotlight 覆蓋層邏輯
├── spotlight.css      # 覆蓋層樣式
├── lib/
│   └── fuse.min.js    # Fuse.js v7.0.0
└── icons/
    └── icon*.png
```

## 權限說明

| 權限        | 用途                          |
| ----------- | ----------------------------- |
| `tabs`      | 存取開啟的分頁以供搜尋        |
| `bookmarks` | 存取書籤以供搜尋              |
| `history`   | 存取瀏覽歷史                  |
| `activeTab` | 在當前分頁注入 Spotlight      |
| `scripting` | 動態注入內容腳本              |
| `storage`   | 儲存使用者設定 (優先序, 語言) |

## 授權

MIT License

## 隱私權政策

請參閱 [PrivacyPolicy.md](PrivacyPolicy.md)
