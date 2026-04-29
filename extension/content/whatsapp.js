/**
 * Orchestra Twin Bridge — WhatsApp Web Content Script
 */

(() => {
  if (window.__TwinWhatsAppLoaded) return;
  window.__TwinWhatsAppLoaded = true;

  const monitor = new TwinMonitor('whatsapp');

  const SEL = {
    chatList: "#pane-side [data-testid='chat-list']",
    unreadBadge: "[data-testid='icon-unread-count']",
    chatTitle: "[data-testid='cell-frame-title']",
  };

  const sendUnreadSummary = monitor.debounce(() => {
    const badges = document.querySelectorAll(SEL.unreadBadge);
    let totalUnread = 0;
    const chats = [];

    badges.forEach((badge) => {
      const count = parseInt(badge.textContent, 10) || 1;
      totalUnread += count;
      const row = badge.closest('[data-testid="cell-frame-container"]');
      const title = row?.querySelector(SEL.chatTitle)?.textContent?.trim();
      if (title) chats.push({ title, count });
    });

    if (monitor.hasChanged('unreadTotal', totalUnread)) {
      monitor.send('WHATSAPP_UNREAD_SUMMARY', {
        totalUnread,
        chatCount: chats.length,
        chats: chats.slice(0, 5),
      });
    }
  }, 2000);

  monitor.watch(SEL.chatList, sendUnreadSummary, {
    observeId: 'chatlist',
    childList: true,
    subtree: true,
  });

  sendUnreadSummary();
})();
