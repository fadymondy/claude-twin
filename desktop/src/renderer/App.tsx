import React, { useEffect, useMemo, useState } from 'react';
import type { BridgeStatus, TwinEvent, TwinLog } from './types';

type Tab = 'bridge' | 'events' | 'monitors' | 'logs';

export function App(): React.ReactElement {
  const [tab, setTab] = useState<Tab>('bridge');
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [events, setEvents] = useState<TwinEvent[]>([]);
  const [logs, setLogs] = useState<TwinLog[]>([]);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    void window.claudeTwin.getStatus().then(setStatus);
    void window.claudeTwin.getRecentEvents().then(setEvents);
    void window.claudeTwin.getRecentLogs().then(setLogs);

    const offStatus = window.claudeTwin.onBridgeStatus((s) => setStatus(s));
    const offEvent = window.claudeTwin.onEvent((e) =>
      setEvents((prev) => [...prev.slice(-499), e]),
    );
    const offLog = window.claudeTwin.onLog((l) => setLogs((prev) => [...prev.slice(-499), l]));
    const offNav = window.claudeTwin.onNavigate((route) => {
      if (route === '/settings') setTab('bridge');
    });
    return () => {
      offStatus();
      offEvent();
      offLog();
      offNav();
    };
  }, []);

  const filteredEvents = useMemo(() => {
    if (!filter.trim()) return events;
    const q = filter.trim().toLowerCase();
    return events.filter(
      (e) => e.source.toLowerCase().includes(q) || e.eventType.toLowerCase().includes(q),
    );
  }, [events, filter]);

  const monitorBuckets = useMemo(() => {
    const map = new Map<string, TwinEvent[]>();
    for (const e of events) {
      if (e.eventType !== 'twin_log') continue;
      const list = map.get(e.source) ?? [];
      list.push(e);
      map.set(e.source, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [events]);

  return (
    <main>
      <header>
        <h1>claude-twin</h1>
        <span className="version">v{window.claudeTwin?.version ?? '0.0.0'}</span>
      </header>

      <nav className="tabs">
        {(['bridge', 'events', 'monitors', 'logs'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'tab active' : 'tab'} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === 'bridge' && <BridgePane status={status} />}

      {tab === 'events' && (
        <EventsPane events={filteredEvents} filter={filter} onFilter={setFilter} />
      )}

      {tab === 'monitors' && <MonitorsPane buckets={monitorBuckets} />}

      {tab === 'logs' && <LogsPane logs={logs} />}
    </main>
  );
}

function BridgePane({ status }: { status: BridgeStatus | null }): React.ReactElement {
  if (!status) return <p className="muted">loading…</p>;
  return (
    <section className="pane">
      <Row label="Listening" value={status.listening ? 'yes' : 'no'} ok={status.listening} />
      <Row label="WS endpoint" value={status.url} />
      <Row
        label="Extension"
        value={
          status.connected
            ? status.authenticated
              ? 'authenticated'
              : 'connected'
            : 'not connected'
        }
        ok={status.authenticated}
      />
      <Row label="Extension id" value={status.extensionId ?? '—'} />
      <Row label="Pending commands" value={String(status.pendingCommands)} />
    </section>
  );
}

function Row({
  label,
  value,
  ok,
}: {
  label: string;
  value: string;
  ok?: boolean;
}): React.ReactElement {
  return (
    <div className="row">
      <span className="row-label">{label}</span>
      <span className={`row-value ${ok === undefined ? '' : ok ? 'ok' : 'warn'}`}>{value}</span>
    </div>
  );
}

function EventsPane({
  events,
  filter,
  onFilter,
}: {
  events: TwinEvent[];
  filter: string;
  onFilter: (s: string) => void;
}): React.ReactElement {
  return (
    <section className="pane">
      <input
        className="filter"
        placeholder="filter by source or eventType"
        value={filter}
        onChange={(e) => onFilter(e.target.value)}
      />
      {events.length === 0 ? (
        <p className="muted">no events yet</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>time</th>
              <th>source</th>
              <th>event</th>
              <th>data</th>
            </tr>
          </thead>
          <tbody>
            {[...events]
              .reverse()
              .slice(0, 200)
              .map((e, i) => (
                <tr key={i}>
                  <td>{formatTime(e.timestamp)}</td>
                  <td>{e.source}</td>
                  <td>{e.eventType}</td>
                  <td className="mono truncate">{summarize(e.data)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function MonitorsPane({ buckets }: { buckets: [string, TwinEvent[]][] }): React.ReactElement {
  if (buckets.length === 0) {
    return (
      <section className="pane">
        <p className="muted">
          no monitor results yet — register a monitor via twin_monitor_register
        </p>
      </section>
    );
  }
  return (
    <section className="pane cards">
      {buckets.map(([source, list]) => {
        const latest = list[list.length - 1];
        return (
          <article key={source} className="card">
            <header>
              <strong>{source}</strong>
              <span className="muted">{list.length} updates</span>
            </header>
            <p className="muted">last {formatTime(latest.timestamp)}</p>
            <pre className="mono truncate">{summarize(latest.data)}</pre>
          </article>
        );
      })}
    </section>
  );
}

function LogsPane({ logs }: { logs: TwinLog[] }): React.ReactElement {
  return (
    <section className="pane">
      {logs.length === 0 ? (
        <p className="muted">no logs yet</p>
      ) : (
        <ol className="logs">
          {[...logs]
            .reverse()
            .slice(0, 200)
            .map((l, i) => (
              <li key={i} className={`log log-${l.level}`}>
                <span className="muted">{formatTime(l.ts)}</span>
                <span className="log-source">{l.source}</span>
                <span>{l.message}</span>
              </li>
            ))}
        </ol>
      )}
    </section>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
function summarize(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}
