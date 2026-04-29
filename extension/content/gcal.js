/**
 * Orchestra Twin Bridge — Google Calendar Content Script
 */

(() => {
  if (window.__TwinGCalLoaded) return;
  window.__TwinGCalLoaded = true;

  const monitor = new TwinMonitor('gcal');

  const sendCalendarContext = monitor.debounce(() => {
    const events = document.querySelectorAll('[data-eventid]');
    const todayEvents = Array.from(events)
      .slice(0, 10)
      .map((el) => ({
        title: el.getAttribute('data-eventid') || el.textContent?.trim()?.slice(0, 50),
      }));

    if (monitor.hasChanged('gcal_eventCount', events.length)) {
      monitor.send('GCAL_EVENTS_LOADED', {
        eventCount: events.length,
        todayEventCount: todayEvents.length,
        url: location.href,
      });
    }
  }, 2000);

  // Calendar re-renders on navigation
  const observer = new MutationObserver(() => sendCalendarContext());
  observer.observe(document.body, { childList: true, subtree: false });

  sendCalendarContext();
})();
