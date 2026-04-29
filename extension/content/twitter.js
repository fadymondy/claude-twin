/**
 * Orchestra Twin Bridge — X / Twitter Content Script
 */

(() => {
  if (window.__TwinTwitterLoaded) return;
  window.__TwinTwitterLoaded = true;

  const monitor = new TwinMonitor('twitter');

  const sendNotificationSummary = monitor.debounce(() => {
    const notifBadge = document.querySelector(
      "[data-testid='AppTabBar_Notifications_Link'] [data-testid='badge']",
    );
    const dmBadge = document.querySelector(
      "[data-testid='AppTabBar_DirectMessage_Link'] [data-testid='badge']",
    );

    const notifCount = notifBadge ? parseInt(notifBadge.textContent, 10) || 0 : 0;
    const dmCount = dmBadge ? parseInt(dmBadge.textContent, 10) || 0 : 0;

    if (monitor.hasChanged('tw_counts', { notifCount, dmCount })) {
      monitor.send('TWITTER_NOTIFICATION_SUMMARY', {
        notificationCount: notifCount,
        dmCount,
        url: location.href,
      });
    }
  }, 2000);

  monitor.watch('[data-testid="AppTabBar_Home_Link"]', sendNotificationSummary, {
    observeId: 'nav',
    childList: true,
    subtree: true,
    attributes: true,
  });

  // SPA navigation
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendNotificationSummary, 500);
  };

  sendNotificationSummary();
})();
