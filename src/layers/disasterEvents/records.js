/**
 * GDACS disaster-event normalization. Pure — no Cesium, DOM or Node imports;
 * the server proxy runs it on each upstream collection.
 */

/** GDACS event types, in the order the proxy requests them. */
export const GDACS_EVENT_TYPES = Object.freeze([
  'EQ',
  'TC',
  'FL',
  'VO',
  'WF',
  'DR',
]);
/** Plain names for the GDACS event type codes. */
export const EVENT_TYPE_LABELS = Object.freeze({
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  WF: 'Wildfire',
  DR: 'Drought',
});
export const GDACS_ALERT_LEVELS = Object.freeze(['green', 'orange', 'red']);
const MAX_EVENTS_PER_TYPE = 500;

/** The public GDACS report page for one event episode. */
export function gdacsReportUrl(type, eventId, episodeId) {
  return `https://www.gdacs.org/report.aspx?eventid=${eventId}&episodeid=${episodeId}&eventtype=${type}`;
}

function text(value, max = 200) {
  if (typeof value !== 'string') return null;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean && clean.length <= max && !/[\u0000-\u001f<>]/.test(clean)
    ? clean
    : null;
}

/** GDACS stamps UTC without a zone ("2026-10-08T10:29:00"). */
function utc(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z?$/.test(value)
  )
    return null;
  const stamp = value.endsWith('Z') ? value : `${value}Z`;
  const ms = Date.parse(stamp);
  if (!Number.isFinite(ms)) return null;
  const iso = new Date(ms).toISOString();
  // Date.parse rolls impossible days over; a changed calendar date is invalid.
  return iso.slice(0, 10) === value.slice(0, 10) ? iso : null;
}

const id = (value, min) =>
  Number.isSafeInteger(value) && value >= min ? value : null;

/**
 * Normalize one GDACS MAP feature collection for a single event type into
 * one marker row per event. Individually invalid features are skipped; a
 * payload that is not a feature collection rejects the whole refresh.
 */
export function normalizeGdacsFeatures(payload, type) {
  if (!GDACS_EVENT_TYPES.includes(type)) throw new Error('invalid_gdacs_type');
  if (payload?.type !== 'FeatureCollection' || !Array.isArray(payload.features))
    throw new Error('invalid_gdacs_payload');
  const rows = [];
  const seen = new Set();
  for (const feature of payload.features) {
    const p = feature?.properties;
    const coordinates = feature?.geometry?.coordinates;
    // The MAP feed adds outline polygons and, for floods, affected/global
    // points beside the centroid; only the centroid marks the event.
    if (
      !p ||
      typeof p !== 'object' ||
      feature.geometry?.type !== 'Point' ||
      (p.Class !== undefined && p.Class !== 'Point_Centroid') ||
      p.eventtype !== type ||
      !Array.isArray(coordinates)
    )
      continue;
    const [lon, lat] = coordinates;
    const eventId = id(p.eventid, 1);
    const episodeId = id(p.episodeid, 0);
    const alertLevel =
      typeof p.alertlevel === 'string' ? p.alertlevel.toLowerCase() : null;
    const name = text(p.name) ?? text(p.description);
    if (
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lon) > 180 ||
      Math.abs(lat) > 90 ||
      eventId === null ||
      episodeId === null ||
      !GDACS_ALERT_LEVELS.includes(alertLevel) ||
      !name
    )
      continue;
    const key = `${type}-${eventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      id: key,
      type,
      eventId,
      episodeId,
      name,
      alertLevel,
      country: text(p.country),
      fromDate: utc(p.fromdate),
      toDate: utc(p.todate),
      modifiedAt: utc(p.datemodified),
      severity: text(p.severitydata?.severitytext),
      isCurrent: p.iscurrent === true || p.iscurrent === 'true',
      lat,
      lon,
      reportUrl: gdacsReportUrl(type, eventId, episodeId),
    });
    if (rows.length >= MAX_EVENTS_PER_TYPE) break;
  }
  return rows;
}
