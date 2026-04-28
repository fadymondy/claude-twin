/**
 * claude-twin — Google search proxy.
 *
 * Opens https://www.google.com/search?q=<query> in a background tab,
 * scrapes the visible results (title / url / snippet), then closes the
 * tab. Times out cleanly after 15s.
 */

import { registerAction } from './handler.js';

const SEARCH_URL = 'https://www.google.com/search?q=';
const LOAD_TIMEOUT_MS = 15_000;

registerAction('search', async (params) => {
  const query = String(params.query ?? '').trim();
  if (!query) throw new Error('search: query is required');

  const url = SEARCH_URL + encodeURIComponent(query);
  const tab = await chrome.tabs.create({ url, active: false });
  const tabId = tab.id;
  if (tabId === undefined) throw new Error('search: failed to create tab');

  try {
    await waitForTabComplete(tabId, LOAD_TIMEOUT_MS);
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeResults,
    });
    return { query, results: results?.[0]?.result ?? [] };
  } finally {
    chrome.tabs.remove(tabId).catch(() => {
      /* tab may already be gone */
    });
  }
});

function waitForTabComplete(tabId, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error(`search: tab load timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        // Give Google's JS one tick to settle.
        setTimeout(resolve, 250);
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

/**
 * Runs in the page's main world. Returns the visible organic results from
 * a Google SERP. Selectors are intentionally broad so they survive minor
 * Google A/B layouts.
 */
function scrapeResults() {
  const blocks = document.querySelectorAll('div.g, div[data-hveid]');
  const results = [];
  blocks.forEach((block) => {
    const a = block.querySelector('a[href]:not([role="button"])');
    if (!a) return;
    const href = a.getAttribute('href');
    if (!href || !href.startsWith('http')) return;

    const titleEl = a.querySelector('h3') || block.querySelector('h3');
    const title = titleEl?.textContent?.trim();
    if (!title) return;

    const snippetEl =
      block.querySelector('[data-sncf]') ||
      block.querySelector('div.VwiC3b') ||
      block.querySelector('span.aCOpRe');
    const snippet = snippetEl?.textContent?.trim() || null;

    if (!results.some((r) => r.url === href)) {
      results.push({ title, url: href, snippet });
    }
  });
  return results.slice(0, 10);
}
