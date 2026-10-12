import path from 'node:path';
import { promises as fsp } from 'node:fs';
/**
 * adsbdb.com enrichment proxy: hex → aircraft type/registration. Free
 * community API — cached aggressively: ONE upstream request per new key ever
 * (404s negative-cached), persisted to disk so restarts don't re-hammer it.
 * Adapted from skylight (MIT) server/src/enrich/routes.ts.
 *
 * Opt-in: adsbdb publishes no licence for its PlaneBase-derived aircraft data,
 * so lookups run only when ADSBDB_ENABLED=1 (docs/COMMERCIAL_CONFIG.md);
 * otherwise every lookup answers `disabled` without an upstream call and
 * flights keep the type/registration adsb.lol itself reports. Callsign route
 * lookups were removed: adsbdb's route data "may not be copied, published, or
 * incorporated into other databases without the explicit permission" of its
 * author.
 */
export function adsbdbProxy() {
  const TTL_MS = 24 * 3600_000;
  const CACHE_PATH = path.join(process.cwd(), '.gev-cache', 'adsbdb.json');
  const enabled = () => String(process.env.ADSBDB_ENABLED || '').trim() === '1';
  let cache = { aircraft: {} };
  let dirty = false;
  let loaded = false;
  const inflight = new Map();

  async function loadOnce() {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(await fsp.readFile(CACHE_PATH, 'utf8'));
      cache = { aircraft: parsed.aircraft ?? {} };
      // Rewrite a cache that still holds route data from before its removal.
      dirty = 'routes' in parsed;
    } catch {
      /* first run */
    }
    setInterval(async () => {
      if (!dirty) return;
      dirty = false;
      try {
        await fsp.mkdir(path.dirname(CACHE_PATH), { recursive: true });
        await fsp.writeFile(CACHE_PATH, JSON.stringify(cache), 'utf8');
      } catch {
        dirty = true;
      } // retry next tick
    }, 15_000).unref?.();
  }

  const fresh = (e) => e && Date.now() - e.at < TTL_MS;

  function parseAircraft(json) {
    const a = json?.response?.aircraft;
    if (!a) return null;
    return {
      typeCode: a.icao_type || null, // ICAO designator, e.g. "B738" — feeds classifyAircraft
      typeName:
        a.manufacturer && a.type
          ? `${a.manufacturer} ${a.type}`
          : a.type || null,
      registration: a.registration || null,
    };
  }

  function lookup(key) {
    const store = cache.aircraft;
    if (fresh(store[key])) return Promise.resolve(store[key].data);
    if (!inflight.has(key)) {
      inflight.set(
        key,
        (async () => {
          try {
            const url = `https://api.adsbdb.com/v0/aircraft/${encodeURIComponent(key)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
              const data = parseAircraft(await res.json());
              store[key] = { at: Date.now(), data }; // data may be null — negative cache
              dirty = true;
              return data;
            }
            if (res.status === 404) {
              store[key] = { at: Date.now(), data: null }; // known-missing — cache the miss
              dirty = true;
            }
            // other statuses: leave uncached so we retry later
            return fresh(store[key]) ? store[key].data : null;
          } catch {
            return fresh(store[key]) ? store[key].data : null; // network error → stale if any
          } finally {
            inflight.delete(key);
          }
        })(),
      );
    }
    return inflight.get(key);
  }

  const installMiddleware = (server) => {
    server.middlewares.use('/api/adsbdb', async (req, res) => {
      await loadOnce();
      const send = (status, obj) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      try {
        const [, kind, rawKey] = String(req.url || '')
          .split('?')[0]
          .split('/');
        if (kind === 'type') {
          const hex = String(rawKey || '').toLowerCase();
          if (!/^[0-9a-f]{6}$/.test(hex))
            return send(400, { error: 'invalid hex' });
          if (!enabled())
            return send(200, {
              found: false,
              disabled: true,
              reason: 'not licensed for commercial use in this build',
            });
          const data = await lookup(hex);
          return send(200, data ? { found: true, ...data } : { found: false });
        }
        return send(404, { error: 'unknown endpoint' });
      } catch (err) {
        console.error('[adsbdb-proxy] request failed');
        return send(500, { error: 'adsbdb proxy error' });
      }
    });
  };
  return {
    name: 'adsbdb-proxy',
    configureServer: installMiddleware,
    configurePreviewServer: installMiddleware,
  };
}
