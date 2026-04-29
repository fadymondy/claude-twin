import WebSocket from 'ws';

const url = 'ws://127.0.0.1:9997/twin';
const log = (...a) => console.log('[smoke]', ...a);

const ws = new WebSocket(url);
const got = new Set();
let cmdReceived = null;

ws.on('open', () => {
  log('connected');
  ws.send(JSON.stringify({ type: 'auth', token: null, extension_id: 'manual-smoke' }));
  setTimeout(() => ws.send(JSON.stringify({ type: 'ping' })), 100);
});

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
  log('recv', msg.type, msg.action ? `(${msg.action})` : '');
  got.add(msg.type);

  if (msg.type === 'command' && msg.action === 'ping') {
    cmdReceived = msg;
    ws.send(
      JSON.stringify({
        type: 'response',
        id: msg.id,
        result: { pong: true, ts: Date.now(), version: 'manual-smoke' },
      }),
    );
  }
});

ws.on('error', (err) => {
  console.error('[smoke] error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  const expected = ['auth_ok', 'pong'];
  const missing = expected.filter((t) => !got.has(t));
  if (missing.length) {
    log('FAIL — missing', missing);
    process.exit(2);
  }
  log('PASS — auth_ok + pong received', cmdReceived ? '(+ command echoed)' : '');
  ws.close(1000);
  setTimeout(() => process.exit(0), 50);
}, 800);
