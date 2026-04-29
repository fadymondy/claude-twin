/**
 * Orchestra Twin Bridge — Linear Content Script
 */

(() => {
  if (window.__TwinLinearLoaded) return;
  window.__TwinLinearLoaded = true;

  const monitor = new TwinMonitor('linear');

  const sendInboxSummary = monitor.debounce(() => {
    const inboxItems = document.querySelectorAll("[data-testid='inbox-item']");
    const countEl = document.querySelector("[data-testid='inbox-count']");
    const count = countEl
      ? parseInt(countEl.textContent, 10) || inboxItems.length
      : inboxItems.length;

    if (monitor.hasChanged('linear_inbox', count)) {
      monitor.send('LINEAR_INBOX_COUNT', { count, url: location.href });
    }
  }, 2000);

  const sendIssueContext = monitor.debounce(() => {
    const path = location.pathname;
    const issueMatch = path.match(/\/issue\/([A-Z]+-\d+)/);
    if (issueMatch) {
      const issueId = issueMatch[1];
      const title = document.title.replace(' - Linear', '').trim();
      monitor.send('LINEAR_ISSUE_VIEWED', { issueId, title, url: location.href });
    }
  }, 1000);

  monitor.watch('body', sendInboxSummary, {
    observeId: 'inbox',
    childList: true,
    subtree: false,
  });

  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(() => {
      sendInboxSummary();
      sendIssueContext();
    }, 600);
  };

  sendInboxSummary();
  sendIssueContext();
})();
