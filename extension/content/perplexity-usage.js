/**
 * Orchestra Twin Bridge — Perplexity.ai Usage Content Script
 */

(() => {
  if (window.__TwinPerplexityUsageLoaded) return;
  window.__TwinPerplexityUsageLoaded = true;

  // Only run on settings/account pages
  if (!location.pathname.includes('/settings') && !location.pathname.includes('/account')) return;

  const monitor = new TwinMonitor('perplexity');

  const SEL = {
    settingsContainer: '[data-testid="settings-container"], [class*="settings-container"], main',
    planBadge: '[data-testid="plan-name"], [class*="plan-name"], [class*="subscription-plan"]',
    queriesUsed:
      '[data-testid="queries-used"], [class*="queries-used"], [class*="pro-queries-used"]',
    queriesRemaining:
      '[data-testid="queries-remaining"], [class*="queries-remaining"], [class*="pro-queries-left"]',
    renewalDate: '[data-testid="renewal-date"], [class*="renewal-date"], [class*="next-renewal"]',
    usageBar: '[data-testid="usage-progress"], [class*="usage-progress"], [role="progressbar"]',
  };

  const parseNumber = (text) => {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const sendUsageUpdate = monitor.debounce(() => {
    const planEl = document.querySelector(SEL.planBadge);
    const usedEl = document.querySelector(SEL.queriesUsed);
    const remainingEl = document.querySelector(SEL.queriesRemaining);
    const renewalEl = document.querySelector(SEL.renewalDate);
    const barEl = document.querySelector(SEL.usageBar);

    // Try reading usage from progress bar aria attributes as fallback
    const barValue = barEl
      ? parseNumber(barEl.getAttribute('aria-valuenow') || barEl.getAttribute('value'))
      : null;
    const barMax = barEl
      ? parseNumber(barEl.getAttribute('aria-valuemax') || barEl.getAttribute('max'))
      : null;

    const payload = {
      plan: planEl?.textContent?.trim() || null,
      queries_used: parseNumber(usedEl?.textContent) ?? barValue,
      queries_remaining:
        parseNumber(remainingEl?.textContent) ??
        (barMax && barValue !== null ? barMax - barValue : null),
      renewal_date: renewalEl?.textContent?.trim() || null,
      url: location.href,
    };

    if (monitor.hasChanged('perplexity_usage', payload)) {
      monitor.send('cost_update', { source: 'perplexity', type: 'cost_update', data: payload });
    }
  }, 2000);

  monitor.watch(SEL.settingsContainer, sendUsageUpdate, {
    observeId: 'settings-main',
    childList: true,
    subtree: true,
  });

  // SPA navigation
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendUsageUpdate, 600);
  };

  sendUsageUpdate();
})();
