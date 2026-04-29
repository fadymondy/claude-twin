/**
 * Orchestra Twin Bridge — Google Meet Content Script
 *
 * Monitors:
 * - Meeting start/end detection
 * - Live caption extraction via MutationObserver
 * - Participant list collection
 *
 * Privacy: all caption data stays local. Caption monitoring is OPT-IN.
 * A meeting_detected event is sent first; the service worker handles the
 * opt-in prompt before captions are forwarded.
 */

(() => {
  if (window.__TwinGMeetLoaded) return;
  window.__TwinGMeetLoaded = true;

  const monitor = new TwinMonitor('gmeet');
  const detectLanguage = (text) => window.TwinLanguage?.detectLanguage(text) ?? 'unknown';

  // ─── State ─────────────────────────────────────────────────────────────────

  let meetingActive = false;
  let captionsEnabled = false; // Only true after user opts in
  let captionObserver = null;
  let meetingId = null; // Ephemeral local ID for grouping captions

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getMeetingTitle() {
    // Google Meet places the meeting code/title in several possible locations
    return (
      document.querySelector('[data-meeting-title]')?.getAttribute('data-meeting-title') ||
      document.querySelector('.u6vdEc')?.textContent?.trim() ||
      document.querySelector('[data-meeting-code]')?.getAttribute('data-meeting-code') ||
      document.title?.replace(' - Google Meet', '').trim() ||
      null
    );
  }

  function getParticipants() {
    // Collect participant names from the grid/list view
    const names = new Set();

    // Tile view: each participant tile has a label
    document.querySelectorAll('[data-participant-id]').forEach((el) => {
      const name = el.querySelector('[data-self-name], .zWGUib, .NsV7d')?.textContent?.trim();
      if (name) names.add(name);
    });

    // People panel (opened sidebar)
    document.querySelectorAll('[data-requested-participant-id], .rua5Nb .cS7sFc').forEach((el) => {
      const name = el.querySelector('.zWGUib, .NsV7d, [data-name]')?.textContent?.trim();
      if (name) names.add(name);
    });

    return [...names];
  }

  function isInMeeting() {
    // Reliable meeting indicators: participant tiles visible OR toolbar visible
    const hasTiles = document.querySelectorAll('[data-participant-id]').length > 0;
    const hasToolbar = !!document.querySelector(
      '[data-call-ended="false"], [jscontroller="kAPMuc"]',
    );
    return hasTiles || hasToolbar;
  }

  // ─── Caption Monitoring ────────────────────────────────────────────────────

  /**
   * Caption containers in Google Meet:
   * - The main caption area is typically a div with role="region" or a
   *   specific aria-label containing "Captions".
   * - Each caption line contains a speaker name and the caption text.
   *
   * Known selectors (subject to Google Meet updates):
   *   .a4cQT          — caption container
   *   .TBMuR          — individual caption item
   *   .zs7s8d.jxFHg   — speaker name within caption
   *   .Mz6pEf         — caption text span
   *
   * We use multiple selectors with fallbacks for resilience.
   */
  const CAPTION_CONTAINER_SELECTORS = [
    '.a4cQT',
    '[jsname="tgaKEf"]',
    '[aria-label*="aption"]',
    '[class*="caption-container"]',
  ];

  const CAPTION_ITEM_SELECTORS = ['.TBMuR', '[jsname="YSg4Rb"]', '[class*="caption-item"]'];
  const SPEAKER_SELECTORS = ['.zs7s8d', '[jsname="r4nke"]', '[class*="speaker"]'];
  const TEXT_SELECTORS = ['.Mz6pEf', '[jsname="tC8NTb"]', '[class*="caption-text"]'];

  function findCaptionContainer() {
    for (const sel of CAPTION_CONTAINER_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function extractCaptionItems(container) {
    for (const sel of CAPTION_ITEM_SELECTORS) {
      const items = container.querySelectorAll(sel);
      if (items.length > 0) return items;
    }
    // Fallback: direct children that look like caption lines
    return container.querySelectorAll(':scope > div');
  }

  function extractSpeakerText(item) {
    let speaker = '';
    let text = '';

    for (const sel of SPEAKER_SELECTORS) {
      const el = item.querySelector(sel);
      if (el) {
        speaker = el.textContent?.trim() ?? '';
        break;
      }
    }

    for (const sel of TEXT_SELECTORS) {
      const el = item.querySelector(sel);
      if (el) {
        text = el.textContent?.trim() ?? '';
        break;
      }
    }

    // Fallback: if no specific elements found, try to split container text
    if (!text && !speaker) {
      const full = item.textContent?.trim() ?? '';
      const colonIdx = full.indexOf(':');
      if (colonIdx > 0 && colonIdx < 40) {
        speaker = full.slice(0, colonIdx).trim();
        text = full.slice(colonIdx + 1).trim();
      } else {
        text = full;
      }
    }

    return { speaker, text };
  }

  // Track last-seen caption to avoid re-sending identical lines
  let lastCaptionKey = '';

  function processCaptionMutations(container) {
    const items = extractCaptionItems(container);

    items.forEach((item) => {
      const { speaker, text } = extractSpeakerText(item);
      if (!text || text.length < 2) return;

      const key = `${speaker}:${text}`;
      if (key === lastCaptionKey) return;
      lastCaptionKey = key;

      const lang = detectLanguage(text);
      monitor.send('caption', {
        meetingId,
        speaker: speaker || 'Unknown',
        text,
        lang,
        ts: Date.now(),
      });
    });
  }

  function startCaptionMonitoring() {
    if (captionObserver) return; // already running

    const container = findCaptionContainer();
    if (!container) {
      // Retry in 3s — captions may not be active yet
      setTimeout(() => {
        if (captionsEnabled && meetingActive) startCaptionMonitoring();
      }, 3000);
      return;
    }

    captionObserver = new MutationObserver(() => processCaptionMutations(container));
    captionObserver.observe(container, { childList: true, subtree: true, characterData: true });

    // Process any already-visible captions
    processCaptionMutations(container);
  }

  function stopCaptionMonitoring() {
    if (captionObserver) {
      captionObserver.disconnect();
      captionObserver = null;
    }
    lastCaptionKey = '';
  }

  // ─── Listen for opt-in approval from service worker ───────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'MEETING_CAPTIONS_ENABLED' && message.source === 'gmeet') {
      captionsEnabled = true;
      if (meetingActive) startCaptionMonitoring();
    }
    if (message.type === 'MEETING_CAPTIONS_DISABLED' && message.source === 'gmeet') {
      captionsEnabled = false;
      stopCaptionMonitoring();
    }
  });

  // ─── Meeting State Detection ───────────────────────────────────────────────

  const sendMeetingState = monitor.debounce(() => {
    const inMeeting = isInMeeting();
    const participants = getParticipants();
    const title = getMeetingTitle();

    if (monitor.hasChanged('meet_state', { inMeeting, participantCount: participants.length })) {
      if (inMeeting && !meetingActive) {
        meetingActive = true;
        meetingId = `gmeet_${Date.now()}`;

        // Step 1: Notify that a meeting was detected — service worker shows opt-in prompt
        monitor.send('meeting_detected', {
          platform: 'google_meet',
          title,
          participants,
          meetingId,
          url: location.href,
        });

        // Step 2: Send formal meeting_started event for recording
        monitor.send('meeting_started', {
          platform: 'google_meet',
          title,
          participants,
          meetingId,
          url: location.href,
          ts: Date.now(),
        });

        // Caption monitoring starts only if opt-in was already given
        if (captionsEnabled) startCaptionMonitoring();
      } else if (!inMeeting && meetingActive) {
        meetingActive = false;
        stopCaptionMonitoring();

        monitor.send('meeting_ended', {
          platform: 'google_meet',
          meetingId,
          url: location.href,
          ts: Date.now(),
        });

        meetingId = null;
        captionsEnabled = false;
      } else if (inMeeting && monitor.hasChanged('meet_participants', participants.length)) {
        monitor.send('GMEET_PARTICIPANT_UPDATE', {
          participantCount: participants.length,
          participants,
          url: location.href,
        });
      }
    }
  }, 3000);

  // Watch body for DOM changes that indicate meeting state transitions
  monitor.watch('body', sendMeetingState, {
    observeId: 'meet_body',
    childList: true,
    subtree: false,
  });

  sendMeetingState();
})();
