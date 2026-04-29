/**
 * Orchestra Twin Bridge — Gmail Content Script
 */

(() => {
  if (window.__TwinGmailLoaded) return;
  window.__TwinGmailLoaded = true;

  const monitor = new TwinMonitor('gmail');

  // Load selectors from config (embedded for performance)
  const SEL = {
    unreadBadge: '.bsU',
    conversationList: '.zA',
    openConversation: '.h7',
    sender: '.yW span[email]',
    subject: '.hP',
    preview: '.y2',
  };

  // ─── Unread Count ──────────────────────────────────────────────────────────

  const sendUnreadCount = monitor.debounce(() => {
    const badge = document.querySelector(SEL.unreadBadge);
    const count = badge ? parseInt(badge.textContent.trim(), 10) || 0 : 0;

    if (monitor.hasChanged('unreadCount', count)) {
      monitor.send('GMAIL_UNREAD_COUNT', { count, url: location.href });
    }
  }, 1500);

  // ─── New Email Detection ───────────────────────────────────────────────────

  const sendNewEmails = monitor.debounce(() => {
    const rows = document.querySelectorAll(`${SEL.conversationList}.zE`); // .zE = unread
    const emails = Array.from(rows)
      .slice(0, 5)
      .map((row) => {
        const senderEl = row.querySelector(SEL.sender);
        const subjectEl = row.querySelector(SEL.subject);
        const previewEl = row.querySelector(SEL.preview);
        const lang = TwinLanguage.detectLanguage(subjectEl?.textContent || '');
        return {
          sender: senderEl?.getAttribute('email') || senderEl?.textContent?.trim(),
          subject: subjectEl?.textContent?.trim(),
          preview: previewEl?.textContent?.trim()?.slice(0, 100),
          lang,
        };
      });

    if (emails.length > 0 && monitor.hasChanged('unreadEmails', emails)) {
      monitor.send('GMAIL_NEW_EMAILS', { emails, count: rows.length });
    }
  }, 2000);

  // ─── Watchers ──────────────────────────────────────────────────────────────

  monitor.watch(
    SEL.conversationList,
    () => {
      sendUnreadCount();
      sendNewEmails();
    },
    { observeId: 'inbox', childList: true, subtree: false },
  );

  // Also watch badge directly
  monitor.watch(
    SEL.unreadBadge,
    () => {
      sendUnreadCount();
    },
    { observeId: 'badge', childList: true, characterData: true, subtree: true },
  );

  // ─── Initial Scan ──────────────────────────────────────────────────────────

  sendUnreadCount();
  sendNewEmails();
})();
