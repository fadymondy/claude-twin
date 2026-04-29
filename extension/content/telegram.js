/**
 * Orchestra Twin Bridge — Telegram Web Content Script
 */

(() => {
  if (window.__TwinTelegramLoaded) return;
  window.__TwinTelegramLoaded = true;

  const monitor = new TwinMonitor('telegram');

  const sendUnreadSummary = monitor.debounce(() => {
    const badges = document.querySelectorAll('.badge');
    let totalUnread = 0;
    badges.forEach((badge) => {
      const n = parseInt(badge.textContent, 10);
      if (!isNaN(n)) totalUnread += n;
    });

    if (monitor.hasChanged('tg_unread', totalUnread)) {
      monitor.send('TELEGRAM_UNREAD_SUMMARY', {
        totalUnread,
        chatCount: badges.length,
        url: location.href,
      });
    }
  }, 2000);

  monitor.watch('.chatlist-container', sendUnreadSummary, {
    observeId: 'chatlist',
    childList: true,
    subtree: true,
  });

  sendUnreadSummary();
})();
