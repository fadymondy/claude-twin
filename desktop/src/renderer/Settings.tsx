import React, { useEffect, useState } from 'react';
import type { CliState } from './types';

export function Settings({ onBack }: { onBack: () => void }): React.ReactElement {
  const [cli, setCli] = useState<CliState | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [tokenVisible, setTokenVisible] = useState(false);

  const refresh = async (): Promise<void> => {
    setCli(await window.claudeTwin.cliState());
    setToken(await window.claudeTwin.getToken());
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onInstall = async (): Promise<void> => {
    setBusy('install');
    const r = await window.claudeTwin.cliInstall();
    setBusy(null);
    if (!r.ok) alert(`Install failed: ${r.error}`);
    void refresh();
  };

  const onUninstall = async (): Promise<void> => {
    if (!confirm('Remove the claude-twin-mcp shim?')) return;
    setBusy('uninstall');
    const r = await window.claudeTwin.cliUninstall();
    setBusy(null);
    if (!r.ok) alert(`Uninstall failed: ${r.error}`);
    void refresh();
  };

  const onRotate = async (): Promise<void> => {
    if (
      !confirm('Rotate bridge token? Existing extension/Claude Code sessions will need to update.')
    )
      return;
    setBusy('rotate');
    const fresh = await window.claudeTwin.rotateToken();
    setBusy(null);
    setToken(fresh);
    setTokenVisible(true);
  };

  const onCopyToken = async (): Promise<void> => {
    if (token) await navigator.clipboard.writeText(token);
  };

  return (
    <main>
      <header>
        <h1>claude-twin — Settings</h1>
        <button className="link-btn" onClick={onBack}>
          ← back
        </button>
      </header>

      <section className="settings-section">
        <h2>Command-line tool</h2>
        <p className="muted">
          The <code>claude-twin-mcp</code> binary lets Claude Code (and other MCP clients) talk to
          this app.
        </p>
        {cli ? (
          <>
            <div className="row">
              <span className="row-label">Status</span>
              <span className={`row-value ${cli.installed ? 'ok' : 'warn'}`}>
                {cli.installed ? 'installed' : 'not installed'}
              </span>
            </div>
            <div className="row">
              <span className="row-label">Path</span>
              <span className="row-value mono">{cli.target ?? '—'}</span>
            </div>
            <div className="settings-actions">
              {cli.installed ? (
                <button onClick={onUninstall} disabled={!!busy}>
                  Uninstall
                </button>
              ) : (
                <button onClick={onInstall} disabled={!!busy}>
                  Install
                </button>
              )}
              {cli.installed && (
                <button onClick={onInstall} disabled={!!busy} className="secondary">
                  Repair
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="muted">checking…</p>
        )}
      </section>

      <section className="settings-section">
        <h2>Bridge token</h2>
        <p className="muted">
          Shared secret between this app and the Chrome extension. Auto-generated on first launch.
          Rotate to revoke any leaked copies — the extension will need the new value entered into
          its popup Status tab.
        </p>
        <div className="row">
          <span className="row-label">Current</span>
          <span className="row-value mono">
            {token == null ? '—' : tokenVisible ? token : `${token.slice(0, 8)}…${token.slice(-4)}`}
          </span>
        </div>
        <div className="settings-actions">
          <button onClick={() => setTokenVisible((v) => !v)}>
            {tokenVisible ? 'Hide' : 'Show'}
          </button>
          <button onClick={onCopyToken} disabled={!token}>
            Copy
          </button>
          <button onClick={onRotate} disabled={!!busy} className="secondary">
            Rotate…
          </button>
        </div>
      </section>
    </main>
  );
}
