import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDigitrafficFeed,
  DIGITRAFFIC_LOCATIONS_URL,
  DIGITRAFFIC_VESSELS_URL,
} from '../../server/providers/vessels/digitraffic.js';
import {
  aisStreamRows,
  ingestVesselPositions,
} from '../../server/providers/vessels/ais-store.js';
import { aisLiveProxy } from '../../server/providers/vessels/ais-live.js';

const NOW = Date.parse('2026-10-12T06:00:00Z');

const feature = (mmsi, props = {}, coordinates = [24.95, 60.16]) => ({
  mmsi,
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
  properties: {
    mmsi,
    sog: 11.2,
    cog: 271.5,
    heading: 270,
    timestampExternal: NOW - 60_000,
    ...props,
  },
});

/** Digitraffic stand-in recording every request it answers. */
function upstream({ features = [], vessels = [], fail = null } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) return fail(String(url));
    if (String(url).startsWith(DIGITRAFFIC_VESSELS_URL))
      return Response.json(vessels);
    return Response.json({
      type: 'FeatureCollection',
      dataUpdatedTime: new Date(NOW - 5_000).toISOString(),
      features,
    });
  };
  return { calls, fetchImpl };
}

function feedWith(server, { now = () => NOW, ingested = [] } = {}) {
  return createDigitrafficFeed({
    fetchImpl: server.fetchImpl,
    now,
    ingest: (rows) => ingested.push(...rows),
    warn: () => {},
  });
}

test('should map Digitraffic positions and metadata to attributed vessel rows when upstream answers', async () => {
  const server = upstream({
    features: [feature(230000001)],
    vessels: [
      {
        mmsi: 230000001,
        name: ' VIKING GRACE ',
        shipType: 60,
        destination: 'FIHEL',
        imo: 9606900,
      },
    ],
  });
  const ingested = [];
  await feedWith(server, { ingested }).poll();
  assert.deepEqual(ingested, [
    {
      mmsi: '230000001',
      lat: 60.16,
      lon: 24.95,
      name: 'VIKING GRACE',
      imo: '9606900',
      type: '60',
      destination: 'FIHEL',
      speed: 11.2,
      course: 271.5,
      heading: 270,
      observedAtMs: NOW - 60_000,
      source: 'Digitraffic',
    },
  ]);
});

test('should identify itself, ask for gzip and only the recent window when polling', async () => {
  const server = upstream({ features: [] });
  await feedWith(server).poll();
  const locations = server.calls.find((call) =>
    call.url.startsWith(DIGITRAFFIC_LOCATIONS_URL),
  );
  assert.ok(locations, 'locations endpoint polled');
  assert.equal(
    new URL(locations.url).searchParams.get('from'),
    String(NOW - 30 * 60 * 1000),
  );
  assert.equal(locations.options.headers['Digitraffic-User'], 'gods-eye-view');
  assert.equal(locations.options.headers['Accept-Encoding'], 'gzip');
  assert.equal(locations.options.redirect, 'manual');
  assert.ok(
    server.calls.some((call) => call.url.startsWith(DIGITRAFFIC_VESSELS_URL)),
  );
});

test('should drop rows without an MMSI or valid coordinates when mapping', async () => {
  const server = upstream({
    features: [
      feature(230000002, {}, [200, 60]),
      { type: 'Feature', geometry: null, properties: { mmsi: 230000003 } },
      { type: 'Feature', geometry: { coordinates: [24, 60] }, properties: {} },
      feature(230000004),
    ],
  });
  const ingested = [];
  await feedWith(server, { ingested }).poll();
  assert.deepEqual(
    ingested.map((row) => row.mmsi),
    ['230000004'],
  );
});

test('should not refetch inside the poll interval when called repeatedly', async () => {
  let now = NOW;
  const server = upstream({ features: [feature(230000005)] });
  const feed = feedWith(server, { now: () => now });
  await Promise.all([feed.poll(), feed.poll()]);
  await feed.poll();
  const locationCalls = () =>
    server.calls.filter((call) => call.url.startsWith(DIGITRAFFIC_LOCATIONS_URL))
      .length;
  assert.equal(locationCalls(), 1);
  now += 60_000;
  await feed.poll();
  assert.equal(locationCalls(), 2);
});

test('should report live coverage with the snapshot time when the poll succeeds', async () => {
  const feed = feedWith(upstream({ features: [] }));
  assert.equal(feed.snapshot().status, 'connecting');
  await feed.poll();
  const snapshot = feed.snapshot();
  assert.equal(snapshot.status, 'live');
  assert.equal(snapshot.error, null);
  assert.equal(snapshot.lastMessageAt, NOW);
  assert.equal(snapshot.snapshotAt, NOW - 5_000);
  assert.equal(snapshot.rowCount, 0);
});

test('should report an error and no rows when the first poll fails', async () => {
  const ingested = [];
  const feed = feedWith(
    upstream({
      fail: () => new Response('busy', { status: 503 }),
    }),
    { ingested },
  );
  await feed.poll();
  const snapshot = feed.snapshot();
  assert.equal(snapshot.status, 'error');
  assert.match(snapshot.error, /503/);
  assert.equal(snapshot.lastMessageAt, null);
  assert.equal(snapshot.snapshotAt, null);
  assert.equal(snapshot.nextAttemptAt, NOW + 60_000);
  assert.deepEqual(ingested, []);
});

test('should reject a malformed upstream body instead of reporting empty coverage', async () => {
  const feed = feedWith(
    upstream({
      fail: (url) =>
        url.startsWith(DIGITRAFFIC_VESSELS_URL)
          ? Response.json([])
          : Response.json({ type: 'FeatureCollection' }),
    }),
  );
  await feed.poll();
  assert.equal(feed.snapshot().status, 'error');
  assert.equal(feed.snapshot().snapshotAt, null);
});

test('should refuse a redirected response when polling', async () => {
  const feed = feedWith(
    upstream({
      fail: () =>
        new Response(null, {
          status: 302,
          headers: { Location: 'https://example.test/' },
        }),
    }),
  );
  await feed.poll();
  assert.equal(feed.snapshot().status, 'error');
  assert.match(feed.snapshot().error, /redirect/i);
});

test('should keep positions without metadata when the metadata request fails', async () => {
  const ingested = [];
  const feed = feedWith(
    upstream({
      fail: (url) =>
        url.startsWith(DIGITRAFFIC_VESSELS_URL)
          ? new Response('down', { status: 500 })
          : Response.json({
              type: 'FeatureCollection',
              dataUpdatedTime: new Date(NOW).toISOString(),
              features: [feature(230000006)],
            }),
    }),
    { ingested },
  );
  await feed.poll();
  assert.equal(feed.snapshot().status, 'live');
  assert.equal(ingested[0].mmsi, '230000006');
  assert.equal(ingested[0].name, '');
});

test('should go stale with silence and a retry time when later polls keep failing', async () => {
  let now = NOW;
  let healthy = true;
  const feed = feedWith(
    upstream({
      fail: (url) => {
        if (!healthy) return new Response('down', { status: 500 });
        return url.startsWith(DIGITRAFFIC_VESSELS_URL)
          ? Response.json([])
          : Response.json({
              type: 'FeatureCollection',
              dataUpdatedTime: new Date(now).toISOString(),
              features: [],
            });
      },
    }),
    { now: () => now },
  );
  await feed.poll();
  healthy = false;
  now += 60_000;
  await feed.poll();
  assert.equal(feed.snapshot().status, 'live', 'one miss is not an outage');
  now += 3 * 60_000;
  await feed.poll();
  const snapshot = feed.snapshot();
  assert.equal(snapshot.status, 'stale');
  assert.equal(snapshot.silentForMs, 4 * 60_000);
  assert.equal(snapshot.nextAttemptAt, now + 60_000);
  assert.match(snapshot.error, /500/);
});

test('should store attributed positions with sentinels removed when batch-ingested', () => {
  const at = Date.now() - 30_000;
  ingestVesselPositions([
    {
      mmsi: '230000007',
      lat: 60.1,
      lon: 25.1,
      name: 'ESTRADEN',
      imo: '',
      type: '70',
      destination: '',
      speed: 102.3,
      course: 360,
      heading: 511,
      observedAtMs: at,
      source: 'Digitraffic',
    },
  ]);
  const row = aisStreamRows(50000).find((r) => r.mmsi === '230000007');
  assert.equal(row.source, 'Digitraffic');
  assert.equal(row.speed, null);
  assert.equal(row.course, null);
  assert.equal(row.heading, null);
  assert.equal(row.last_position_epoch, Math.floor(at / 1000));
  assert.equal(row.last_position_UTC, new Date(at).toISOString());
});

test('should not let an older position overwrite a newer one when batch-ingested', () => {
  const at = Date.now() - 10_000;
  const base = { mmsi: '230000008', name: '', imo: '', type: '', destination: '', speed: 1, course: 1, heading: 1, source: 'Digitraffic' };
  ingestVesselPositions([{ ...base, lat: 60.2, lon: 25.2, observedAtMs: at }]);
  ingestVesselPositions([
    { ...base, lat: 60.0, lon: 25.0, observedAtMs: at - 60_000 },
  ]);
  const row = aisStreamRows(50000).find((r) => r.mmsi === '230000008');
  assert.equal(row.lat, 60.2);
});

test('should skip positions older than the retention window when batch-ingested', () => {
  ingestVesselPositions([
    {
      mmsi: '230000009',
      lat: 60,
      lon: 25,
      observedAtMs: Date.now() - 31 * 60 * 1000,
      source: 'Digitraffic',
    },
  ]);
  assert.equal(
    aisStreamRows(50000).some((r) => r.mmsi === '230000009'),
    false,
  );
});

function install(plugin) {
  const routes = new Map();
  plugin.configurePreviewServer({
    middlewares: { use: (route, handler) => routes.set(route, handler) },
  });
  return async (url = '/') => {
    const response = {
      statusCode: 200,
      headers: {},
      setHeader(key, value) {
        this.headers[key.toLowerCase()] = value;
      },
      end(body) {
        this.body = body;
      },
    };
    await routes.get('/api/vessels')({ url, method: 'GET' }, response);
    return response;
  };
}

function environment(t, values) {
  for (const [key, value] of Object.entries(values)) {
    const original = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    t.after(() => {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    });
  }
}

test('should serve Digitraffic vessels as an authoritative snapshot when no AISStream opt-in is set', async (t) => {
  environment(t, {
    AISSTREAM_API_KEY: 'present-but-not-opted-in',
    AISSTREAM_COMMERCIAL_OK: undefined,
  });
  const server = upstream({
    features: [
      feature(230000010, { timestampExternal: Date.now() - 20_000 }),
    ],
  });
  const plugin = aisLiveProxy({
    digitraffic: createDigitrafficFeed({
      fetchImpl: server.fetchImpl,
      warn: () => {},
    }),
  });
  t.after(() => plugin.closeBundle());
  const res = await install(plugin)();
  const body = JSON.parse(res.body);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['x-feed-source'], 'Digitraffic');
  assert.match(res.headers['x-feed-coverage'], /Baltic/);
  assert.equal(body.status, 'live');
  assert.equal(body.complete, true);
  assert.ok(Number.isFinite(body.snapshotAt));
  assert.equal(body.feeds.aisstream.status, 'disabled');
  const row = body.rows.find((r) => r.mmsi === '230000010');
  assert.equal(row.source, 'Digitraffic');
  assert.ok(
    server.calls.every((call) => new URL(call.url).hostname === 'meri.digitraffic.fi'),
  );
});

test('should not declare complete coverage when the Digitraffic poll failed', async (t) => {
  environment(t, {
    AISSTREAM_API_KEY: undefined,
    AISSTREAM_COMMERCIAL_OK: undefined,
  });
  const plugin = aisLiveProxy({
    digitraffic: createDigitrafficFeed({
      fetchImpl: async () => new Response('down', { status: 500 }),
      warn: () => {},
    }),
  });
  t.after(() => plugin.closeBundle());
  const body = JSON.parse((await install(plugin)()).body);
  assert.equal(body.status, 'error');
  assert.equal(body.complete, undefined);
  assert.equal(body.snapshotAt, undefined);
});
