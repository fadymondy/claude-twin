/**
 * Orchestra Twin Bridge — GitHub Content Script
 */

(() => {
  if (window.__TwinGitHubLoaded) return;
  window.__TwinGitHubLoaded = true;

  const monitor = new TwinMonitor('github');

  // ─── Notification Count ────────────────────────────────────────────────────

  const sendNotificationCount = monitor.debounce(() => {
    const badge = document.querySelector('.mail-status');
    const hasUnread = !!document.querySelector('[aria-label="You have unread notifications"]');
    const count = badge ? parseInt(badge.textContent.trim(), 10) || 0 : 0;

    if (monitor.hasChanged('notifCount', count)) {
      monitor.send('GITHUB_NOTIFICATIONS', { count, hasUnread, url: location.href });
    }
  }, 2000);

  // ─── PR / Issue Context ────────────────────────────────────────────────────

  const sendPageContext = monitor.debounce(() => {
    const path = location.pathname;

    // Notification list page
    if (path === '/notifications') {
      const items = document.querySelectorAll('.notifications-list-item');
      const unread = Array.from(items).filter((el) => el.classList.contains('unread'));
      monitor.send('GITHUB_NOTIFICATION_LIST', {
        total: items.length,
        unread: unread.length,
      });
      return;
    }

    // PR or issue page
    const prMatch = path.match(/\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/);
    if (prMatch) {
      const [, owner, repo, type, number] = prMatch;
      const title = document.querySelector('.js-issue-title')?.textContent?.trim();
      const state = document.querySelector('.State')?.textContent?.trim();
      const reviews = document.querySelectorAll('.review-summary-container').length;

      monitor.send('GITHUB_PR_CONTEXT', {
        owner,
        repo,
        type,
        number: parseInt(number, 10),
        title,
        state,
        reviews,
        url: location.href,
      });
    }
  }, 1500);

  // ─── Watchers ──────────────────────────────────────────────────────────────

  monitor.watch(
    'head title',
    () => {
      sendNotificationCount();
      sendPageContext();
    },
    {
      observeId: 'title',
      childList: true,
      subtree: true,
      characterData: true,
    },
  );

  // Navigation events (GitHub is a SPA)
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendPageContext, 800);
  };
  window.addEventListener('popstate', () => setTimeout(sendPageContext, 800));

  sendNotificationCount();
  sendPageContext();
})();
