/**
 * Orchestra Twin Bridge — Zoom Web Client Content Script
 *
 * Monitors:
 * - Meeting start/end detection (Zoom web client at app.zoom.us)
 * - Live closed caption extraction via MutationObserver
 * - Participant list collection
 *
 * Privacy: all caption data stays local. Caption monitoring is OPT-IN.
 * A meeting_detected event is sent first; the service worker handles the
 * opt-in prompt before captions are forwarded.
 */

(() => {
  if (window.__TwinZoomLoaded) return;
  window.__TwinZoomLoaded = true;

  const monitor = new TwinMonitor('zoom');
  const detectLanguage = (text) => window.TwinLanguage?.detectLanguage(text) ?? 'unknown';

  // ─── State ─────────────────────────────────────────────────────────────────

  let meetingActive = false;
  let captionsEnabled = false;
  let captionObserver = null;
  let meetingId = null;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getMeetingTitle() {
    return (
      document.querySelector("[data-testid='meeting-title']")?.textContent?.trim() ||
      document.querySelector('.meeting-title')?.textContent?.trim() ||
      document.querySelector('[aria-label*="meeting"]')?.textContent?.trim() ||
      document.title?.replace('Zoom Meeting', '').trim() ||
      null
    );
  }

  function getParticipants() {
    const names = new Set();

    // Participants panel list items
    document.querySelectorAll("[data-testid='participant-panel'] li").forEach((li) => {
      const name = li
        .querySelector('[data-testid="participant-name"], .participant-name')
        ?.textContent?.trim();
      if (name) names.add(name);
    });

    // Video tiles in meeting view
    document
      .querySelectorAll('[data-testid="video-tile"] [data-testid="participant-name"]')
      .forEach((el) => {
        const name = el.textContent?.trim();
        if (name) names.add(name);
      });

    // Fallback: attendee list items
    document.querySelectorAll('.participants-list-item__name, .attendee-name').forEach((el) => {
      const name = el.textContent?.trim();
      if (name) names.add(name);
    });

    return [...names];
  }

  function isInMeeting() {
    const path = location.pathname;
    if (!path.includes('/meeting') && !path.includes('/wc/')) return false;

    // Confirm meeting is actually active (not just the pre-join screen)
    const hasVideo = !!document.querySelector('[data-testid="video-tile"], .video-tile');
    const hasControls = !!document.querySelector(
      "[data-testid='meeting-controls'], .meeting-controls, [data-testid='leave-btn']",
    );
    return hasVideo || hasControls;
  }

  // ─── Caption Monitoring ────────────────────────────────────────────────────

  /**
   * Zoom web client caption containers:
   *   [data-testid='live-transcription']   — live transcript panel
   *   .caption-container                   — classic caption overlay
   *   [data-testid='closed-caption']       — closed caption container
   *   .zmWebSDKCCContainer                 — Web SDK caption container
   *
   * Each item typically contains:
   *   .transcript-speaker / [data-testid='speaker-name']  — speaker
   *   .transcript-text / [data-testid='transcript-text']  — text
   */
  const CAPTION_CONTAINER_SELECTORS = [
    "[data-testid='live-transcription']",
    "[data-testid='closed-caption']",
    '.caption-container',
    '.zmWebSDKCCContainer',
    '[class*="caption-container"]',
    '[class*="transcript-container"]',
  ];

  const CAPTION_ITEM_SELECTORS = [
    '.transcript-item',
    '[data-testid="transcript-item"]',
    '.caption-item',
    '.cc-item',
  ];

  const SPEAKER_SELECTORS = [
    '.transcript-speaker',
    '[data-testid="speaker-name"]',
    '.speaker-name',
    '.cc-speaker',
  ];

  const TEXT_SELECTORS = [
    '.transcript-text',
    '[data-testid="transcript-text"]',
    '.caption-text',
    '.cc-text',
  ];

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

    // Fallback: split on colon for "Name: text" format
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
    if (captionObserver) return;

    const container = findCaptionContainer();
    if (!container) {
      // Retry — captions panel may not have been opened yet
      setTimeout(() => {
        if (captionsEnabled && meetingActive) startCaptionMonitoring();
      }, 3000);
      return;
    }

    captionObserver = new MutationObserver(() => processCaptionMutations(container));
    captionObserver.observe(container, { childList: true, subtree: true, characterData: true });

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
    if (message.type === 'MEETING_CAPTIONS_ENABLED' && message.source === 'zoom') {
      captionsEnabled = true;
      if (meetingActive) startCaptionMonitoring();
    }
    if (message.type === 'MEETING_CAPTIONS_DISABLED' && message.source === 'zoom') {
      captionsEnabled = false;
      stopCaptionMonitoring();
    }
  });

  // ─── Meeting State Detection ───────────────────────────────────────────────

  const sendMeetingState = monitor.debounce(() => {
    const inMeeting = isInMeeting();
    const participants = getParticipants();
    const title = getMeetingTitle();
    const isRecording = !!document.querySelector(
      "[data-testid='recording-status'], .recording-status",
    );

    if (monitor.hasChanged('zoom_meeting_active', inMeeting)) {
      if (inMeeting && !meetingActive) {
        meetingActive = true;
        meetingId = `zoom_${Date.now()}`;

        // Step 1: Notify that a meeting was detected — service worker shows opt-in prompt
        monitor.send('meeting_detected', {
          platform: 'zoom',
          title,
          participants,
          meetingId,
          url: location.href,
        });

        // Step 2: Formal meeting started event
        monitor.send('meeting_started', {
          platform: 'zoom',
          title,
          participants,
          meetingId,
          isRecording,
          url: location.href,
          ts: Date.now(),
        });

        if (captionsEnabled) startCaptionMonitoring();
      } else if (!inMeeting && meetingActive) {
        meetingActive = false;
        stopCaptionMonitoring();

        monitor.send('meeting_ended', {
          platform: 'zoom',
          meetingId,
          url: location.href,
          ts: Date.now(),
        });

        meetingId = null;
        captionsEnabled = false;
      } else if (inMeeting && monitor.hasChanged('zoom_participants', participants.length)) {
        monitor.send('ZOOM_PARTICIPANT_UPDATE', {
          participantCount: participants.length,
          participants,
          isRecording,
          url: location.href,
        });
      }
    }

    // Upcoming meetings (home page)
    if (!inMeeting) {
      const upcomingMeetings = document.querySelectorAll(
        "[data-testid='upcoming-meetings'] [data-testid='meeting-item']",
      );
      if (monitor.hasChanged('zoom_upcoming', upcomingMeetings.length)) {
        monitor.send('ZOOM_UPCOMING_MEETINGS', {
          count: upcomingMeetings.length,
          url: location.href,
        });
      }
    }
  }, 2000);

  // ─── SPA navigation handling ───────────────────────────────────────────────

  const origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    origPushState(...args);
    setTimeout(sendMeetingState, 600);
  };
  window.addEventListener('popstate', () => setTimeout(sendMeetingState, 600));

  // Watch for meeting UI mounting/unmounting
  monitor.watch('body', sendMeetingState, {
    observeId: 'zoom_body',
    childList: true,
    subtree: false,
  });

  sendMeetingState();
})();
