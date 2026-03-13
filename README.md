# Recall Chrome Extension

一鍵儲存 Threads 貼文為本機 .md 檔案。

## 安裝方式

1. 開啟 Chrome，前往 `chrome://extensions/`
2. 開啟右上角的「開發人員模式」
3. 點擊「載入未封裝項目」
4. 選擇 `recall-extension` 資料夾

## 使用方式

1. 前往 [Threads](https://www.threads.net)
2. 在任何貼文旁會看到儲存按鈕（💾 圖示）
3. 點擊按鈕，貼文會自動儲存為 `.md` 檔案
4. 檔案位於 `~/Downloads/bookmarks/` 資料夾

## 檔案格式

```markdown
# @username — 2026-03-12 14:32

**來源：** https://www.threads.net/...
**平台：** Threads
**儲存時間：** 2026-03-12 14:32:01

---

貼文內容...

![圖片](https://cdn.threads.net/...)
```

## 搭配 Claude Code 使用

```bash
cd ~/Downloads/bookmarks

# 整理分類
claude "幫我把這些文章依主題分類"

# 搜尋
claude "找出所有跟 AI 相關的文章"

# 加摘要
claude "幫我把每篇文章加上一句話摘要"
```

## 搭配 Obsidian 使用

直接將 `~/Downloads/bookmarks/` 設為 Obsidian Vault，即可：
- 全文搜尋
- 使用標籤
- Graph View 視覺化

## 開發

```bash
# 重新生成 icon
npm run generate-icons
```
