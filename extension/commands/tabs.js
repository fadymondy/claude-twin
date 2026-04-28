/**
 * claude-twin — tab management actions.
 *
 * Registers `tabs`, `open`, `close` against the SW dispatcher. New tabs
 * default to joining the "claude-twin" tab group so background activity
 * stays out of the user's way.
 */

import { registerAction } from './handler.js';

const GROUP_TITLE = 'claude-twin';
const GROUP_COLOR = 'purple';

registerAction('tabs', async () => {
  const tabs = await chrome.tabs.query({});
  return {
    tabs: tabs.map((t) => ({
      id: t.id ?? null,
      url: t.url ?? null,
      title: t.title ?? null,
      active: !!t.active,
      windowId: t.windowId ?? null,
      groupId: t.groupId ?? null,
      pinned: !!t.pinned,
    })),
  };
});

registerAction('open', async (params) => {
  const url = String(params.url ?? '');
  if (!/^https?:\/\//.test(url)) {
    throw new Error('open: url must be http(s)');
  }
  const active = params.active === true;
  const group = params.group !== false; // default true

  const tab = await chrome.tabs.create({ url, active });
  if (group && tab.id !== undefined) {
    await addToTwinGroup(tab.id).catch((err) => {
      console.warn('[claude-twin] tabGroup add failed:', err.message);
    });
  }
  return { tab_id: tab.id ?? null, url: tab.url ?? null };
});

registerAction('close', async (params) => {
  const id = Number(params.tab_id);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('close: tab_id must be a positive integer');
  }
  await chrome.tabs.remove(id);
  return { closed: true, tab_id: id };
});

/**
 * Adds a tab to the "claude-twin" tab group, creating the group if needed.
 * The group is collapsed so it stays out of the user's way.
 */
async function addToTwinGroup(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const windowId = tab.windowId;
  if (windowId === undefined) return;

  const groups = await chrome.tabGroups.query({ title: GROUP_TITLE, windowId });
  if (groups.length > 0) {
    const groupId = groups[0].id;
    await chrome.tabs.group({ groupId, tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { collapsed: true });
    return;
  }

  const groupId = await chrome.tabs.group({ tabIds: [tabId] });
  await chrome.tabGroups.update(groupId, {
    title: GROUP_TITLE,
    color: GROUP_COLOR,
    collapsed: true,
  });
}
