/**
 * Orchestra Twin Bridge — Cal.com Content Script
 */

(() => {
  if (window.__TwinCalComLoaded) return;
  window.__TwinCalComLoaded = true;

  const monitor = new TwinMonitor('calcom');

  const sendBookingSummary = monitor.debounce(() => {
    const bookings = document.querySelectorAll("[data-testid='booking-item']");
    const upcoming = document.querySelectorAll(
      "[data-testid='upcoming'] [data-testid='booking-item']",
    );

    if (monitor.hasChanged('calcom_bookings', bookings.length)) {
      monitor.send('CALCOM_BOOKINGS_LOADED', {
        totalBookings: bookings.length,
        upcomingCount: upcoming.length,
        url: location.href,
      });
    }
  }, 2000);

  monitor.watch('main', sendBookingSummary, {
    observeId: 'main',
    childList: true,
    subtree: false,
  });

  sendBookingSummary();
})();
