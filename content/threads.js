// Recall - Threads Content Script
// 在 Threads 貼文旁注入儲存按鈕

(function () {
  'use strict';

  const BUTTON_CLASS = 'recall-save-btn';
  const PROCESSED_ATTR = 'data-recall-processed';
  const DEBUG = true;
  const ORIGINAL_TOOLTIP = '儲存到 Recall\nShift+點擊: 含回覆（請先滾動載入所有回覆）';

  function log(...args) {
    if (DEBUG) console.log('[Recall]', ...args);
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
    const btn = createNativeStyleButton(postElement);
    actionBar.appendChild(btn);
  }

  /**
   * 建立符合 Threads 原生樣式的按鈕
   */
  function createNativeStyleButton(postElement) {
    // 外層容器（跟其他按鈕一樣的結構）
    const wrapper = document.createElement('div');
    wrapper.className = 'x6s0dn4 x78zum5 xl56j7k';
    wrapper.style.marginLeft = '4px';

    // 按鈕元素
    const btn = document.createElement('div');
    btn.className = BUTTON_CLASS;
    btn.setAttribute('role', 'button');
    btn.setAttribute('tabindex', '0');
    btn.setAttribute('aria-label', '儲存到 Recall');
    btn.title = ORIGINAL_TOOLTIP;
    btn.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px;
      cursor: pointer;
      border-radius: 50%;
      transition: background-color 0.2s;
    `;

    // 內層容器
    const inner = document.createElement('div');
    inner.style.cssText = 'display: flex; align-items: center;';
    inner.innerHTML = getSaveIcon();

    btn.appendChild(inner);
    wrapper.appendChild(btn);

    // Hover 效果
    btn.addEventListener('mouseenter', () => {
      btn.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.backgroundColor = 'transparent';
    });

    // 點擊事件
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (btn.dataset.disabled === 'true') return;
      btn.dataset.disabled = 'true';

      try {
        let postData;

        // Shift+click: 儲存貼文和所有回覆
        if (e.shiftKey) {
          log('Shift+click: 儲存貼文和回覆');
          postData = extractPostWithReplies(postElement);
        } else {
          postData = extractPost(postElement);
        }

        log('提取的貼文資料:', postData);
        await savePost(postData);
        showSuccess(btn, inner);
      } catch (error) {
        console.error('Recall: 儲存失敗', error);
        showError(btn, inner, error.message);
      }
    });

    // 鍵盤支援
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

      textBlocks.forEach(block => {
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

        // 檢查是否是子元素的重複內容
        const isChild = Array.from(textBlocks).some(other =>
          other !== block && other.contains(block)
        );
        if (isChild) return;

        // 避免重複
        if (!seenTexts.has(text)) {
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

    // 提取圖片
    const images = safeExtractAll(() => {
      const imgs = postElement.querySelectorAll('img[src*="cdninstagram"], img[src*="scontent"], img[src*="fbcdn"]');
      return Array.from(imgs)
        .map(img => img.src)
        .filter(src => {
          return !src.includes('150x150') &&
                 !src.includes('44x44') &&
                 !src.includes('32x32') &&
                 !src.includes('profile');
        });
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
   * 提取貼文和所有回覆
   */
  function extractPostWithReplies(postElement) {
    // 先提取主貼文
    const mainPost = extractPost(postElement);

    // 找到所有回覆
    const replies = findReplies(postElement);
    log(`找到 ${replies.length} 則回覆`);

    if (replies.length === 0) {
      return mainPost;
    }

    // 組合主貼文和回覆內容
    let combinedContent = mainPost.content;
    const allImages = [...mainPost.images];

    replies.forEach((reply) => {
      const replyData = extractPost(reply);
      combinedContent += `\n\n---\n\n**${replyData.author} 回覆：**\n\n${replyData.content}`;
      allImages.push(...replyData.images);
    });

    return {
      ...mainPost,
      content: combinedContent,
      images: [...new Set(allImages)], // 去重
      hasReplies: true,
      replyCount: replies.length
    };
  }

  /**
   * 尋找貼文下方的回覆
   */
  function findReplies(postElement) {
    const replies = [];
    const seenElements = new Set();
    seenElements.add(postElement);

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

          // 檢查是否已經加入
          if (!seenElements.has(container)) {
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
            if (!seenElements.has(container) && !postElement.contains(container)) {
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
   * 發送儲存請求到 background
   */
  function savePost(postData) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'SAVE_POST', data: postData },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            resolve();
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        }
      );
    });
  }

  /**
   * 顯示成功狀態
   */
  function showSuccess(btn, inner) {
    inner.innerHTML = getCheckIcon();
    inner.querySelector('svg').style.color = '#00c853';

    setTimeout(() => {
      inner.innerHTML = getSaveIcon();
      btn.dataset.disabled = 'false';
      btn.title = ORIGINAL_TOOLTIP;
    }, 2000);
  }

  /**
   * 顯示錯誤狀態
   */
  function showError(btn, inner, errorMessage) {
    inner.innerHTML = getErrorIcon();
    inner.querySelector('svg').style.color = '#ff1744';

    // 顯示錯誤提示
    const tooltip = document.createElement('div');
    tooltip.className = 'recall-error-tooltip';
    tooltip.textContent = errorMessage || '儲存失敗';
    tooltip.style.cssText = `
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%);
      background: #ff1744;
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      white-space: nowrap;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: recall-fade-in 0.2s ease;
    `;

    // 確保按鈕有相對定位
    btn.style.position = 'relative';
    btn.appendChild(tooltip);

    setTimeout(() => {
      tooltip.remove();
      inner.innerHTML = getSaveIcon();
      btn.dataset.disabled = 'false';
      btn.title = ORIGINAL_TOOLTIP;
    }, 3000);
  }

  /**
   * SVG Icons - 符合 Threads 原生樣式
   */
  function getSaveIcon() {
    return `<svg aria-label="Save" role="img" viewBox="0 0 24 24" style="fill: currentColor; height: 18px; width: 18px;">
      <title>Save to Recall</title>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
    </svg>`;
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
