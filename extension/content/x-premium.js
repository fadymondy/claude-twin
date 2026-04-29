/**
 * Orchestra Twin Bridge — X Premium Content Script
 */

(() => {
  if (window.__TwinXPremiumLoaded) return;
  window.__TwinXPremiumLoaded = true;

  // Only run on premium/subscription settings pages
  if (
    !location.pathname.includes('/premium') &&
    !location.pathname.includes('/settings/subscription')
  )
    return;

  const monitor = new TwinMonitor('x-premium');

  const SEL = {
    premiumContainer: '[data-testid="premium-container"], [data-testid="subscriptions-page"], main',
    planName: '[data-testid="premium-plan-name"], [data-testid="subscription-tier"]',
    statusBadge: '[data-testid="subscription-status"], [data-testid="premium-status"]',
    renewalDate: '[data-testid="renewal-date"], [data-testid="next-billing-date"]',
    monthlyCost: '[data-testid="subscription-price"], [data-testid="billing-amount"]',
    featureList: '[data-testid="premium-feature"], [data-testid="feature-item"]',
  };

  const parseCost = (text) => {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const sendPremiumUpdate = monitor.debounce(() => {
    const planEl = document.querySelector(SEL.planName);
    const statusEl = document.querySelector(SEL.statusBadge);
    const renewalEl = document.querySelector(SEL.renewalDate);
    const costEl = document.querySelector(SEL.monthlyCost);

    const payload = {
      plan: planEl?.textContent?.trim() || null,
      status: statusEl?.textContent?.trim() || null,
      renewal_date: renewalEl?.textContent?.trim() || null,
      monthly_cost: parseCost(costEl?.textContent),
      url: location.href,
    };

    if (monitor.hasChanged('x_premium', payload)) {
      monitor.send('cost_update', { source: 'x-premium', type: 'cost_update', data: payload });
    }
  }, 2000);

  monitor.watch(SEL.premiumContainer, sendPremiumUpdate, {
    observeId: 'premium-main',
    childList: true,
    subtree: true,
  });

  // SPA navigation (X is React-based)
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    // Re-check path after navigation
    if (
      location.pathname.includes('/premium') ||
      location.pathname.includes('/settings/subscription')
    ) {
      setTimeout(sendPremiumUpdate, 600);
    }
  };

  sendPremiumUpdate();
})();
