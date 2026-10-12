import test from 'node:test';
import assert from 'node:assert/strict';
import { disasterEventsProxy } from '../../server/providers/disasterEvents.js';
import { gdacsFeature } from '../layers/disasterEvents/testDoubles.mjs';

const collection = (type, features = [gdacsFeature({ eventtype: type })]) =>
  Response.json({ type: 'FeatureCollection', features });

function install(options = {}, hook = 'configureServer') {
  let handler;
  const plugin = disasterEventsProxy(options);
  assert.equal(plugin.name, 'disaster-events');
  plugin[hook]({
    middlewares: {
      use(path, callback) {
        assert.equal(path, '/api/events');
        handler = callback;
      },
    },
  });
  return async (url = '/', method = 'GET', peer = 'local') => {
    const res = {
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
      },
      end(body) {
        this.body = JSON.parse(body);
      },
    };
    await handler({ url, method, socket: { remoteAddress: peer } }, res);
    return res;
  };
}

const perType = (calls) => async (url, options) => {
  const parsed = new URL(url);
  calls.push({ url: parsed, options });
  return collection(parsed.searchParams.get('eventtype'));
};

for (const hook of ['configureServer', 'configurePreviewServer']) {
  test(`${hook}: should merge every GDACS event type when the upstream answers`, async () => {
    const calls = [];
    const request = install(
      { now: () => 5000, fetchImpl: perType(calls) },
      hook,
    );
    const res = await request('/');
    assert.equal(res.status, 200);
    assert.equal(res.headers['Cache-Control'], 'no-store');
    assert.deepEqual(
      calls.map(({ url }) => url.searchParams.get('eventtype')),
      ['EQ', 'TC', 'FL', 'VO', 'WF', 'DR'],
    );
    for (const { url, options } of calls) {
      assert.equal(url.origin, 'https://www.gdacs.org');
      assert.equal(url.pathname, '/gdacsapi/api/events/geteventlist/MAP');
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.match(options.headers['User-Agent'], /Gods Eye View/);
    }
    assert.equal(res.body.schemaVersion, 1);
    assert.equal(res.body.source, 'GDACS');
    assert.match(res.body.attribution, /CC BY 4\.0/);
    assert.equal(res.body.fetchedAt, 5000);
    assert.equal(res.body.stale, false);
    assert.equal(res.body.unavailable, false);
    assert.equal(res.body.reason, null);
    assert.deepEqual(res.body.events.map((event) => event.id).sort(), [
      'DR-1000151',
      'EQ-1000151',
      'FL-1000151',
      'TC-1000151',
      'VO-1000151',
      'WF-1000151',
    ]);
  });
}

test('should sort red alerts first when events carry different alert levels', async () => {
  const request = install({
    fetchImpl: async (url) => {
      const type = new URL(url).searchParams.get('eventtype');
      if (type !== 'EQ') return collection(type, []);
      return collection(type, [
        gdacsFeature({ eventtype: 'EQ', eventid: 1, alertlevel: 'Green' }),
        gdacsFeature({ eventtype: 'EQ', eventid: 2, alertlevel: 'Red' }),
        gdacsFeature({ eventtype: 'EQ', eventid: 3, alertlevel: 'Orange' }),
      ]);
    },
  });
  const res = await request();
  assert.deepEqual(
    res.body.events.map((event) => event.alertLevel),
    ['red', 'orange', 'green'],
  );
});

test('should answer from cache when a fresh snapshot exists', async () => {
  const calls = [];
  let clock = 0;
  const request = install({ now: () => clock, fetchImpl: perType(calls) });
  await request();
  clock = 599_999;
  await request();
  assert.equal(calls.length, 6);
  clock = 600_000;
  await request();
  assert.equal(calls.length, 12);
});

test('should serve the last good snapshot as stale when a refresh fails', async () => {
  let clock = 0;
  let failing = false;
  const request = install({
    now: () => clock,
    fetchImpl: async (url) => {
      if (failing) throw new Error('private upstream details');
      return collection(new URL(url).searchParams.get('eventtype'));
    },
  });
  await request();
  failing = true;
  clock = 700_000;
  const res = await request();
  assert.equal(res.status, 200);
  assert.equal(res.headers['X-Data-Stale'], 'true');
  assert.equal(res.body.stale, true);
  assert.equal(res.body.unavailable, false);
  assert.equal(res.body.fetchedAt, 0);
  assert.match(res.body.reason, /upstream unavailable/);
  assert.equal(res.body.events.length, 6);
  assert.doesNotMatch(JSON.stringify(res.body), /private upstream/);

  clock = 24 * 3_600_000 + 1;
  const expired = await request();
  assert.equal(expired.body.unavailable, true);
  assert.deepEqual(expired.body.events, []);
});

test('should report unavailable instead of an empty world when GDACS never answered', async () => {
  for (const fetchImpl of [
    async () => new Response('down', { status: 503 }),
    async () => Response.json({ message: 'Eventtype is required.' }),
  ]) {
    const res = await install({ fetchImpl })();
    assert.equal(res.status, 200);
    assert.equal(res.body.unavailable, true);
    assert.equal(res.body.stale, true);
    assert.equal(res.body.reason, 'Disaster events unavailable');
    assert.deepEqual(res.body.events, []);
  }
});

test('should cancel and refuse an oversized upstream body', async () => {
  let cancelled = false;
  const res = await install({
    fetchImpl: async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  })();
  assert.equal(res.body.unavailable, true);
  assert.equal(cancelled, true);
});

test('should share one upstream refresh when requests arrive together', async () => {
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let calls = 0;
  const request = install({
    fetchImpl: async (url) => {
      calls++;
      await gate;
      return collection(new URL(url).searchParams.get('eventtype'));
    },
  });
  const pending = [request(), request()];
  await new Promise(setImmediate);
  assert.equal(calls, 6);
  release();
  for (const res of await Promise.all(pending)) assert.equal(res.status, 200);
  assert.equal(calls, 6);
});

test('should refuse other methods and paths without fetching upstream', async () => {
  let calls = 0;
  const request = install({
    fetchImpl: async () => {
      calls++;
      return collection('EQ');
    },
  });
  assert.equal((await request('/', 'POST')).status, 405);
  assert.equal((await request('/anything')).status, 404);
  assert.equal(calls, 0);
  assert.equal((await request('/?eventtype=EQ')).status, 200);
});

test('should rate limit one client when it floods the route', async () => {
  const request = install({ fetchImpl: perType([]) });
  let last;
  for (let index = 0; index < 61; index++)
    last = await request('/', 'GET', 'flood');
  assert.equal(last.status, 429);
  assert.equal((await request('/', 'GET', 'other')).status, 200);
});
