/**
 * Orchestra Twin Bridge — GCP Billing Content Script
 */

(() => {
  if (window.__TwinGcpBillingLoaded) return;
  window.__TwinGcpBillingLoaded = true;

  // Only run on billing-related pages
  if (!location.pathname.includes('/billing')) return;

  const monitor = new TwinMonitor('gcp');

  const SEL = {
    totalCost:
      '[data-test-id="cost-summary-total"], .cfc-billing-account-overview-cost-amount, [jsname="cost-amount"]',
    costCards: '[data-test-id="cost-card"], .cfc-billing-service-cost-card, .billing-summary-card',
    serviceRows: 'table tr[data-test-id], .cfc-billing-account-cost-table tbody tr',
    projectName:
      '[data-test-id="project-name"], .cfc-billing-account-name, .billing-account-display-name',
    currency: '[data-test-id="currency-code"], .currency-code',
  };

  const parseCost = (text) => {
    if (!text) return null;
    const match = text.replace(/,/g, '').match(/[\d.]+/);
    return match ? parseFloat(match[0]) : null;
  };

  const sendCostUpdate = monitor.debounce(() => {
    const totalEl = document.querySelector(SEL.totalCost);
    const projectEl = document.querySelector(SEL.projectName);
    const currencyEl = document.querySelector(SEL.currency);

    const total = parseCost(totalEl?.textContent);
    const project = projectEl?.textContent?.trim() || null;
    const currency = currencyEl?.textContent?.trim() || 'USD';

    // Build breakdown from service rows
    const rows = document.querySelectorAll(SEL.serviceRows);
    const breakdown = Array.from(rows)
      .slice(0, 10)
      .reduce((acc, row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 2) {
          const service = cells[0]?.textContent?.trim();
          const cost = parseCost(cells[cells.length - 1]?.textContent);
          if (service && cost !== null) acc.push({ service, cost });
        }
        return acc;
      }, []);

    const payload = { total, currency, breakdown, project, url: location.href };

    if (monitor.hasChanged('gcp_cost', payload)) {
      monitor.send('cost_update', { source: 'gcp', type: 'cost_update', data: payload });
    }
  }, 2000);

  // Watch the main billing summary container
  monitor.watch(
    '[data-test-id="billing-overview"], .cfc-billing-account-overview, main',
    sendCostUpdate,
    {
      observeId: 'billing-main',
      childList: true,
      subtree: true,
    },
  );

  // SPA navigation (GCP is a single-page app)
  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendCostUpdate, 800);
  };

  sendCostUpdate();
})();
