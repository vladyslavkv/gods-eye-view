/**
 * Default-off sources whose terms do not verifiably cover commercial use
 * (docs/COMMERCIAL_CONFIG.md, "Opt-in sources") that the BROWSER reaches or
 * must know about, keyed by the name it asks for. Each is enabled only when
 * its environment variable is exactly "1".
 */
export const BROWSER_OPT_IN_SOURCES = Object.freeze({
  photon: 'PHOTON_ENABLED',
  'reearth-terrain': 'REEARTH_TERRAIN_ENABLED',
  'gbfs-unlicensed': 'GBFS_UNLICENSED_FEEDS_ENABLED',
});

/** Whether the operator opted in: the variable is exactly "1". */
export const optedIn = (envName, env = process.env) =>
  String(env[envName] ?? '').trim() === '1';

/**
 * GET /api/opt-in-sources → `{ sources: { photon: false, … } }`. Booleans
 * only; never a value. The browser treats any failure as "none opted in".
 */
export function optInSourcesEndpoint() {
  const install = (server) => {
    server.middlewares.use('/api/opt-in-sources', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      });
      res.end(
        JSON.stringify({
          sources: Object.fromEntries(
            Object.entries(BROWSER_OPT_IN_SOURCES).map(([name, envName]) => [
              name,
              optedIn(envName),
            ]),
          ),
        }),
      );
    });
  };
  return {
    name: 'opt-in-sources',
    configureServer: install,
    configurePreviewServer: install,
  };
}
