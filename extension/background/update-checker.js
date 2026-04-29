/**
 * claude-twin — extension auto-update checker.
 *
 * Sideloaded extensions don't get Chrome's automatic update story (that's
 * Web Store only). This module polls the GitHub Releases API on a 6-hour
 * alarm and surfaces a "new version available" banner in the popup when
 * the latest published release tag is newer than the installed manifest
 * version.
 *
 * Storage shape (`updateState`):
 *   {
 *     installed: '0.1.0',
 *     available: '0.1.1' | null,
 *     latestUrl: 'https://github.com/.../releases/tag/v0.1.1' | null,
 *     downloadUrl: 'https://.../claude-twin-extension-v0.1.1.zip' | null,
 *     checkedAt: 1700000000000,
 *     error: null | string,
 *   }
 *
 * The popup reads from this directly. The action-button badge is set
 * here too — a small purple dot when an update is pending.
 */

const RELEASES_API = 'https://api.github.com/repos/fadymondy/claude-twin/releases/latest';
const ALARM_NAME = 'claude-twin-update-check';
const PERIOD_MIN = 6 * 60; // 6 hours
const STORAGE_KEY = 'updateState';

export function armUpdateAlarm() {
  chrome.alarms.get(ALARM_NAME).then((alarm) => {
    if (!alarm) {
      chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: PERIOD_MIN,
        delayInMinutes: 1, // first check ~1 min after install/startup
      });
    }
  });
  chrome.alarms.onAlarm.addListener((a) => {
    if (a.name === ALARM_NAME) void checkForUpdate();
  });
}

/**
 * Run the update check now. Safe to call from a popup button.
 * Returns the persisted updateState.
 */
export async function checkForUpdate() {
  const installed = chrome.runtime.getManifest().version;
  const state = {
    installed,
    available: null,
    latestUrl: null,
    downloadUrl: null,
    checkedAt: Date.now(),
    error: null,
  };

  try {
    const resp = await fetch(RELEASES_API, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const release = await resp.json();
    const tag = String(release.tag_name || '').replace(/^v/, '');
    if (!tag) throw new Error('release has no tag_name');

    if (semverGt(tag, installed)) {
      state.available = tag;
      state.latestUrl = release.html_url || null;
      // Look for an extension zip asset; fall back to the release page.
      const zipAsset = (release.assets || []).find((a) =>
        /claude-twin-extension.*\.zip$/i.test(a.name || ''),
      );
      state.downloadUrl = zipAsset?.browser_download_url || release.html_url || null;
    }
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  }

  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  await updateBadge(state);
  return state;
}

async function updateBadge(state) {
  if (state.available) {
    await chrome.action.setBadgeText({ text: '●' });
    await chrome.action.setBadgeBackgroundColor({ color: '#7c3aed' });
    await chrome.action.setTitle({ title: `claude-twin — v${state.available} available` });
  } else {
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setTitle({ title: 'claude-twin' });
  }
}

/**
 * Tiny semver "greater than" — handles `1.2.3` and `1.2.3-beta.1`.
 * Returns true iff `a` > `b`.
 */
function semverGt(a, b) {
  const parse = (v) => {
    const [main, pre] = v.split('-');
    const nums = main.split('.').map((n) => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre: pre || null };
  };
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i += 1) {
    if (A.nums[i] !== B.nums[i]) return A.nums[i] > B.nums[i];
  }
  // Same major.minor.patch — a release (no pre) outranks a pre-release.
  if (!A.pre && B.pre) return true;
  if (A.pre && !B.pre) return false;
  if (A.pre && B.pre) return A.pre > B.pre;
  return false;
}
