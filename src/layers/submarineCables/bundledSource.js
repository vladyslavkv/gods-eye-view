// Bundled OpenStreetMap extract (ODbL 1.0, © OpenStreetMap contributors),
// built by scripts/build-osm-submarine-cables.mjs. See DATA_SOURCES.md and the
// dataset's README.md.
// Resolved when read, so importing this module never needs a module URL.
function cableUrl() {
  return new URL(
    '../../data/local_data/osm_submarine_cables/cables.geojson',
    import.meta.url,
  ).href;
}
function landingPointUrl() {
  return new URL(
    '../../data/local_data/osm_submarine_cables/landing-points.geojson',
    import.meta.url,
  ).href;
}

/** Supply GeoJSON collections without coupling the renderer to asset URLs. */
export function createBundledCableSource({
  fetchImpl = (...args) => fetch(...args),
} = {}) {
  async function read(url, signal) {
    signal?.throwIfAborted();
    const response = await fetchImpl(url, { signal, cache: 'force-cache' });
    if (!response.ok) {
      try {
        await response.body?.cancel();
      } catch {
        /* best effort */
      }
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const json = await response.json();
    signal?.throwIfAborted();
    return json;
  }
  return {
    label: 'OpenStreetMap',
    async fetch(signal) {
      const [cables, landingPoints] = await Promise.all([
        read(cableUrl(), signal),
        read(landingPointUrl(), signal),
      ]);
      return { cables, landingPoints };
    },
  };
}
