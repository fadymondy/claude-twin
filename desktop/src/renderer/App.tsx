import React from 'react';

declare global {
  interface Window {
    claudeTwin?: { version: string };
  }
}

export function App(): React.ReactElement {
  const version = window.claudeTwin?.version ?? '0.0.0';
  return (
    <main>
      <header>
        <h1>claude-twin</h1>
        <span className="version">v{version}</span>
      </header>
      <section className="placeholder">
        <p>Bridge / events / logs UI lands in #45.</p>
        <p className="muted">
          Tray-first app — close this window to hide it. Quit from the tray menu.
        </p>
      </section>
    </main>
  );
}
