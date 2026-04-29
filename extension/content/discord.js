/**
 * Orchestra Twin Bridge — Discord Content Script
 */

(() => {
  if (window.__TwinDiscordLoaded) return;
  window.__TwinDiscordLoaded = true;

  const monitor = new TwinMonitor('discord');

  const sendUnreadSummary = monitor.debounce(() => {
    const unread = document.querySelectorAll('[class*="unread"]');
    const mentions = document.querySelectorAll('[class*="badge"]');

    let mentionCount = 0;
    mentions.forEach((el) => {
      const n = parseInt(el.textContent, 10);
      if (!isNaN(n)) mentionCount += n;
    });

    if (monitor.hasChanged('discord_unread', { unread: unread.length, mentionCount })) {
      monitor.send('DISCORD_UNREAD_SUMMARY', {
        unreadChannels: unread.length,
        mentionCount,
        url: location.href,
      });
    }
  }, 2000);

  monitor.watch('[class*="sidebar"]', sendUnreadSummary, {
    observeId: 'sidebar',
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  sendUnreadSummary();
})();
