/**
 * claude-twin — offscreen document.
 *
 * For #4 (scaffold) this is a placeholder. The persistent WebSocket
 * connection to the MCP server (with auth, reconnect, queue, ping
 * keepalive) lands in #5.
 */

console.log('[claude-twin:offscreen] booted');

chrome.runtime.sendMessage({ type: 'OFFSCREEN_INIT' }, (response) => {
  if (chrome.runtime.lastError) {
    console.warn('[claude-twin:offscreen] init failed:', chrome.runtime.lastError.message);
    return;
  }
  console.log('[claude-twin:offscreen] init response:', response);
});
