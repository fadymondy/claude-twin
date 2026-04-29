/**
 * Orchestra Twin Bridge — OpenAI Platform Usage Content Script
 */

(() => {
  if (window.__TwinOpenAIUsageLoaded) return;
  window.__TwinOpenAIUsageLoaded = true;

  // Only run on usage/billing pages
  if (!location.pathname.includes('/usage') && !location.pathname.includes('/billing')) return;

  const monitor = new TwinMonitor('openai');

  const SEL = {
    totalCost:
      '[data-testid="usage-total-cost"], .usage-total-cost, [class*="total-cost"], [class*="monthly-total"]',
    dailyRows: '[data-testid="daily-usage-row"], .daily-usage-row, table tbody tr',
    apiCallCount: '[data-testid="api-call-count"], [class*="api-calls"], [class*="request-count"]',
    periodLabel: '[data-testid="billing-period"], [class*="billing-period"]',
    modelRows: '[data-testid="model-usage-row"], [class*="model-row"]',
    creditBalance:
      '[data-testid="credit-balance"], [class*="credit-balance"], [class*="credits-remaining"]',
  };

  const parseCost = (text) => {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const sendUsageUpdate = monitor.debounce(() => {
    const totalEl = document.querySelector(SEL.totalCost);
    const periodEl = document.querySelector(SEL.periodLabel);
    const apiEl = document.querySelector(SEL.apiCallCount);
    const creditEl = document.querySelector(SEL.creditBalance);

    // Compute daily average from visible rows
    const dailyRows = document.querySelectorAll(SEL.dailyRows);
    const dailyCosts = Array.from(dailyRows)
      .map((row) => {
        const cells = row.querySelectorAll('td');
        return parseCost(cells[cells.length - 1]?.textContent);
      })
      .filter((v) => v !== null);
    const dailyAvg =
      dailyCosts.length > 0 ? dailyCosts.reduce((a, b) => a + b, 0) / dailyCosts.length : null;

    const payload = {
      total: parseCost(totalEl?.textContent),
      daily_avg: dailyAvg ? parseFloat(dailyAvg.toFixed(4)) : null,
      api_calls: parseCost(apiEl?.textContent),
      credit_balance: parseCost(creditEl?.textContent),
      period: periodEl?.textContent?.trim() || null,
      url: location.href,
    };

    if (monitor.hasChanged('openai_usage', payload)) {
      monitor.send('cost_update', { source: 'openai', type: 'cost_update', data: payload });
    }
  }, 2000);

  monitor.watch('[data-testid="usage-container"], .usage-container, main', sendUsageUpdate, {
    observeId: 'usage-main',
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
