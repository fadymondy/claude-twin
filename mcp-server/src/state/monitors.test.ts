/**
 * MonitorRegistry tests. Uses a stub `WsBridge` that records sendCommand
 * calls and lets us emit synthetic events.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MonitorRegistry, DEFAULT_REALTIME_SLUGS } from './monitors.js';
import type { WsBridge } from '../bridge/ws-host.js';

class StubBridge extends EventEmitter {
  ready = false;
  sentCommands: { action: string; params: Record<string, unknown> }[] = [];

  isReady(): boolean {
    return this.ready;
  }

  sendCommand(action: string, params: Record<string, unknown>): Promise<unknown> {
    this.sentCommands.push({ action, params });
    return Promise.resolve(null);
  }

  onEvent(
    handler: (msg: { source: string; eventType: string; data: unknown; timestamp: number }) => void,
  ) {
    this.on('event', handler);
    return () => this.off('event', handler);
  }
}

function makeBridge(): { bridge: WsBridge; stub: StubBridge } {
  const stub = new StubBridge();
  return { bridge: stub as unknown as WsBridge, stub };
}

test('register validates url and intervalMin', async () => {
  const { bridge, stub } = makeBridge();
  const r = new MonitorRegistry(bridge);
  await assert.rejects(r.register({ slug: '', url: 'http://x', intervalMin: 1 }), /slug required/);
  await assert.rejects(
    r.register({ slug: 'x', url: 'ftp://x', intervalMin: 1 }),
    /url must be http/,
  );
  await assert.rejects(r.register({ slug: 'x', url: 'http://x', intervalMin: 0 }), /intervalMin/);
  assert.equal(stub.sentCommands.length, 0);
});

test('register defaults realtime per slug', async () => {
  const { bridge } = makeBridge();
  const r = new MonitorRegistry(bridge);
  await r.register({ slug: 'whatsapp', url: 'http://w', intervalMin: 1 });
  await r.register({ slug: 'gmail', url: 'http://g', intervalMin: 5 });
  const list = r.list();
  assert.equal(list.find((m) => m.slug === 'whatsapp')?.realtime, true);
  assert.equal(list.find((m) => m.slug === 'gmail')?.realtime, false);
  assert.ok(DEFAULT_REALTIME_SLUGS.has('whatsapp'));
});

test('pushes set_monitors when bridge becomes ready', async () => {
  const { bridge, stub } = makeBridge();
  const r = new MonitorRegistry(bridge);
  await r.register({ slug: 'gmail', url: 'http://g', intervalMin: 5 });
  // Bridge wasn't ready, so pushAll() silently skipped.
  assert.equal(stub.sentCommands.length, 0);
  // Flip to ready and emit 'ready' — pushAll should fire.
  stub.ready = true;
  stub.emit('ready', { extensionId: 'x' });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(stub.sentCommands.length, 1);
  assert.equal(stub.sentCommands[0].action, 'set_monitors');
});

test('records twin_log events into the per-slug ring buffer', () => {
  const { bridge, stub } = makeBridge();
  const r = new MonitorRegistry(bridge);
  for (let i = 0; i < 5; i += 1) {
    stub.emit('event', {
      source: 'gmail',
      eventType: 'twin_log',
      data: { i },
      timestamp: 1000 + i,
    });
  }
  const out = r.results_for('gmail', 10);
  assert.equal(out.length, 5);
  assert.deepEqual(out[0].data, { i: 0 });
  assert.deepEqual(out[4].data, { i: 4 });
});

test('ring buffer caps at maxResultsPerSlug', () => {
  const { bridge, stub } = makeBridge();
  const r = new MonitorRegistry(bridge);
  for (let i = 0; i < 150; i += 1) {
    stub.emit('event', {
      source: 'slack',
      eventType: 'twin_log',
      data: { i },
      timestamp: i,
    });
  }
  const out = r.results_for('slack', 200);
  assert.equal(out.length, 100); // capped
  assert.deepEqual(out[0].data, { i: 50 }); // oldest 50 dropped
});

test('results_for() with no slug merges + sorts by ts desc', () => {
  const { bridge, stub } = makeBridge();
  const r = new MonitorRegistry(bridge);
  stub.emit('event', { source: 'a', eventType: 'twin_log', data: 1, timestamp: 100 });
  stub.emit('event', { source: 'b', eventType: 'twin_log', data: 2, timestamp: 200 });
  stub.emit('event', { source: 'a', eventType: 'twin_log', data: 3, timestamp: 50 });
  const out = r.results_for(undefined, 5);
  assert.deepEqual(
    out.map((x) => x.ts),
    [200, 100, 50],
  );
});

test('unregister returns false when slug is unknown', async () => {
  const { bridge } = makeBridge();
  const r = new MonitorRegistry(bridge);
  assert.equal(await r.unregister('nope'), false);
});
