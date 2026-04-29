/**
 * Orchestra Twin Bridge — Claude.ai Usage Content Script
 */

(() => {
  if (window.__TwinClaudeUsageLoaded) return;
  window.__TwinClaudeUsageLoaded = true;

  // Only run on settings/usage pages
  if (!location.pathname.startsWith('/settings') && !location.pathname.startsWith('/usage')) return;

  const monitor = new TwinMonitor('claude');

  const SEL = {
    usageContainer: '[data-testid="usage-section"], .usage-section, main [class*="usage"]',
    planBadge: '[data-testid="plan-badge"], [class*="plan-badge"], [class*="subscription-tier"]',
    tokensUsed: '[data-testid="tokens-used"], [class*="tokens-used"], [class*="usage-amount"]',
    creditsLeft: '[data-testid="credits-remaining"], [class*="credits-remaining"]',
    periodLabel: '[data-testid="billing-period"], [class*="billing-period"], [class*="reset-date"]',
    totalCost: '[data-testid="total-cost"], [class*="total-cost"], [class*="amount-due"]',
  };

  const parseNumber = (text) => {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const sendUsageUpdate = monitor.debounce(() => {
    const planEl = document.querySelector(SEL.planBadge);
    const tokensEl = document.querySelector(SEL.tokensUsed);
    const creditsEl = document.querySelector(SEL.creditsLeft);
    const periodEl = document.querySelector(SEL.periodLabel);
    const totalEl = document.querySelector(SEL.totalCost);

    const payload = {
      plan: planEl?.textContent?.trim() || null,
      tokens_used: parseNumber(tokensEl?.textContent),
      credits_remaining: parseNumber(creditsEl?.textContent),
      period: periodEl?.textContent?.trim() || null,
      total: parseNumber(totalEl?.textContent),
      url: location.href,
    };

    if (monitor.hasChanged('claude_usage', payload)) {
      monitor.send('cost_update', { source: 'claude', type: 'cost_update', data: payload });
    }
  }, 2000);

  monitor.watch(SEL.usageContainer, sendUsageUpdate, {
    observeId: 'usage-main',
    childList: true,
    subtree: true,
  });

  // SPA navigation (claude.ai is React-based)
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendUsageUpdate, 600);
  };

  sendUsageUpdate();
})();
