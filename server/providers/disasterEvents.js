import {
  GDACS_ALERT_LEVELS,
  GDACS_EVENT_TYPES,
  normalizeGdacsFeatures,
} from '../../src/layers/disasterEvents/records.js';
import { readResponseJsonCapped, coalesceProxyRequest } from './common/http.js';
import { makeRateLimiter, clientKey } from './common/rate-limit.js';

// GDACS (EC JRC) homepage-map event list, one keyless request per event type.
// Each response also carries outline polygons; drought and cyclone payloads
// run to a few MB, hence the per-type cap.
const API_URL =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/MAP?eventtype=';
const MIB = 1024 * 1024;
const TYPE_BODY_CAP = 8 * MIB;
const REFRESH_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 600_000;
const STALE_LIMIT_MS = 24 * 3_600_000;
const ATTRIBUTION =
  'GDACS, European Commission Joint Research Centre (CC BY 4.0); modified (filtered, restyled)';

const alertRank = (event) => GDACS_ALERT_LEVELS.indexOf(event.alertLevel);
const byAlertThenRecency = (a, b) =>
  alertRank(b) - alertRank(a) ||
  String(b.modifiedAt ?? '').localeCompare(String(a.modifiedAt ?? '')) ||
  a.id.localeCompare(b.id);

/** Fixed-origin, bounded GDACS disaster-event route for dev and preview. */
export function disasterEventsProxy({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
} = {}) {
  let cache = null;
  const inFlight = new Map();
  const allow = makeRateLimiter({ windowMs: 60_000, max: 60, globalMax: 1200 });

  async function fetchType(type, signal) {
    const response = await fetchImpl(API_URL + type, {
      signal,
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Gods Eye View (GDACS disaster events layer)',
      },
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('upstream_unavailable');
    }
    return normalizeGdacsFeatures(
      await readResponseJsonCapped(response, TYPE_BODY_CAP, signal),
      type,
    );
  }

  async function refresh() {
    const signal = AbortSignal.timeout(REFRESH_TIMEOUT_MS);
    // All or nothing: a partial world would read as "no events" for a type.
    const groups = await Promise.all(
      GDACS_EVENT_TYPES.map((type) => fetchType(type, signal)),
    );
    cache = {
      events: groups.flat().sort(byAlertThenRecency),
      fetchedAt: now(),
    };
    return cache;
  }

  function describe(value, stale) {
    return {
      schemaVersion: 1,
      source: 'GDACS',
      attribution: ATTRIBUTION,
      fetchedAt: value?.fetchedAt ?? null,
      stale: stale || !value,
      unavailable: !value,
      reason: !value
        ? 'Disaster events unavailable'
        : stale
          ? 'Cached disaster events; upstream unavailable'
          : null,
      events: value?.events ?? [],
    };
  }

  async function handler(req, res) {
    const json = (status, value) => {
      if (res.destroyed) return;
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        ...(status === 405 ? { Allow: 'GET' } : {}),
        ...(status === 429 ? { 'Retry-After': '60' } : {}),
        ...(value.stale && !value.unavailable
          ? { 'X-Data-Stale': 'true' }
          : {}),
      });
      res.end(JSON.stringify(value));
    };
    if (req.method !== 'GET') return json(405, { error: 'method_not_allowed' });
    const path = (req.url || '/').split('?')[0];
    if (path !== '/' && path !== '')
      return json(404, { error: 'unknown_route' });
    if (!allow(clientKey(req))) return json(429, { error: 'rate_limited' });
    if (cache && now() - cache.fetchedAt < CACHE_TTL_MS)
      return json(200, describe(cache, false));
    try {
      const { promise } = coalesceProxyRequest(inFlight, 'events', refresh);
      json(200, describe(await promise, false));
    } catch (error) {
      console.warn('[GDACS] refresh failed:', error?.message || error);
      const usable = cache && now() - cache.fetchedAt <= STALE_LIMIT_MS;
      json(200, describe(usable ? cache : null, true));
    }
  }

  return {
    name: 'disaster-events',
    configureServer({ middlewares }) {
      middlewares.use('/api/events', handler);
    },
    configurePreviewServer({ middlewares }) {
      middlewares.use('/api/events', handler);
    },
  };
}
