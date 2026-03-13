// Recall - Background Service Worker
// 處理下載和計數

// 監聽來自 content script 的訊息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_POST') {
    savePost(message.data)
      .then(() => {
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('Save failed:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // 保持 sendResponse 有效
  }

  if (message.type === 'GET_COUNT') {
    getCount().then((count) => {
      sendResponse({ count });
    });
    return true;
  }
});

/**
 * 儲存貼文為 .md 檔案
 */
async function savePost(postData) {
  const { author, content, images, url, savedAt, platform } = postData;

  const date = new Date(savedAt);

  // 生成檔名：使用內文
  const filename = generateFilename(content, author);
  const baseName = filename.replace('.md', '');

  // 使用原始圖片 URL（暫不下載到本地）
  const localImages = images || [];

  // 組合 .md 內容（使用本地圖片路徑）
  const mdContent = generateMarkdown({ ...postData, localImages }, date);

  // 使用 Data URL（Manifest V3 service worker 不支援 URL.createObjectURL）
  const dataUrl = 'data:text/markdown;charset=utf-8,' + encodeURIComponent(mdContent);

  // 下載檔案到 Downloads/bookmarks/
  await chrome.downloads.download({
    url: dataUrl,
    filename: `bookmarks/${filename}`,
    saveAs: false,
    conflictAction: 'uniquify'
  });

  // 更新計數
  await incrementCount();
}

/**
 * 生成檔名（使用內文）
 */
function generateFilename(content, author) {
  // 清理內文作為檔名
  let name = content
    // 移除換行符號
    .replace(/[\r\n]+/g, ' ')
    // 移除檔案系統不允許的字元
    .replace(/[/\\:*?"<>|]/g, '')
    // 移除控制字元
    .replace(/[\x00-\x1f\x7f]/g, '')
    // 移除多餘空白
    .replace(/\s+/g, ' ')
    .trim();

  // 如果內文為空，使用作者名稱
  if (!name) {
    name = author.replace('@', '') || 'untitled';
  }

  // 截斷長度（最多 60 字元）
  const maxLength = 60;
  if (name.length > maxLength) {
    name = name.substring(0, maxLength).trim();
    // 避免在詞中間截斷（嘗試在空格處截斷）
    const lastSpace = name.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) {
      name = name.substring(0, lastSpace);
    }
  }

  return `${name}.md`;
}

/**
 * 生成 Markdown 內容
 */
function generateMarkdown(postData, date) {
  const { author, content, images, url, platform, localImages, replyCount } = postData;

  const formattedDate = `${formatDate(date)} ${formatTimeReadable(date)}`;
  const savedTime = `${formatDate(date)} ${formatTimeReadable(date)}:${String(date.getSeconds()).padStart(2, '0')}`;

  let md = `# ${author} — ${formattedDate}\n\n`;
  md += `**來源：** ${url}\n`;
  md += `**平台：** ${platform}\n`;
  md += `**儲存時間：** ${savedTime}\n`;
  if (replyCount) {
    md += `**回覆數：** ${replyCount}\n`;
  }
  md += `\n---\n\n`;
  md += `${content}\n`;

  // 加入圖片（優先使用本地路徑）
  const imgList = localImages || images;
  if (imgList && imgList.length > 0) {
    md += '\n';
    imgList.forEach((imgPath, index) => {
      md += `![圖片${index + 1}](${imgPath})\n`;
    });
  }

  return md;
}

/**
 * 日期格式化：YYYY-MM-DD
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 可讀時間格式：HH:mm
 */
function formatTimeReadable(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * 取得儲存計數
 */
async function getCount() {
  const result = await chrome.storage.local.get(['saveCount']);
  return result.saveCount || 0;
}

/**
 * 增加儲存計數
 */
async function incrementCount() {
  const count = await getCount();
  await chrome.storage.local.set({ saveCount: count + 1 });
}
