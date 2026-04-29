/**
 * Orchestra Twin Bridge — TwinMonitor
 *
 * Base class for all content scripts. Provides:
 * - send(type, data)     — emit events to the service worker
 * - watch(selector, cb)  — observe DOM changes on a selector
 * - debounce(fn, ms)     — debounce wrapper
 * - lastState            — store previous state for change detection
 */

// Prevent double-injection
if (typeof window.__TwinMonitorLoaded === 'undefined') {
  window.__TwinMonitorLoaded = true;

  class TwinMonitor {
    /**
     * @param {string} source — Service identifier (e.g. 'gmail', 'slack')
     */
    constructor(source) {
      this.source = source;
      this.lastState = {};
      this._observers = new Map();
      this._retryTimers = new Map();
      this._privacyMode = false;
      this._enabled = false; // stays false until enabledOrigins check passes

      // Load privacy mode + enabled state once
      chrome.storage.local.get(
        ['privacyMode', 'enabledOrigins'],
        ({ privacyMode, enabledOrigins }) => {
          this._privacyMode = !!privacyMode;
          this._enabled = this._hostIsEnabled(enabledOrigins || []);
        },
      );

      // React to setting changes live
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes.privacyMode !== undefined) {
          this._privacyMode = !!changes.privacyMode.newValue;
        }
        if (changes.enabledOrigins !== undefined) {
          const wasEnabled = this._enabled;
          this._enabled = this._hostIsEnabled(changes.enabledOrigins.newValue || []);
          // If disabled while running, tear down all observers
          if (wasEnabled && !this._enabled) this.destroy();
        }
      });
    }

    /**
     * Check whether the current page's hostname is covered by any of the
     * user-enabled origin patterns (e.g. "*://linear.app/*").
     * @private
     */
    _hostIsEnabled(enabledOrigins) {
      const host = window.location.hostname;
      return enabledOrigins.some((pattern) => {
        // Strip protocol wildcard and path wildcard: "*://foo.com/*" → "foo.com"
        const hostPart = pattern.replace(/^\*?:\/\//, '').replace(/\/.*$/, '');
        if (hostPart.startsWith('*.')) {
          return host.endsWith(hostPart.slice(1)); // *.atlassian.net → .atlassian.net
        }
        return host === hostPart;
      });
    }

    /**
     * Send an event to the service worker for forwarding to the Twin server.
     * @param {string} type  — Event type (e.g. 'NEW_MESSAGE', 'UNREAD_COUNT')
     * @param {object} data  — Payload data
     */
    send(type, data) {
      if (!this._enabled) return; // user hasn't enabled this domain
      if (this._privacyMode) {
        // In privacy mode, send only metadata — no content
        data = this._sanitize(data);
      }

      const message = {
        type,
        source: this.source,
        data,
        timestamp: Date.now(),
      };

      chrome.runtime.sendMessage(message).catch((err) => {
        // Service worker may be inactive — this is expected
        if (!err.message?.includes('Could not establish connection')) {
          console.warn(`[TwinMonitor:${this.source}] Send failed:`, err.message);
        }
      });
    }

    /**
     * Watch a DOM selector with MutationObserver.
     * Auto-retries every 2s if element not found (up to maxRetries).
     *
     * @param {string}   selector   — CSS selector
     * @param {Function} callback   — Called with (element, mutation) on change
     * @param {object}   options
     * @param {string}   options.observeId   — Unique ID for this watcher (for cleanup)
     * @param {boolean}  options.childList   — Watch child additions/removals (default: true)
     * @param {boolean}  options.subtree     — Watch all descendants (default: false)
     * @param {boolean}  options.attributes  — Watch attribute changes (default: false)
     * @param {string}   options.attributeFilter — Filter to specific attributes
     * @param {boolean}  options.characterData   — Watch text changes (default: false)
     * @param {number}   options.maxRetries  — Max retry attempts before giving up (default: 30)
     */
    watch(selector, callback, options = {}) {
      const {
        observeId = selector,
        childList = true,
        subtree = false,
        attributes = false,
        attributeFilter,
        characterData = false,
        maxRetries = 30,
      } = options;

      let retryCount = 0;

      const setup = () => {
        const el = document.querySelector(selector);

        if (!el) {
          retryCount++;
          if (retryCount > maxRetries) {
            console.warn(
              `[TwinMonitor:${this.source}] Element not found after ${maxRetries} retries: ${selector}`,
            );
            return;
          }
          const timer = setTimeout(setup, 2000);
          this._retryTimers.set(observeId, timer);
          return;
        }

        // Clear any pending retry
        const pending = this._retryTimers.get(observeId);
        if (pending) {
          clearTimeout(pending);
          this._retryTimers.delete(observeId);
        }

        // Disconnect existing observer for this ID
        this.unwatch(observeId);

        const observerOptions = { childList, subtree, attributes, characterData };
        if (attributeFilter) observerOptions.attributeFilter = attributeFilter;

        const observer = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            try {
              callback(el, mutation);
            } catch (err) {
              console.error(`[TwinMonitor:${this.source}] Watch callback error:`, err);
            }
          });
        });

        observer.observe(el, observerOptions);
        this._observers.set(observeId, observer);

        // Trigger initial callback with current state
        try {
          callback(el, null);
        } catch (err) {
          console.error(`[TwinMonitor:${this.source}] Initial callback error:`, err);
        }
      };

      setup();
    }

    /**
     * Stop watching a selector.
     * @param {string} observeId
     */
    unwatch(observeId) {
      const observer = this._observers.get(observeId);
      if (observer) {
        observer.disconnect();
        this._observers.delete(observeId);
      }
    }

    /**
     * Stop all observers and clean up.
     */
    destroy() {
      this._observers.forEach((observer) => observer.disconnect());
      this._observers.clear();
      this._retryTimers.forEach((timer) => clearTimeout(timer));
      this._retryTimers.clear();
    }

    /**
     * Debounce a function call.
     * @param {Function} fn
     * @param {number}   ms — Delay in milliseconds (default: 2000)
     * @returns {Function}
     */
    debounce(fn, ms = 2000) {
      let timer = null;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
      };
    }

    /**
     * Check if a value has changed from lastState.
     * @param {string} key
     * @param {*}      value
     * @returns {boolean}
     */
    hasChanged(key, value) {
      const prev = this.lastState[key];
      const changed = JSON.stringify(prev) !== JSON.stringify(value);
      if (changed) this.lastState[key] = value;
      return changed;
    }

    /**
     * Sanitize data for privacy mode — strip content, keep counts/flags.
     * @private
     */
    _sanitize(data) {
      if (typeof data !== 'object' || data === null) return {};

      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'number') sanitized[key] = value;
        else if (typeof value === 'boolean') sanitized[key] = value;
        else if (key.endsWith('Count') || key.endsWith('count')) sanitized[key] = value;
        else if (key === 'timestamp' || key === 'url') sanitized[key] = value;
        // Strip string content (names, messages, etc.)
      }
      return sanitized;
    }
  }

  // Expose globally for content scripts
  window.TwinMonitor = TwinMonitor;
}
