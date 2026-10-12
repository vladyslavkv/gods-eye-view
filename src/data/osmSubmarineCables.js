/**
 * Pure transform from an Overpass JSON response to the bundled OpenStreetMap
 * submarine-cable snapshot (ODbL 1.0). `scripts/build-osm-submarine-cables.mjs`
 * performs the one-off fetch and writes the files; nothing here runs at
 * runtime in the app.
 */

import { douglasPeucker } from '../sources/featureGeometry.js';

const UNDERWATER = '["location"~"^(underwater|submarine)$"]';

/** Every tag combination OSM uses for undersea telecom lines and their stations. */
export const OSM_SUBMARINE_CABLE_QUERY = [
  '[out:json][timeout:300];',
  '(',
  'way["communication"="line"]["submarine"="yes"];',
  'relation["communication"="line"]["submarine"="yes"];',
  `way["communication"="line"]${UNDERWATER};`,
  `relation["communication"="line"]${UNDERWATER};`,
  `way["telecom"="line"]${UNDERWATER};`,
  `relation["telecom"="line"]${UNDERWATER};`,
  ');',
  'out tags geom;',
  'nwr["telecom"="cable_landing_station"];',
  'out tags center;',
].join('\n');

/** Default simplification tolerance in degrees (~110 m at the equator). */
export const DEFAULT_TOLERANCE_DEG = 0.001;
const DECIMALS = 5;
const LANDING_TAG = 'cable_landing_station';
const CONTACT_KEY = /^(contact:|addr:)|^(email|phone|fax|mobile)$/;
const FREE_TEXT_KEY = /^(note|description|comment)(:|$)/;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /\+?\d[\d ().-]{6,}\d/;

/** Drop contact-oriented tags and free text that carries an email or phone number. */
export function scrubOsmTags(tags = {}) {
  const out = {};
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || CONTACT_KEY.test(key)) continue;
    if (FREE_TEXT_KEY.test(key) && (EMAIL.test(value) || PHONE.test(value)))
      continue;
    out[key] = value;
  }
  return out;
}

const round = (value) => Number(value.toFixed(DECIMALS));

function line(points, toleranceDeg, stats) {
  const coords = (points || [])
    .filter((p) => Number.isFinite(p?.lon) && Number.isFinite(p?.lat))
    .map((p) => [p.lon, p.lat]);
  stats.inputVertices += coords.length;
  const out = [];
  for (const [lon, lat] of douglasPeucker(coords, toleranceDeg)) {
    const point = [round(lon), round(lat)];
    const prev = out[out.length - 1];
    if (!prev || prev[0] !== point[0] || prev[1] !== point[1]) out.push(point);
  }
  if (out.length < 2) return null;
  stats.outputVertices += out.length;
  return out;
}

function cableGeometry(element, toleranceDeg, stats) {
  if (element.type === 'way') {
    const coords = line(element.geometry, toleranceDeg, stats);
    return coords && { type: 'LineString', coordinates: coords };
  }
  const parts = (element.members || [])
    .filter((member) => member.type === 'way')
    .map((member) => line(member.geometry, toleranceDeg, stats))
    .filter(Boolean);
  if (!parts.length) return null;
  return parts.length === 1
    ? { type: 'LineString', coordinates: parts[0] }
    : { type: 'MultiLineString', coordinates: parts };
}

function landingPoint(element) {
  const lon = element.lon ?? element.center?.lon;
  const lat = element.lat ?? element.center?.lat;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { type: 'Point', coordinates: [round(lon), round(lat)] };
}

const byId = (a, b) => {
  const [typeA, idA] = a.properties.id.split('/');
  const [typeB, idB] = b.properties.id.split('/');
  return typeA.localeCompare(typeB) || Number(idA) - Number(idB);
};

/**
 * Build the cable and landing-point collections. Landing points come ONLY
 * from elements tagged `telecom=cable_landing_station` (a way contributes the
 * centre Overpass reports for it); cable endpoints never become landing points.
 */
export function buildOsmSubmarineCableDataset(
  raw,
  { toleranceDeg = DEFAULT_TOLERANCE_DEG } = {},
) {
  if (!Array.isArray(raw?.elements))
    throw new TypeError('Overpass response has no elements array');
  const timestamp = raw.osm3s?.timestamp_osm_base;
  if (!timestamp)
    throw new TypeError('Overpass response has no osm3s.timestamp_osm_base');

  const stats = { timestamp, inputVertices: 0, outputVertices: 0 };
  const cables = new Map();
  const landing = new Map();
  for (const element of raw.elements) {
    const id = `${element.type}/${element.id}`;
    const tags = element.tags || {};
    if (tags.telecom === LANDING_TAG) {
      const geometry = !landing.has(id) && landingPoint(element);
      if (geometry)
        landing.set(id, {
          type: 'Feature',
          properties: { id, ...scrubOsmTags(tags) },
          geometry,
        });
    } else if (element.type !== 'node' && !cables.has(id)) {
      const geometry = cableGeometry(element, toleranceDeg, stats);
      if (geometry)
        cables.set(id, {
          type: 'Feature',
          properties: { id, ...scrubOsmTags(tags) },
          geometry,
        });
    }
  }
  const collection = (map) => ({
    type: 'FeatureCollection',
    features: [...map.values()].sort(byId),
  });
  return {
    cables: collection(cables),
    landingPoints: collection(landing),
    stats: { ...stats, cables: cables.size, landingPoints: landing.size },
  };
}
