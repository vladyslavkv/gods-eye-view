import { fetchRegional } from './http.js';
import { readResponseJsonCapped } from '../common/http.js';
import { normalizeRegionalWeather } from '../../../src/data/regionalModel.js';

const WEATHER_MAX_RESPONSE_BYTES = 512 * 1024;

const MET_NORWAY_FORECAST_URL =
  'https://api.met.no/weatherapi/locationforecast/2.0/complete';

/**
 * MET Norway's terms require an identifying User-Agent with a contact point;
 * anonymous or fake agents are blocked. Operators of a deployment should set
 * MET_NORWAY_USER_AGENT to their own app name and contact (see
 * docs/COMMERCIAL_CONFIG.md).
 */
const MET_NORWAY_USER_AGENT =
  process.env.MET_NORWAY_USER_AGENT ||
  'gods-eye-view/0.1 (+https://github.com/bilawalsidhu/gods-eye-view)';

const MET_NORWAY_MAX_CACHE = 180;

// Upstream responses per 0.1° cell, kept for MET Norway's Expires /
// Last-Modified rules: no request before Expires, and a conditional
// If-Modified-Since request after it. Shared by the briefing and the
// weather-effects proxies.
const _metNorwayCache = new Map();

function cellCoordinate(value) {
  return (Math.round(value * 10) / 10).toFixed(1);
}

async function readForecast(response, maxBytes, signal) {
  if (response.status === 203) {
    console.warn('[met-norway] Locationforecast 2.0 reports deprecation (203)');
  }
  return {
    status: response.status,
    expires: Date.parse(response.headers.get('expires')),
    lastModified: response.headers.get('last-modified'),
    payload:
      response.status === 304
        ? null
        : await readResponseJsonCapped(response, maxBytes, signal),
  };
}

async function fetchMetNorwayForecast(lat, lon) {
  const key = `${lat},${lon}`;
  const cached = _metNorwayCache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.payload;
  const headers = { 'User-Agent': MET_NORWAY_USER_AGENT };
  if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;
  const result = await fetchRegional(
    `${MET_NORWAY_FORECAST_URL}?${new URLSearchParams({ lat, lon })}`,
    readForecast,
    { headers, maxBytes: WEATHER_MAX_RESPONSE_BYTES },
  );
  if (result.status === 304 && !cached) throw new Error('Unexpected 304');
  const payload = result.status === 304 ? cached.payload : result.payload;
  _metNorwayCache.delete(key);
  _metNorwayCache.set(key, {
    payload,
    expiresAt: Number.isNaN(result.expires) ? 0 : result.expires,
    lastModified: result.lastModified || cached?.lastModified || null,
  });
  while (_metNorwayCache.size > MET_NORWAY_MAX_CACHE) {
    _metNorwayCache.delete(_metNorwayCache.keys().next().value);
  }
  return payload;
}

/** Current-hour MET Norway forecast for a point's 0.1° cell, or null. */
async function fetchRegionalWeather(point) {
  try {
    const payload = await fetchMetNorwayForecast(
      cellCoordinate(point.latitude),
      cellCoordinate(point.longitude),
    );
    return normalizeRegionalWeather(payload, Date.now());
  } catch (error) {
    console.warn(`[met-norway] forecast unavailable: ${error.message}`);
    return null;
  }
}

export { fetchRegionalWeather, MET_NORWAY_USER_AGENT };
