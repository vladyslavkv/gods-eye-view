import { normalizeAdsbLolPointResponse } from '../../../src/data/adsbLolFallback.js';
import {
  coalesceProxyRequest,
  readResponseJsonCapped,
} from '../common/http.js';
import { requiredFiniteQueryNumber } from '../common/query.js';

/** Responses cached per query (view anchor, callsign or address). */
const _cache = new Map();
/** Per-query single-flight map for concurrent requests. */
const _inFlight = new Map();
const CACHE_MS = 12000;
const CACHE_MAX = 80;
const REGIONAL_RADIUS_NM = 250;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 10000;
const CALLSIGN = /^[A-Z0-9]{2,8}$/;
const ICAO24 = /^[0-9a-f]{6}$/;

export function adsbLolFallbackAnchor(req) {
  const incoming = new URL(req?.url || '', 'http://localhost');
  const latitude = requiredFiniteQueryNumber(incoming.searchParams, 'lat');
  const longitude = requiredFiniteQueryNumber(incoming.searchParams, 'lon');
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)
    return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)
    return null;
  return { latitude, longitude };
}

/**
 * The adsb.lol v2 query a /api/flights request names: a callsign or ICAO
 * address lookup worldwide, otherwise the region around a view anchor
 * (rounded to 0.25° so nearby views share a cache entry). Null when the
 * request names none of them validly.
 */
export function adsbLolFlightQuery(req) {
  const params = new URL(req?.url || '', 'http://localhost').searchParams;
  if (params.has('callsign')) {
    const callsign = String(params.get('callsign')).trim().toUpperCase();
    return CALLSIGN.test(callsign)
      ? {
          key: `callsign:${callsign}`,
          path: `callsign/${callsign}`,
          coverage: 'worldwide callsign lookup',
        }
      : null;
  }
  if (params.has('icao24')) {
    const icao24 = String(params.get('icao24')).trim().toLowerCase();
    return ICAO24.test(icao24)
      ? {
          key: `hex:${icao24}`,
          path: `hex/${icao24}`,
          coverage: 'worldwide address lookup',
        }
      : null;
  }
  const anchor = adsbLolFallbackAnchor(req);
  if (!anchor) return null;
  const lat = (Math.round(anchor.latitude * 4) / 4).toFixed(2);
  const lon = (Math.round(anchor.longitude * 4) / 4).toFixed(2);
  return {
    key: `${lat},${lon}`,
    path: `lat/${Number(lat)}/lon/${Number(lon)}/dist/${REGIONAL_RADIUS_NM}`,
    coverage: `${REGIONAL_RADIUS_NM}nm regional`,
  };
}

async function fetchFlights(query) {
  const cached = _cache.get(query.key);
  if (cached && Date.now() - cached.cachedAt < CACHE_MS) {
    return { ...cached, cacheStatus: 'HIT' };
  }
  const request = coalesceProxyRequest(_inFlight, query.key, async () => {
    const upstream = await fetch(`https://api.adsb.lol/v2/${query.path}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'gods-eye-view-adsblol-flights/1.0',
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) throw new Error(`upstream HTTP ${upstream.status}`);
    const payload = await readResponseJsonCapped(upstream, MAX_RESPONSE_BYTES);
    const normalized = normalizeAdsbLolPointResponse(payload);
    const record = {
      body: JSON.stringify(normalized),
      cachedAt: Date.now(),
      count: normalized.states.length,
    };
    _cache.delete(query.key);
    _cache.set(query.key, record);
    while (_cache.size > CACHE_MAX) {
      _cache.delete(_cache.keys().next().value);
    }
    return record;
  });
  try {
    const record = await request.promise;
    return { ...record, cacheStatus: request.shared ? 'INFLIGHT' : 'MISS' };
  } catch (error) {
    if (!request.shared) {
      console.warn(
        `[adsb.lol Flights] ${query.path}:`,
        error?.message || error,
      );
    }
    return cached ? { ...cached, cacheStatus: 'STALE' } : null;
  }
}

/**
 * Vite plugin: civil flights from adsb.lol (ODbL) on GET /api/flights.
 *
 * `?lat=&lon=` returns the aircraft within 250 nm of the view anchor;
 * `?callsign=` and `?icao24=` look an aircraft up worldwide. Bodies are
 * state-vector snapshots (`{time, states}`, see src/data/adsbLolFallback.js),
 * cached 12 s per query; on upstream failure the last body for the same query
 * is served as STALE, otherwise 502.
 *
 * @returns {import('vite').Plugin}
 */
export function flightsProxy() {
  const installMiddleware = (server) => {
    server.middlewares.use('/api/flights', async (req, res, next) => {
      // This mount also matches its /track route, served by its own handler.
      if (new URL(req.url || '/', 'http://localhost').pathname !== '/')
        return next();
      const query = adsbLolFlightQuery(req);
      if (!query) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Give lat and lon, a callsign or a 6-hex icao24',
          }),
        );
        return;
      }
      const result = await fetchFlights(query);
      if (!result) {
        res.writeHead(502, {
          'Content-Type': 'application/json',
          'X-Feed-Source': 'adsb.lol',
        });
        res.end(JSON.stringify({ error: 'adsb.lol flights unavailable' }));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Feed-Source': 'adsb.lol',
        'X-Feed-Cache': result.cacheStatus,
        'X-Flight-Source': 'adsb.lol',
        'X-Flight-Coverage': query.coverage,
        'X-Flight-Count': String(result.count),
      });
      res.end(result.body);
    });
  };
  return {
    name: 'adsblol-flights-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
