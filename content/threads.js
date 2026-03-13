// Recall - Threads Content Script
// 在 Threads 貼文旁注入儲存按鈕

(function () {
  'use strict';

  const BUTTON_CLASS = 'recall-save-btn';
  const PROCESSED_ATTR = 'data-recall-processed';
  const DEBUG = true;
  const SAVE_TOOLTIP = '儲存貼文到 Recall';
  const SAVE_WITH_COMMENTS_TOOLTIP = '儲存貼文 + 所有留言\n（自動滾動載入）';
  const AUTO_SCROLL_WAIT_MS = 800;
  const AUTO_SCROLL_TIMEOUT_MS = 5000; // 5 秒（測試用）
  const SCROLL_INCREMENT_PX = 800;

  /**
   * 檢查是否在單篇貼文頁面
   */
  function isSinglePostPage() {
    return /^https:\/\/(www\.)?threads\.(net|com)\/@[\w.]+\/post\/[\w-]+/.test(window.location.href);
  }

  /**
   * 等待指定毫秒
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 將圖片 URL 轉換為 base64
   */
  async function imageToBase64(imgUrl) {
    try {
      const response = await fetch(imgUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      log(`圖片轉換失敗: ${imgUrl}`, e);
      return null;
    }
  }

  /**
   * 批次轉換圖片為 base64
   */
  async function convertImagesToBase64(imageUrls) {
    const results = [];
    for (const url of imageUrls) {
      const base64 = await imageToBase64(url);
      results.push(base64 || url); // 失敗時保留原始 URL
    }
    return results;
  }

  function log(...args) {
    if (DEBUG) console.log('[Recall v2.0]', ...args);
  }

  // 等待頁面載入完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    log('Extension 初始化');

    // 延遲執行，確保 Threads SPA 已渲染
    setTimeout(() => {
      injectButtons();

      // 監聽 DOM 變化（Threads 是 SPA，需要持續監聽）
      const observer = new MutationObserver(debounce(injectButtons, 500));
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      log('MutationObserver 已啟動');
    }, 1500);
  }

  /**
   * 掃描並注入儲存按鈕
   */
  function injectButtons() {
    // 直接找所有的操作列（包含 Like, Reply, Repost, Share 的那一列）
    const actionBars = findActionBars();
    log(`找到 ${actionBars.length} 個操作列`);

    actionBars.forEach((actionBar, index) => {
      if (!actionBar.hasAttribute(PROCESSED_ATTR)) {
        actionBar.setAttribute(PROCESSED_ATTR, 'true');
        log(`注入按鈕到操作列 #${index + 1}`);
        injectButton(actionBar);
      }
    });
  }

  /**
   * 尋找所有操作列
   * 操作列特徵：包含 Like, Reply, Repost, Share SVG 圖示的 flex 容器
   */
  function findActionBars() {
    const actionBars = [];

    // 尋找包含 Share 按鈕的 SVG（Share 是最後一個按鈕，用它來定位）
    const shareSvgs = document.querySelectorAll('svg[aria-label="Share"], svg[aria-label="分享"]');

    shareSvgs.forEach(svg => {
      // 向上找到操作列容器（包含所有按鈕的那一層）
      let container = svg.parentElement;
      for (let i = 0; i < 8; i++) {
        if (!container) break;

        // 檢查是否是操作列：有多個子元素，且是 flex 布局
        const style = window.getComputedStyle(container);
        const childDivs = container.querySelectorAll(':scope > div');

        if (childDivs.length >= 4 && style.display === 'flex') {
          // 確認包含 Like 按鈕
          const hasLike = container.querySelector('svg[aria-label="Like"], svg[aria-label="讚"]');
          if (hasLike) {
            actionBars.push(container);
            break;
          }
        }
        container = container.parentElement;
      }
    });

    return [...new Set(actionBars)];
  }

  /**
   * 找到包含這個操作列的貼文元素
   */
  function findPostElement(actionBar) {
    let container = actionBar;
    for (let i = 0; i < 15; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;

      // 尋找包含作者連結和貼文連結的容器
      const hasAuthor = container.querySelector('a[href^="/@"]');
      const hasPostLink = container.querySelector('a[href*="/post/"]');

      if (hasAuthor && hasPostLink && container.offsetHeight > 100) {
        return container;
      }
    }
    return actionBar.closest('article') || actionBar.parentElement?.parentElement?.parentElement;
  }

  /**
   * 在操作列注入儲存按鈕
   */
  function injectButton(actionBar) {
    const postElement = findPostElement(actionBar);

    // 按鈕 1：儲存貼文（現有功能）
    const saveBtn = createSaveButton(postElement);
    actionBar.appendChild(saveBtn);

    // 按鈕 2：儲存含留言（只在單篇頁面顯示）
    if (isSinglePostPage()) {
      const saveWithCommentsBtn = createSaveWithCommentsButton(postElement);
      actionBar.appendChild(saveWithCommentsBtn);
    }
  }

  /**
   * 建立儲存貼文按鈕
   */
  function createSaveButton(postElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'x6s0dn4 x78zum5 xl56j7k';
    wrapper.style.marginLeft = '4px';

    const btn = document.createElement('div');
    btn.className = BUTTON_CLASS;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', '儲存到 Recall');
    btn.title = SAVE_TOOLTIP;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      cursor: pointer;
      border-radius: 50%;
      transition: background-color 0.2s;
    `;

    const inner = document.createElement('div');
    inner.style.cssText = 'display: flex; align-items: center;';
    inner.innerHTML = getSaveIcon();

    btn.appendChild(inner);
    wrapper.appendChild(btn);

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = 'transparent';
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.dataset.disabled === 'true') return;
      btn.dataset.disabled = 'true';

      try {
        inner.innerHTML = getLoadingIcon();
        const postData = extractPost(postElement);

        // 轉換圖片為 base64
        if (postData.images && postData.images.length > 0) {
          btn.title = '正在轉換圖片...';
          postData.images = await convertImagesToBase64(postData.images);
        }

        log('提取的貼文資料:', postData);
        await savePost(postData);
        showSuccess(btn, inner);
      } catch (error) {
        console.error('Recall: 儲存失敗', error);
        showError(btn, inner, error.message);
      }
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });

    return wrapper;
  }

  /**
   * 建立儲存含留言按鈕
   */
  function createSaveWithCommentsButton(postElement) {
    const wrapper = document.createElement('div');
    wrapper.className = 'x6s0dn4 x78zum5 xl56j7k';
    wrapper.style.marginLeft = '4px';

    const btn = document.createElement('div');
    btn.className = BUTTON_CLASS;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', '儲存貼文含留言');
    btn.title = SAVE_WITH_COMMENTS_TOOLTIP;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      cursor: pointer;
      border-radius: 50%;
      transition: background-color 0.2s;
    `;

    const inner = document.createElement('div');
    inner.style.cssText = 'display: flex; align-items: center;';
    inner.innerHTML = getCommentIcon();

    btn.appendChild(inner);
    wrapper.appendChild(btn);

    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = 'transparent';
    });

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.dataset.disabled === 'true') return;
      btn.dataset.disabled = 'true';

      try {
        const { comments, timedOut } = await autoScrollAndCollectComments(postElement, btn, inner);

        // 轉換留言中的圖片為 base64
        btn.title = '正在轉換圖片...';
        inner.innerHTML = getLoadingIcon();
        for (const comment of comments) {
          if (comment.images && comment.images.length > 0) {
            comment.images = await convertImagesToBase64(comment.images);
          }
        }

        const postData = buildPostWithComments(postElement, comments, timedOut);

        // 轉換主貼文圖片為 base64
        if (postData.images && postData.images.length > 0) {
          postData.images = await convertImagesToBase64(postData.images);
        }

        log('提取的貼文資料（含留言）:', postData);
        await savePost(postData);
        showSuccess(btn, inner, true);
      } catch (error) {
        console.error('Recall: 儲存失敗', error);
        showError(btn, inner, error.message, true);
      }
    });

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });

    return wrapper;
  }

  /**
   * 安全提取函式
   */
  function safeExtract(fn) {
    try {
      return fn();
    } catch (e) {
      log('提取錯誤:', e);
      return null;
    }
  }

  function safeExtractAll(fn) {
    try {
      return fn();
    } catch {
      return [];
    }
  }

  /**
   * 提取貼文內容
   */
  function extractPost(postElement) {
    if (!postElement) {
      return {
        author: '@unknown',
        content: '',
        images: [],
        url: window.location.href,
        platform: 'Threads',
        savedAt: new Date().toISOString()
      };
    }

    // 提取作者
    const author = safeExtract(() => {
      const profileLink = postElement.querySelector('a[href^="/@"]');
      if (profileLink) {
        const href = profileLink.getAttribute('href');
        const match = href.match(/\/@([^/?]+)/);
        if (match) return '@' + match[1];

        const text = profileLink.textContent.trim();
        if (text) return text.startsWith('@') ? text : '@' + text;
      }
      return null;
    }) || '@unknown';

    // 提取內容
    const content = safeExtract(() => {
      // 方法 1：找到所有內容區塊並合併
      const textBlocks = postElement.querySelectorAll('div[dir="auto"], span[dir="auto"]');
      const contentParts = [];
      const seenTexts = new Set();

      // 將 textBlocks 轉為陣列以便檢查父子關係
      const blocksArray = Array.from(textBlocks);

      blocksArray.forEach(block => {
        // 跳過作者連結、按鈕等
        if (block.closest('a[href^="/@"]') ||
            block.closest('[role="button"]') ||
            block.closest('button') ||
            block.closest('time')) {
          return;
        }

        // 跳過太短的文字（可能是標籤或按鈕文字）
        const text = block.textContent.trim();
        if (text.length < 5) return;

        // 跳過「翻譯」按鈕文字
        if (text === 'Translate' || text === '翻譯' || text === '查看翻譯' || text === 'See translation') return;

        // 跳過包含 base64 資料的文字（可能是圖片 alt 文字）
        if (/[A-Za-z0-9+/=]{50,}/.test(text)) return;

        // 檢查是否是子元素的重複內容（被其他 block 包含）
        const isChild = blocksArray.some(other =>
          other !== block && other.contains(block)
        );
        if (isChild) return;

        // 檢查是否是父元素（包含其他 block）- 優先使用子元素的文字
        const isParent = blocksArray.some(other =>
          other !== block && block.contains(other) &&
          !other.closest('a[href^="/@"]') &&
          !other.closest('[role="button"]') &&
          !other.closest('button') &&
          !other.closest('time') &&
          other.textContent.trim().length >= 5
        );
        if (isParent) return;

        // 避免完全重複
        if (seenTexts.has(text)) return;

        // 避免子字串重複（新文字是已存在文字的一部分，或已存在文字是新文字的一部分）
        let isSubstring = false;
        for (const existingText of seenTexts) {
          if (existingText.includes(text) || text.includes(existingText)) {
            // 保留較長的那個
            if (text.length > existingText.length) {
              seenTexts.delete(existingText);
              const idx = contentParts.indexOf(existingText);
              if (idx > -1) contentParts.splice(idx, 1);
            } else {
              isSubstring = true;
            }
            break;
          }
        }

        if (!isSubstring) {
          seenTexts.add(text);
          contentParts.push(text);
        }
      });

      if (contentParts.length > 0) {
        return contentParts.join('\n\n');
      }

      // 方法 2：備用方案 - 克隆並清理
      const clone = postElement.cloneNode(true);
      clone.querySelectorAll('a[href^="/@"], time, svg, button, [role="button"]').forEach(el => el.remove());
      return clone.textContent.trim().substring(0, 5000);
    }) || '';

    // 提取圖片（過濾頭像，保留內容圖片）
    const images = safeExtractAll(() => {
      // 判斷是否為內容圖片（非頭像）
      const isContentImage = (img) => {
        const src = img.src || '';
        // 排除擴充功能自己的圖片
        if (src.startsWith('chrome-extension://')) return false;
        // 排除 data URL（通常是 icon）
        if (src.startsWith('data:')) return false;
        // 排除明顯的頭像 URL
        if (src.includes('44x44') || src.includes('32x32')) return false;
        if (src.includes('profile') || src.includes('avatar')) return false;
        // 檢查 URL 路徑：t51.82787-19 是 IG 頭像，t51.29350-15 是內容圖
        if (src.includes('t51.82787-19')) return false; // 頭像
        // 只保留 CDN 圖片
        if (!src.includes('cdninstagram') && !src.includes('scontent') && !src.includes('fbcdn')) {
          return false;
        }
        // 檢查尺寸
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        // 150x150 正方形很可能是頭像
        if (width === 150 && height === 150) return false;
        if (width === height && width <= 150) return false;
        // 如果尺寸未知但 URL 看起來像內容圖
        if (width === 0 && height === 0) {
          return src.includes('t51.29350-15') || src.includes('t51.2885-15');
        }
        return width > 150 || height > 150;
      };

      // 只在 postElement 內搜尋圖片，避免抓到其他貼文的圖片
      const allImgs = postElement.querySelectorAll('img');
      log(`搜尋容器內有 ${allImgs.length} 張圖片`);

      const contentImages = Array.from(allImgs).filter(img => {
        const isContent = isContentImage(img);
        if (isContent) {
          log(`✓ 內容圖片: ${img.src.substring(0, 100)}...`);
        }
        return isContent;
      });

      log(`找到 ${contentImages.length} 張內容圖片`);
      // 使用 Set 去重圖片 URL
      const uniqueUrls = [...new Set(contentImages.map(img => img.src))];
      log(`去重後 ${uniqueUrls.length} 張圖片`);
      return uniqueUrls;
    }) || [];

    // 提取貼文連結
    const url = safeExtract(() => {
      const postLink = postElement.querySelector('a[href*="/post/"]');
      if (postLink) {
        const href = postLink.getAttribute('href');
        if (href.startsWith('http')) return href;
        return 'https://www.threads.net' + href;
      }
      return window.location.href;
    }) || window.location.href;

    return {
      author,
      content,
      images,
      url,
      platform: 'Threads',
      savedAt: new Date().toISOString()
    };
  }

  /**
   * 尋找貼文下方的回覆
   */
  function findReplies(postElement) {
    const replies = [];
    const seenElements = new Set();
    seenElements.add(postElement);

    // 檢查容器是否與已加入的元素重疊
    const isOverlapping = (container) => {
      for (const seen of seenElements) {
        if (seen.contains(container) || container.contains(seen)) {
          return true;
        }
      }
      return false;
    };

    // 取得主貼文的 URL 來識別它
    const mainPostUrl = postElement.querySelector('a[href*="/post/"]')?.getAttribute('href');
    log('主貼文 URL:', mainPostUrl);

    // 在單一貼文頁面，找所有回覆
    if (window.location.href.includes('/post/')) {

      // 方法 1：找所有 Like 按鈕，每個代表一則貼文/回覆
      const allLikeButtons = document.querySelectorAll('svg[aria-label="Like"], svg[aria-label="讚"], svg[aria-label="Unlike"], svg[aria-label="收回讚"]');
      log(`頁面上共有 ${allLikeButtons.length} 個 Like 按鈕`);

      allLikeButtons.forEach(likeBtn => {
        // 向上找到包含整則回覆的容器
        let container = likeBtn;
        for (let i = 0; i < 15; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;

          // 檢查是否有作者連結
          const authorLink = container.querySelector('a[href^="/@"]');
          if (!authorLink) continue;

          // 檢查是否有內容
          const hasContent = container.querySelector('div[dir="auto"]');
          if (!hasContent) continue;

          // 檢查這個容器是否夠大（排除小元件）
          if (container.offsetHeight < 60) continue;

          // 跳過主貼文
          if (postElement.contains(container) || container.contains(postElement)) {
            break;
          }

          // 檢查是否已經加入或與已加入的元素重疊
          if (!seenElements.has(container) && !isOverlapping(container)) {
            // 再確認一下不是主貼文（比對 URL）
            const containerPostUrl = container.querySelector('a[href*="/post/"]')?.getAttribute('href');
            if (containerPostUrl && containerPostUrl === mainPostUrl) {
              break;
            }

            seenElements.add(container);
            replies.push(container);
            log(`找到回覆: ${authorLink.getAttribute('href')}`);
          }
          break;
        }
      });

      // 方法 2：直接找所有回覆連結（回覆通常也有自己的 /post/ 連結）
      const allPostLinks = document.querySelectorAll('a[href*="/post/"]');
      allPostLinks.forEach(link => {
        const href = link.getAttribute('href');
        // 跳過主貼文連結
        if (href === mainPostUrl) return;
        // 跳過不是貼文的連結
        if (!href.match(/\/post\/[A-Za-z0-9_-]+/)) return;

        // 向上找容器
        let container = link;
        for (let i = 0; i < 12; i++) {
          if (!container.parentElement) break;
          container = container.parentElement;

          const hasAuthor = container.querySelector('a[href^="/@"]');
          const hasLike = container.querySelector('svg[aria-label="Like"], svg[aria-label="讚"], svg[aria-label="Unlike"], svg[aria-label="收回讚"]');

          if (hasAuthor && hasLike && container.offsetHeight > 60) {
            // 檢查是否與已加入的元素重疊
            if (!seenElements.has(container) && !isOverlapping(container) && !postElement.contains(container)) {
              seenElements.add(container);
              replies.push(container);
            }
            break;
          }
        }
      });
    }

    log(`總共找到 ${replies.length} 則回覆`);
    return replies;
  }

  /**
   * 自動滾動並收集所有留言
   */
  async function autoScrollAndCollectComments(postElement, btn, inner) {
    const originalScrollY = window.scrollY;
    inner.innerHTML = getLoadingIcon();

    const startTime = Date.now();
    const seenComments = new Map();
    let consecutiveNoNew = 0;
    let timedOut = false;

    try {
      log('開始收集留言，postElement:', postElement);
      collectVisibleComments(postElement, seenComments);
      log(`初始收集完成，找到 ${seenComments.size} 則留言`);

      while (consecutiveNoNew < 3) {
        if (Date.now() - startTime > AUTO_SCROLL_TIMEOUT_MS) {
          timedOut = true;
          log('自動滾動超時');
          break;
        }

        const atBottom = scrollDown();
        await sleep(AUTO_SCROLL_WAIT_MS);

        const prevCount = seenComments.size;
        collectVisibleComments(postElement, seenComments);

        btn.title = `正在載入... 已找到 ${seenComments.size} 則留言`;
        log(`目前留言數: ${seenComments.size}, 連續無新留言: ${consecutiveNoNew}, 是否到底: ${atBottom}`);

        if (seenComments.size === prevCount) {
          consecutiveNoNew++;
          if (atBottom) {
            log('已到達頁面底部');
            break;
          }
        } else {
          consecutiveNoNew = 0;
        }
      }

      window.scrollTo({ top: originalScrollY, behavior: 'smooth' });

      const comments = Array.from(seenComments.values());
      log(`自動滾動完成，共收集 ${comments.length} 則留言`);
      return { comments, timedOut };

    } catch (error) {
      window.scrollTo({ top: originalScrollY, behavior: 'smooth' });
      throw error;
    }
  }

  /**
   * 向下滾動頁面
   */
  function scrollDown() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const currentScroll = window.scrollY;
    const newScroll = Math.min(currentScroll + SCROLL_INCREMENT_PX, maxScroll);
    log(`滾動: ${currentScroll} -> ${newScroll} (max: ${maxScroll})`);
    window.scrollTo({ top: newScroll, behavior: 'smooth' });
    return newScroll >= maxScroll - 10;
  }

  /**
   * 收集目前可見的留言（使用現有的 findReplies 邏輯）
   */
  function collectVisibleComments(postElement, seenComments) {
    // 直接使用已經測試過的 findReplies 函式
    const replyElements = findReplies(postElement);
    log(`collectVisibleComments: 找到 ${replyElements.length} 個回覆元素`);

    replyElements.forEach((container) => {
      const commentData = extractCommentData(container);
      if (!commentData) {
        return;
      }

      const dedupeKey = `${commentData.author}::${commentData.content.substring(0, 100)}`;
      if (!seenComments.has(dedupeKey)) {
        seenComments.set(dedupeKey, commentData);
        log(`新增留言: ${commentData.author}`);
      }
    });
  }

  /**
   * 提取留言資料
   */
  function extractCommentData(container) {
    const author = safeExtract(() => {
      const link = container.querySelector('a[href^="/@"]');
      const match = link?.getAttribute('href')?.match(/\/@([^/?]+)/);
      return match ? '@' + match[1] : null;
    });
    if (!author) return null;

    const content = safeExtract(() => {
      const blocks = container.querySelectorAll('div[dir="auto"], span[dir="auto"]');
      const blocksArray = Array.from(blocks);
      const parts = [];
      const seen = new Set();

      blocksArray.forEach(block => {
        if (block.closest('a[href^="/@"]') || block.closest('[role="button"]') ||
            block.closest('button') || block.closest('time')) return;

        const text = block.textContent.trim();
        if (text.length < 2 || text === 'Translate' || text === '翻譯' || text === '查看翻譯') return;

        // 跳過包含 base64 資料的文字
        if (/[A-Za-z0-9+/=]{50,}/.test(text)) return;

        // 檢查是否是子元素（被其他 block 包含）
        const isChild = blocksArray.some(o => o !== block && o.contains(block));
        if (isChild) return;

        // 檢查是否是父元素（包含其他有效 block）- 優先使用子元素
        const isParent = blocksArray.some(o =>
          o !== block && block.contains(o) &&
          !o.closest('a[href^="/@"]') &&
          !o.closest('[role="button"]') &&
          !o.closest('button') &&
          !o.closest('time') &&
          o.textContent.trim().length >= 2
        );
        if (isParent) return;

        // 避免完全重複
        if (seen.has(text)) return;

        // 避免子字串重複
        let isSubstring = false;
        for (const existingText of seen) {
          if (existingText.includes(text) || text.includes(existingText)) {
            if (text.length > existingText.length) {
              seen.delete(existingText);
              const idx = parts.indexOf(existingText);
              if (idx > -1) parts.splice(idx, 1);
            } else {
              isSubstring = true;
            }
            break;
          }
        }

        if (!isSubstring) {
          seen.add(text);
          parts.push(text);
        }
      });
      return parts.join('\n');
    }) || '';

    const timestamp = safeExtract(() => {
      const time = container.querySelector('time');
      return time?.getAttribute('datetime') || time?.textContent?.trim() || null;
    });

    // 提取留言中的圖片
    const images = safeExtractAll(() => {
      const imgs = container.querySelectorAll('img');
      const filteredImgs = Array.from(imgs)
        .filter(img => {
          const src = img.src || '';
          if (src.startsWith('chrome-extension://')) return false;
          if (src.startsWith('data:')) return false;
          if (src.includes('44x44') || src.includes('32x32')) return false;
          if (src.includes('profile') || src.includes('avatar')) return false;
          if (src.includes('t51.82787-19')) return false;
          if (!src.includes('cdninstagram') && !src.includes('scontent') && !src.includes('fbcdn')) {
            return false;
          }
          const width = img.naturalWidth || img.width || 0;
          const height = img.naturalHeight || img.height || 0;
          if (width === 150 && height === 150) return false;
          if (width === height && width <= 150) return false;
          if (width === 0 && height === 0) {
            return src.includes('t51.29350-15') || src.includes('t51.2885-15');
          }
          return width > 150 || height > 150;
        })
        .map(img => img.src);
      // 使用 Set 去重圖片 URL
      return [...new Set(filteredImgs)];
    }) || [];

    return { author, content, timestamp, images };
  }

  /**
   * 組合貼文與留言
   */
  function buildPostWithComments(postElement, comments, timedOut) {
    const mainPost = extractPost(postElement);

    if (comments.length === 0) {
      mainPost.content += '\n\n---\n\n## 留言\n\n此貼文目前無留言';
      return mainPost;
    }

    let commentSection = `\n\n---\n\n## 留言（共 ${comments.length} 則）`;

    if (timedOut) {
      commentSection += '\n\n> ⚠️ 留言可能未完整載入（已達時間限制）';
    }

    comments.forEach(comment => {
      const timeStr = comment.timestamp ? ` · ${comment.timestamp}` : '';
      commentSection += `\n\n**${comment.author}**${timeStr}\n${comment.content}`;

      // 加入該留言的圖片
      if (comment.images && comment.images.length > 0) {
        commentSection += '\n';
        comment.images.forEach((imgUrl, idx) => {
          commentSection += `\n![${comment.author} 圖片${idx + 1}](${imgUrl})`;
        });
      }
    });

    return {
      ...mainPost,
      content: mainPost.content + commentSection,
      hasReplies: true,
      replyCount: comments.length
    };
  }

  /**
   * 發送儲存請求到 background
   */
  function savePost(postData) {
    return new Promise((resolve, reject) => {
      try {
        if (!chrome.runtime?.sendMessage) {
          reject(new Error('請重新整理頁面 (Cmd+Shift+R)'));
          return;
        }
        chrome.runtime.sendMessage(
          { type: 'SAVE_POST', data: postData },
          (response) => {
            if (chrome.runtime.lastError) {
              const msg = chrome.runtime.lastError.message || '';
              if (msg.includes('invalidated') || msg.includes('context')) {
                reject(new Error('請重新整理頁面 (Cmd+Shift+R)'));
              } else {
                reject(new Error(msg));
              }
              return;
            }
            if (response && response.success) {
              resolve();
            } else {
              reject(new Error(response?.error || 'Unknown error'));
            }
          }
        );
      } catch (e) {
        // Extension context invalidated - 擴充功能已重新載入
        reject(new Error('請重新整理頁面 (Cmd+Shift+R)'));
      }
    });
  }

  /**
   * 顯示 Toast Modal
   */
  function showToast(type, message) {
    // 移除現有的 toast
    const existingToast = document.querySelector('.recall-toast-modal');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'recall-toast-modal';

    const isSuccess = type === 'success';
    const iconColor = isSuccess ? '#00c853' : '#ff1744';
    const icon = isSuccess ? '✓' : '✕';

    toast.innerHTML = `
      <span style="font-size: 24px; margin-right: 12px; color: ${iconColor};">${icon}</span>
      <span style="font-size: 16px; font-weight: 500; color: white;">${message}</span>
    `;

    toast.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) scale(0.8);
      background: #333;
      color: white;
      padding: 20px 32px;
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      opacity: 0;
      transition: all 0.2s ease-out;
    `;

    document.body.appendChild(toast);

    // 觸發動畫
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translate(-50%, -50%) scale(1)';
    });

    // 1 秒後自動消失
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translate(-50%, -50%) scale(0.8)';
      setTimeout(() => toast.remove(), 200);
    }, 1000);
  }

  /**
   * 顯示成功狀態
   */
  function showSuccess(btn, inner, isCommentBtn = false) {
    inner.innerHTML = getCheckIcon();
    inner.querySelector('svg').style.color = '#00c853';

    // 顯示 Toast Modal
    showToast('success', '已儲存到 Recall！');

    setTimeout(() => {
      inner.innerHTML = isCommentBtn ? getCommentIcon() : getSaveIcon();
      btn.dataset.disabled = 'false';
      btn.title = isCommentBtn ? SAVE_WITH_COMMENTS_TOOLTIP : SAVE_TOOLTIP;
    }, 2000);
  }

  /**
   * 顯示錯誤狀態
   */
  function showError(btn, inner, errorMessage, isCommentBtn = false) {
    inner.innerHTML = getErrorIcon();
    inner.querySelector('svg').style.color = '#ff1744';

    // 顯示 Toast Modal
    showToast('error', errorMessage || '儲存失敗');

    setTimeout(() => {
      inner.innerHTML = isCommentBtn ? getCommentIcon() : getSaveIcon();
      btn.dataset.disabled = 'false';
      btn.title = isCommentBtn ? SAVE_WITH_COMMENTS_TOOLTIP : SAVE_TOOLTIP;
    }, 2000);
  }

  /**
   * SVG Icons - 符合 Threads 原生樣式
   */
  function getSaveIcon() {
    const imgUrl = chrome.runtime.getURL('images/white-cat-paw.png');
    return `<img src="${imgUrl}" alt="Save to Recall" style="height: 24px; width: 24px; object-fit: contain;">`;
  }

  function getCheckIcon() {
    return `<svg aria-label="Saved" role="img" viewBox="0 0 24 24" style="fill: currentColor; height: 18px; width: 18px;">
      <title>Saved</title>
      <polyline points="20 6 9 17 4 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>`;
  }

  function getErrorIcon() {
    return `<svg aria-label="Error" role="img" viewBox="0 0 24 24" style="fill: currentColor; height: 18px; width: 18px;">
      <title>Error</title>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2"></circle>
      <line x1="15" y1="9" x2="9" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
      <line x1="9" y1="9" x2="15" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>
    </svg>`;
  }

  function getLoadingIcon() {
    return `<svg aria-label="Loading" viewBox="0 0 24 24" style="fill: none; stroke: currentColor; height: 18px; width: 18px; animation: recall-spin 1s linear infinite;">
      <circle cx="12" cy="12" r="10" stroke-width="2" stroke-dasharray="31.4 31.4" stroke-linecap="round"/>
    </svg>`;
  }

  function getCommentIcon() {
    const imgUrl = chrome.runtime.getURL('images/leopard-paw.png');
    return `<img src="${imgUrl}" alt="Save with comments" style="height: 24px; width: 24px; object-fit: contain;">`;
  }

  /**
   * Debounce 函式
   */
  function debounce(fn, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }
})();
