import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRegionalArticles,
  normalizeRegionalPlace,
  normalizeRegionalWeather,
  regionalDistanceM,
  weatherCodeLabel,
  MET_SYMBOLS,
  metSymbol,
} from './regionalBrief.js';

test('normalizes a regional place with stable locality fallback', () => {
  assert.deepEqual(normalizeRegionalPlace({ address: {
    town: 'Davis', state: 'California', country: 'United States', country_code: 'us',
  } }), {
    label: 'Davis, California', locality: 'Davis', region: 'California',
    country: 'United States', countryCode: 'US',
  });
  assert.equal(normalizeRegionalPlace({ address: {} }), null);
});

test('normalizes, deduplicates, and rejects unsafe regional-news rows', () => {
  const articles = normalizeRegionalArticles({ articles: [
    { title: 'Regional update', url: 'https://news.example/one', domain: 'news.example', seendate: '20260722T081500Z' },
    { title: 'Regional   update', url: 'https://news.example/two' },
    { title: 'Unsafe', url: 'javascript:alert(1)' },
    { title: 'Second story', url: 'https://other.example/story', seendate: '2026-07-22T07:00:00Z' },
  ] });
  assert.equal(articles.length, 2);
  assert.equal(articles[0].publishedAt, '2026-07-22T08:15:00Z');
  assert.equal(articles[1].domain, 'other.example');
});

const MET_NOW = Date.parse('2026-10-12T06:20:00Z');
const metPayload = (overrides = {}) => ({
  properties: {
    meta: { updated_at: '2026-10-12T05:23:27Z' },
    timeseries: [
      {
        time: '2026-10-12T05:00:00Z',
        data: { instant: { details: { air_temperature: -3 } } },
      },
      {
        time: '2026-10-12T06:00:00Z',
        data: {
          instant: {
            details: {
              air_temperature: -0.6,
              apparent_air_temperature: -2.1,
              cloud_area_fraction: 52.3,
              wind_from_direction: 133.2,
              wind_speed: 5,
              ...overrides,
            },
          },
          next_1_hours: {
            summary: { symbol_code: 'partlycloudy_night' },
            details: { precipitation_amount: 0.4 },
          },
        },
      },
      {
        time: '2026-10-12T07:00:00Z',
        data: { instant: { details: { air_temperature: 1 } } },
      },
    ],
  },
});

test('should normalize the current-hour MET Norway forecast when the timeseries covers now', () => {
  const weather = normalizeRegionalWeather(metPayload(), MET_NOW);
  assert.deepEqual(weather, {
    validAt: '2026-10-12T06:00:00.000Z',
    forecastUpdatedAt: '2026-10-12T05:23:27.000Z',
    symbolCode: 'partlycloudy_night',
    condition: 'partly cloudy',
    weatherCode: 2,
    temperatureC: -0.6,
    apparentTemperatureC: -2.1,
    precipitationMm: 0.4,
    cloudCoverPct: 52.3,
    windKph: 18,
    windDirectionDeg: 133.2,
    visibilityM: null,
  });
  assert.equal(weatherCodeLabel(weather.weatherCode), 'PARTLY CLOUDY');
});

test('should return null when no MET Norway entry covers the current hour', () => {
  assert.equal(normalizeRegionalWeather(metPayload(), Date.parse('2026-10-12T09:00:00Z')), null);
  assert.equal(normalizeRegionalWeather(metPayload(), Date.parse('2026-10-12T04:59:00Z')), null);
  assert.equal(normalizeRegionalWeather({}, MET_NOW), null);
  assert.equal(normalizeRegionalWeather(metPayload({ air_temperature: null }), MET_NOW), null);
});

test('should leave absent MET Norway fields null when the source omits them', () => {
  const payload = metPayload({ apparent_air_temperature: undefined, wind_speed: undefined });
  delete payload.properties.timeseries[1].data.next_1_hours;
  const weather = normalizeRegionalWeather(payload, MET_NOW);
  assert.equal(weather.apparentTemperatureC, null);
  assert.equal(weather.windKph, null);
  assert.equal(weather.precipitationMm, null);
  assert.equal(weather.symbolCode, null);
  assert.equal(weather.weatherCode, null);
  assert.equal(weather.condition, null);
  assert.equal(weather.visibilityM, null);
});

test('should map every MET Norway symbol to a WMO effect family when the variant suffix varies', () => {
  const expected = {
    clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
    lightrain: 61, rain: 63, heavyrain: 65,
    lightsleet: 61, sleet: 63, heavysleet: 65,
    lightsnow: 71, snow: 73, heavysnow: 75,
    lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
    lightsleetshowers: 80, sleetshowers: 81, heavysleetshowers: 82,
    lightsnowshowers: 85, snowshowers: 86, heavysnowshowers: 86,
    lightrainandthunder: 95, rainandthunder: 95, heavyrainandthunder: 95,
    lightsleetandthunder: 95, sleetandthunder: 95, heavysleetandthunder: 95,
    lightsnowandthunder: 95, snowandthunder: 95, heavysnowandthunder: 95,
    lightrainshowersandthunder: 95, rainshowersandthunder: 95, heavyrainshowersandthunder: 95,
    lightssleetshowersandthunder: 95, sleetshowersandthunder: 95, heavysleetshowersandthunder: 95,
    lightssnowshowersandthunder: 95, snowshowersandthunder: 95, heavysnowshowersandthunder: 95,
  };
  assert.deepEqual(Object.keys(MET_SYMBOLS).sort(), Object.keys(expected).sort());
  for (const [base, code] of Object.entries(expected)) {
    for (const symbol of [base, `${base}_day`, `${base}_night`, `${base}_polartwilight`]) {
      assert.equal(metSymbol(symbol)?.weatherCode, code, symbol);
      assert.equal(typeof metSymbol(symbol).condition, 'string');
    }
  }
  assert.equal(metSymbol('lightssleetshowersandthunder').condition, 'light sleet showers and thunder');
  assert.equal(metSymbol('not_a_symbol'), null);
  assert.equal(metSymbol(undefined), null);
});

test('regional distance handles nearby movement and missing positions', () => {
  const distance = regionalDistanceM(
    { latitude: 38.5, longitude: -121.7 },
    { latitude: 38.6, longitude: -121.7 },
  );
  assert.ok(distance > 11000 && distance < 11200);
  assert.equal(regionalDistanceM(null, null), Infinity);
});
