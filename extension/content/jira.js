/**
 * Orchestra Twin Bridge — Jira (Atlassian) Content Script
 */

(() => {
  if (window.__TwinJiraLoaded) return;
  window.__TwinJiraLoaded = true;

  const monitor = new TwinMonitor('jira');

  const sendPageContext = monitor.debounce(() => {
    const path = location.pathname;

    // Issue page: /browse/PROJ-123
    const issueMatch = path.match(/\/browse\/([A-Z]+-\d+)/);
    if (issueMatch) {
      const issueKey = issueMatch[1];
      const title =
        document
          .querySelector('[data-testid="issue.views.issue-base.foundation.summary.heading"]')
          ?.textContent?.trim() || document.title;
      const statusEl = document.querySelector(
        '[data-testid="issue.views.issue-base.foundation.status.status-field-wrapper"]',
      );
      const status = statusEl?.textContent?.trim();

      if (monitor.hasChanged('jira_issue', issueKey)) {
        monitor.send('JIRA_ISSUE_VIEWED', { issueKey, title, status, url: location.href });
      }
      return;
    }

    // Board page
    if (path.includes('/boards')) {
      const cards = document.querySelectorAll('[data-testid="platform-board-kit.ui.card.card"]');
      if (monitor.hasChanged('jira_board', cards.length)) {
        monitor.send('JIRA_BOARD_VIEWED', { cardCount: cards.length, url: location.href });
      }
    }
  }, 1500);

  // Navigation
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendPageContext, 800);
  };
  window.addEventListener('popstate', () => setTimeout(sendPageContext, 800));

  sendPageContext();
})();
