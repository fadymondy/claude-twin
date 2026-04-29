/**
 * Orchestra Twin Bridge — Slack Content Script
 */

(() => {
  if (window.__TwinSlackLoaded) return;
  window.__TwinSlackLoaded = true;

  const monitor = new TwinMonitor('slack');

  const SEL = {
    unreadChannels: '.p-channel_sidebar__channel--unread',
    mentionBadge: '.p-channel_sidebar__badge--mention',
    messageList: "[data-qa='virtual-list-scroll-container']",
    message: "[data-qa='message_content']",
    senderName: "[data-qa='message_sender_name']",
    typingIndicator: "[data-qa='typing_indicator']",
  };

  // ─── Unread Summary ────────────────────────────────────────────────────────

  const sendUnreadSummary = monitor.debounce(() => {
    const unreadChannels = document.querySelectorAll(SEL.unreadChannels);
    const mentions = document.querySelectorAll(SEL.mentionBadge);
    const mentionCount = Array.from(mentions).reduce((acc, el) => {
      return acc + (parseInt(el.textContent, 10) || 0);
    }, 0);

    const summary = {
      unreadChannelCount: unreadChannels.length,
      mentionCount,
    };

    if (monitor.hasChanged('unreadSummary', summary)) {
      monitor.send('SLACK_UNREAD_SUMMARY', summary);
    }
  }, 1500);

  // ─── New Message Detection ─────────────────────────────────────────────────

  const sendNewMessage = monitor.debounce(() => {
    const messages = document.querySelectorAll(SEL.message);
    const last = messages[messages.length - 1];
    if (!last) return;

    const sender = last
      .closest('[data-qa="message_container"]')
      ?.querySelector(SEL.senderName)
      ?.textContent?.trim();
    const text = last.textContent?.trim()?.slice(0, 200);
    const lang = TwinLanguage.detectLanguage(text || '');

    const msgKey = `${sender}:${text?.slice(0, 40)}`;
    if (monitor.hasChanged('lastMessage', msgKey)) {
      monitor.send('SLACK_NEW_MESSAGE', { sender, text, lang, channel: location.pathname });
    }
  }, 2000);

  // ─── Watchers ──────────────────────────────────────────────────────────────

  monitor.watch('.p-channel_sidebar', sendUnreadSummary, {
    observeId: 'sidebar',
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  monitor.watch(SEL.messageList, sendNewMessage, {
    observeId: 'messages',
    childList: true,
    subtree: false,
  });

  sendUnreadSummary();
})();
