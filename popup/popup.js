// Recall - Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const countEl = document.getElementById('count');

  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_COUNT' });
    if (response && typeof response.count === 'number') {
      countEl.textContent = response.count;
    }
  } catch (error) {
    console.error('Failed to get count:', error);
    countEl.textContent = '?';
  }
});
