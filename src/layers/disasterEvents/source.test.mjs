import test from 'node:test';
import assert from 'node:assert/strict';
import { createGdacsEventSource } from './source.js';
import { eventRow } from './testDoubles.mjs';

const snapshot = (overrides = {}) => ({
  schemaVersion: 1,
  source: 'GDACS',
  attribution: 'GDACS',
  fetchedAt: 1,
  stale: false,
  unavailable: false,
  reason: null,
  events: [eventRow()],
  ...overrides,
});

test('should read the same-origin proxy when asked for a snapshot', async () => {
  const urls = [];
  const source = createGdacsEventSource({
    fetchImpl: async (url, options) => {
      urls.push(url);
      assert.ok(options.signal === undefined || options.signal);
      return Response.json(snapshot());
    },
  });
  const result = await source.getSnapshot();
  assert.deepEqual(urls, ['/api/events']);
  assert.equal(result.events[0].id, 'VO-1000151');
  assert.equal(result.stale, false);
});

test('should pass unavailable and stale states through when the proxy reports them', async () => {
  const source = createGdacsEventSource({
    fetchImpl: async () =>
      Response.json(snapshot({ unavailable: true, stale: true, events: [] })),
  });
  const result = await source.getSnapshot();
  assert.equal(result.unavailable, true);
  assert.equal(result.stale, true);
});

test('should reject a malformed snapshot when any event fails validation', async () => {
  for (const bad of [
    { events: null },
    { events: [eventRow({ lat: 91 })] },
    { events: [eventRow({ type: 'XX' })] },
    { events: [eventRow({ alertLevel: 'purple' })] },
    { events: [eventRow({ reportUrl: 'https://evil.example/' })] },
    { events: [eventRow({ name: '' })] },
  ]) {
    const source = createGdacsEventSource({
      fetchImpl: async () => Response.json(snapshot(bad)),
    });
    await assert.rejects(source.getSnapshot(), /Malformed disaster events/);
  }
});

test('should throw when the proxy answers with an HTTP error', async () => {
  const source = createGdacsEventSource({
    fetchImpl: async () => new Response('', { status: 502 }),
  });
  await assert.rejects(source.getSnapshot(), /HTTP 502/);
});
