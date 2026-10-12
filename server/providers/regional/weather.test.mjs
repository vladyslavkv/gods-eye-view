import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchRegionalWeather, MET_NORWAY_USER_AGENT } from './weather.js';

const HOUR = '2026-10-12T06:00:00Z';
const NOW = Date.parse('2026-10-12T06:20:00Z');
const body = (temperature = 4.2) => ({
  properties: {
    meta: { updated_at: '2026-10-12T05:23:27Z' },
    timeseries: [
      {
        time: HOUR,
        data: {
          instant: {
            details: {
              air_temperature: temperature,
              cloud_area_fraction: 10,
              wind_speed: 2,
              wind_from_direction: 90,
            },
          },
          next_1_hours: {
            summary: { symbol_code: 'fair_day' },
            details: { precipitation_amount: 0 },
          },
        },
      },
    ],
  },
});
const reply = (payload, headers = {}) =>
  new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json', ...headers },
  });

test('should request MET Norway complete with an identifying User-Agent and at most four decimals when fetching', async (t) => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const seen = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    seen.push({ url: new URL(url), headers: options.headers });
    return reply(body());
  });
  const weather = await fetchRegionalWeather({
    latitude: 59.913868123,
    longitude: 10.752245987,
  });
  assert.equal(weather.temperatureC, 4.2);
  assert.equal(weather.condition, 'fair');
  assert.equal(weather.visibilityM, null);
  const [{ url, headers }] = seen;
  assert.equal(url.origin, 'https://api.met.no');
  assert.equal(url.pathname, '/weatherapi/locationforecast/2.0/complete');
  for (const key of ['lat', 'lon']) {
    assert.match(url.searchParams.get(key), /^-?\d+(\.\d{1,4})?$/);
  }
  assert.equal(url.searchParams.get('lat'), '59.9');
  assert.equal(url.searchParams.get('lon'), '10.8');
  assert.equal(headers['User-Agent'], MET_NORWAY_USER_AGENT);
  assert.match(MET_NORWAY_USER_AGENT, /^\S+\/\S+ \(.*https?:\/\/\S+.*\)$/);
});

test('should not refetch before Expires and should revalidate with If-Modified-Since after it', async (t) => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  const lastModified = 'Mon, 12 Oct 2026 06:01:07 GMT';
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(options.headers);
    if (calls.length === 1) {
      return reply(body(7), {
        Expires: new Date(NOW + 10 * 60_000).toUTCString(),
        'Last-Modified': lastModified,
      });
    }
    return new Response(null, {
      status: 304,
      headers: { Expires: new Date(now + 10 * 60_000).toUTCString() },
    });
  });
  const point = { latitude: 48.2, longitude: 16.4 };
  assert.equal((await fetchRegionalWeather(point)).temperatureC, 7);
  now += 5 * 60_000;
  assert.equal((await fetchRegionalWeather(point)).temperatureC, 7);
  assert.equal(calls.length, 1, 'no upstream request before Expires');
  now += 6 * 60_000;
  assert.equal((await fetchRegionalWeather(point)).temperatureC, 7);
  assert.equal(calls.length, 2);
  assert.equal(calls[1]['If-Modified-Since'], lastModified);
  now += 5 * 60_000;
  await fetchRegionalWeather(point);
  assert.equal(calls.length, 2, '304 renews the Expires window');
});

test('should return null instead of inventing weather when MET Norway fails', async (t) => {
  t.mock.method(Date, 'now', () => NOW);
  for (const status of [429, 500, 503]) {
    t.mock.method(
      globalThis,
      'fetch',
      async () => new Response('{}', { status }),
    );
    assert.equal(
      await fetchRegionalWeather({ latitude: -33.9, longitude: 18.4 + status }),
      null,
    );
  }
  t.mock.method(globalThis, 'fetch', async () => {
    throw new Error('offline');
  });
  assert.equal(
    await fetchRegionalWeather({ latitude: 35.7, longitude: 139.7 }),
    null,
  );
});

test('should return null when the cached forecast no longer covers the current hour', async (t) => {
  let now = NOW;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async () =>
    reply(body(), { Expires: new Date(NOW + 3 * 3600_000).toUTCString() }),
  );
  const point = { latitude: 40.4, longitude: -3.7 };
  assert.equal(
    (await fetchRegionalWeather(point)).validAt,
    '2026-10-12T06:00:00.000Z',
  );
  now += 2 * 3600_000;
  assert.equal(await fetchRegionalWeather(point), null);
});
