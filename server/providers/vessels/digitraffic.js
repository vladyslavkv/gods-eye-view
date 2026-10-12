import { AISSTREAM_STALE_MS, ingestVesselPositions } from './ais-store.js';

/**
 * Fintraffic Digitraffic Marine AIS: keyless REST, Finland and the Baltic Sea.
 * Licence CC BY 4.0 ("distribute, remix, tweak, and build upon our data, even
 * commercially" — https://www.digitraffic.fi/en/terms-of-service/); credited in
 * src/data/dataCredits.js and DATA_SOURCES.md.
 */
export const DIGITRAFFIC_LOCATIONS_URL =
  'https://meri.digitraffic.fi/api/ais/v1/locations';
export const DIGITRAFFIC_VESSELS_URL =
  'https://meri.digitraffic.fi/api/ais/v1/vessels';
export const DIGITRAFFIC_SOURCE = 'Digitraffic';
export const DIGITRAFFIC_COVERAGE =
  'Finland and the Baltic Sea (Fintraffic AIS)';

/** One positions request per minute at most; the layer itself polls per minute. */
const POLL_MS = 60_000;
/** Names, types and destinations change slowly; refresh them every 15 min. */
const METADATA_MS = 15 * 60_000;
/** Without a successful poll for this long the cached positions read as stale. */
const STALE_AFTER_MS = 3 * POLL_MS;
const FETCH_TIMEOUT_MS = 8_000;
/**
 * Digitraffic asks every client to identify itself. Same value as the CCTV
 * pack's constant, kept local so the live-providers package stays free of it.
 */
const DIGITRAFFIC_USER = 'gods-eye-view';

/**
 * Request-driven Digitraffic poller. Nothing is fetched until a client asks
 * for vessels, and concurrent callers share one in-flight poll.
 *
 * @param {{fetchImpl?: Function, now?: () => number,
 *   ingest?: (rows: Array<object>) => void, warn?: (message: string) => void}} [deps]
 */
export function createDigitrafficFeed({
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
  ingest = ingestVesselPositions,
  warn = (message) => console.warn(message),
} = {}) {
  let inFlight = null;
  let lastAttemptAt = null;
  let lastSuccessAt = null;
  let snapshotAt = null;
  let rowCount = 0;
  let error = null;
  let metadata = new Map();
  let metadataAt = null;

  async function getJson(url) {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip',
        'Digitraffic-User': DIGITRAFFIC_USER,
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400)
      throw new Error('Digitraffic redirected; redirects are not followed');
    if (!response.ok) throw new Error(`Digitraffic HTTP ${response.status}`);
    return response.json();
  }

  async function refreshMetadata(at) {
    if (metadataAt !== null && at - metadataAt < METADATA_MS) return;
    try {
      const vessels = await getJson(DIGITRAFFIC_VESSELS_URL);
      if (!Array.isArray(vessels)) throw new Error('malformed vessel metadata');
      metadata = new Map(
        vessels.map((vessel) => [String(vessel?.mmsi), vessel]),
      );
      metadataAt = at;
    } catch (failure) {
      // Positions stay valid without names; keep the previous metadata.
      warn(
        `[Digitraffic] vessel metadata failed: ${failure?.message || failure}`,
      );
    }
  }

  async function run() {
    const at = now();
    lastAttemptAt = at;
    try {
      const [collection] = await Promise.all([
        getJson(`${DIGITRAFFIC_LOCATIONS_URL}?from=${at - AISSTREAM_STALE_MS}`),
        refreshMetadata(at),
      ]);
      if (
        collection?.type !== 'FeatureCollection' ||
        !Array.isArray(collection.features)
      )
        throw new Error('malformed Digitraffic locations response');
      const rows = collection.features.flatMap((feature) => {
        const row = digitrafficRow(feature, metadata);
        return row ? [row] : [];
      });
      ingest(rows);
      rowCount = rows.length;
      lastSuccessAt = at;
      snapshotAt = Date.parse(collection.dataUpdatedTime) || at;
      error = null;
    } catch (failure) {
      error = failure?.message || String(failure);
      warn(`[Digitraffic] AIS poll failed: ${error}`);
    }
  }

  return {
    /** Poll when due; resolves once the current or new poll settles. */
    poll() {
      if (inFlight) return inFlight;
      if (lastAttemptAt !== null && now() - lastAttemptAt < POLL_MS)
        return Promise.resolve();
      inFlight = run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
    /** Health of the last poll, in the /api/vessels status vocabulary. */
    snapshot() {
      const at = now();
      const silentForMs = lastSuccessAt === null ? null : at - lastSuccessAt;
      const status =
        lastSuccessAt === null
          ? error
            ? 'error'
            : 'connecting'
          : silentForMs > STALE_AFTER_MS
            ? 'stale'
            : 'live';
      return {
        status,
        error,
        lastMessageAt: lastSuccessAt,
        snapshotAt: status === 'live' ? snapshotAt : null,
        silentForMs,
        nextAttemptAt: lastAttemptAt === null ? null : lastAttemptAt + POLL_MS,
        staleAfterMs: STALE_AFTER_MS,
        rowCount,
      };
    },
  };
}

/** One GeoJSON location feature (+ optional metadata) as a vessel row. */
function digitrafficRow(feature, metadata) {
  const props = feature?.properties || {};
  const mmsi = String(props.mmsi ?? feature?.mmsi ?? '').trim();
  const [lon, lat] = Array.isArray(feature?.geometry?.coordinates)
    ? feature.geometry.coordinates.map(Number)
    : [];
  if (
    !/^\d{5,10}$/.test(mmsi) ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180
  )
    return null;
  const vessel = metadata.get(mmsi) || {};
  const text = (value) => (value == null ? '' : String(value).trim());
  return {
    mmsi,
    lat,
    lon,
    name: text(vessel.name),
    imo: vessel.imo ? text(vessel.imo) : '',
    type: vessel.shipType == null ? '' : text(vessel.shipType),
    destination: text(vessel.destination),
    speed: props.sog ?? null,
    course: props.cog ?? null,
    heading: props.heading ?? null,
    observedAtMs: Number(props.timestampExternal) || null,
    source: DIGITRAFFIC_SOURCE,
  };
}
