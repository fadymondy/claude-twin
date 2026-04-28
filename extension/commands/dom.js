/**
 * claude-twin — DOM interaction actions.
 *
 * Registers `click`, `fill`, `screenshot`. Honours a small selector
 * blocklist so the bridge never auto-fills credential fields without an
 * explicit user-side override.
 */

import { registerAction } from './handler.js';

const BLOCKED_SELECTOR_PATTERNS = [
  /\[type=["']?password["']?\]/i,
  /input\[type=["']?password["']?\]/i,
  /\[autocomplete=["']?(current|new)-password["']?\]/i,
  /#password\b/,
  /\[name=["']?password["']?\]/i,
];

function isBlockedSelector(selector) {
  if (typeof selector !== 'string' || selector.trim() === '') return true;
  return BLOCKED_SELECTOR_PATTERNS.some((re) => re.test(selector));
}

async function execInTab(tabId, func, args) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
    world: 'MAIN',
  });
  return results?.[0]?.result;
}

registerAction('click', async (params) => {
  const tabId = Number(params.tab_id);
  const selector = String(params.selector ?? '');
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error('click: tab_id must be a positive integer');
  }
  if (isBlockedSelector(selector)) {
    throw new Error(`click: selector blocked by safety policy (${selector})`);
  }

  const ok = await execInTab(
    tabId,
    (sel) => {
      const el = document.querySelector(sel);
      if (!el) return { clicked: false, reason: 'selector did not match' };
      el.click?.();
      return { clicked: true };
    },
    [selector],
  );
  if (!ok?.clicked) {
    throw new Error(ok?.reason ?? 'click failed');
  }
  return { clicked: true, selector, tab_id: tabId };
});

registerAction('fill', async (params) => {
  const tabId = Number(params.tab_id);
  const selector = String(params.selector ?? '');
  const value = String(params.value ?? '');
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error('fill: tab_id must be a positive integer');
  }
  if (isBlockedSelector(selector)) {
    throw new Error(`fill: selector blocked by safety policy (${selector})`);
  }

  const ok = await execInTab(
    tabId,
    (sel, val) => {
      const el = document.querySelector(sel);
      if (!el) return { filled: false, reason: 'selector did not match' };
      const tag = el.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') {
        const proto = tag === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        setter?.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { filled: true };
      }
      if (el.isContentEditable) {
        el.textContent = val;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
        return { filled: true };
      }
      return { filled: false, reason: `unsupported element type: ${tag}` };
    },
    [selector, value],
  );
  if (!ok?.filled) {
    throw new Error(ok?.reason ?? 'fill failed');
  }
  return { filled: true, selector, tab_id: tabId };
});

registerAction('screenshot', async (params) => {
  const tabId = Number(params.tab_id);
  if (!Number.isInteger(tabId) || tabId <= 0) {
    throw new Error('screenshot: tab_id must be a positive integer');
  }

  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;
  if (windowId === undefined) {
    throw new Error('screenshot: tab has no associated window');
  }

  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  return { data_url: dataUrl, tab_id: tabId };
});
