/**
 * Orchestra Twin Bridge — Messenger
 *
 * Thin wrapper around chrome.runtime.sendMessage with:
 * - Error handling (handles disconnected service worker gracefully)
 * - Optional response callback
 * - Debug logging
 */

// Prevent double-injection
if (typeof window.__TwinMessengerLoaded === 'undefined') {
  window.__TwinMessengerLoaded = true;

  window.TwinMessenger = {
    /**
     * Send a message to the service worker.
     * @param {object}   message  — Message payload (must include `type`)
     * @param {Function} [onResponse] — Optional response callback
     * @returns {Promise<any>}
     */
    send(message, onResponse) {
      return new Promise((resolve, reject) => {
        try {
          chrome.runtime.sendMessage(message, (response) => {
            const err = chrome.runtime.lastError;

            if (err) {
              // "Could not establish connection" is expected when SW is sleeping
              if (!err.message?.includes('Could not establish connection')) {
                console.warn('[TwinMessenger] Send error:', err.message);
              }
              resolve(null);
              return;
            }

            if (onResponse) onResponse(response);
            resolve(response);
          });
        } catch (err) {
          // Extension context may be invalidated after update/reload
          if (!err.message?.includes('Extension context invalidated')) {
            console.error('[TwinMessenger] Fatal send error:', err);
          }
          resolve(null);
        }
      });
    },

    /**
     * Send a typed event from a content script.
     * @param {string} source    — Service name (e.g. 'gmail')
     * @param {string} type      — Event type
     * @param {object} data      — Event data
     */
    event(source, type, data = {}) {
      return this.send({ type, source, data, timestamp: Date.now() });
    },
  };
}
