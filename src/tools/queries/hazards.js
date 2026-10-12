/** Natural hazard queries: earthquakes and active fires. */

import { suggestView } from '../views.js';
import { defineTool, ToolError } from '../catalog.js';
import { AREA_SCHEMA, areaContains, resolveArea } from '../area.js';
import { LIMIT_SCHEMA, capRows, countNoun, isoTime } from '../results.js';
import { EVENT_TYPE_LABELS } from '../../layers/disasterEvents/records.js';

export const getEarthquakes = defineTool({
  name: 'get_earthquakes',
  title: 'Recent earthquakes',
  description:
    'Earthquakes of magnitude 2.5 or more from the USGS feed for the last 24 ' +
    'hours, strongest first. Optionally limited to an area and a minimum magnitude.',
  inputSchema: {
    type: 'object',
    properties: {
      area: AREA_SCHEMA,
      min_magnitude: { type: 'number', minimum: 2.5, maximum: 10 },
      limit: LIMIT_SCHEMA,
    },
    additionalProperties: false,
  },
  requires: ['earthquakes'],
  async run(args, { services, signal }) {
    const area = args.area
      ? await resolveArea(args.area, { services, signal })
      : null;
    const minimum = args.min_magnitude ?? 2.5;
    const events = (await services.earthquakes.getSnapshot({ signal }))
      .filter(
        (event) => event.mag >= minimum && (!area || areaContains(area, event)),
      )
      .sort((a, b) => b.mag - a.mag || (b.time ?? 0) - (a.time ?? 0));
    const result = capRows(events, args.limit);
    const where = area ? ` in ${area.label}` : ' worldwide';
    const strongest = events[0]
      ? `; strongest M${events[0].mag.toFixed(1)}${events[0].place ? ` ${events[0].place}` : ''}`
      : '';
    return {
      summary: `${countNoun(events.length, 'earthquake')} of M${minimum}+ in the last 24 hours${where}${strongest}.`,
      data: {
        view: suggestView(
          services,
          area
            ? { area, layers: ['earthquakes'] }
            : {
                point: { lat: 20, lon: 0 },
                altitudeM: 15_000_000,
                layers: ['earthquakes'],
              },
        ),
        ...result,
        rows: result.rows.map((event) => ({
          id: event.usgsId ?? event.stableId,
          magnitude: event.mag,
          place: event.place,
          time: isoTime(event.time),
          lat: event.lat,
          lon: event.lon,
          depth_km: event.depthKm,
        })),
      },
    };
  },
});

export const getActiveFires = defineTool({
  name: 'get_active_fires',
  title: 'Active fires',
  description:
    'Satellite fire detections from NASA FIRMS in the last 24 hours within an ' +
    'area, most intense (fire radiative power) first.',
  inputSchema: {
    type: 'object',
    properties: { area: AREA_SCHEMA, limit: LIMIT_SCHEMA },
    required: ['area'],
    additionalProperties: false,
  },
  requires: ['fires'],
  async run(args, { services, signal }) {
    const area = await resolveArea(args.area, { services, signal });
    const snapshot = await services.fires.getSnapshot({ signal });
    if (snapshot.keyRequired)
      throw new ToolError(
        'unavailable',
        'Fire detections need a NASA FIRMS key configured for this server',
      );
    const fires = snapshot.fires
      .filter((fire) => areaContains(area, fire))
      .sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0));
    const result = capRows(fires, args.limit);
    // The proxy serves its last good snapshot when a refresh fails, and marks
    // satellites whose download failed.
    const stale = snapshot.stale === true;
    const missing = (snapshot.sources || [])
      .filter((source) => source?.ok === false)
      .map((source) => source.source);
    const notes = [
      ...(stale ? ['data may be stale'] : []),
      ...(missing.length ? [`no data from ${missing.join(', ')}`] : []),
    ];
    return {
      summary:
        `${countNoun(fires.length, 'fire detection')} in ${area.label} in the last 24 hours` +
        (notes.length ? ` (${notes.join('; ')}).` : '.'),
      data: {
        view: suggestView(services, { area, layers: ['local-firms'] }),
        stale,
        missing_sources: missing,
        fetched_at: isoTime(snapshot.fetchedAt),
        ...result,
        rows: result.rows.map((fire) => ({
          lat: fire.lat,
          lon: fire.lon,
          frp_mw: fire.frp ?? null,
          confidence: fire.confidence ?? null,
          acquired:
            [fire.acqDate, fire.acqTime].filter(Boolean).join(' ') || null,
          satellite: fire.satellite ?? null,
          day_night: fire.daynight ?? null,
        })),
      },
    };
  },
});

const ALERT_ORDER = ['green', 'orange', 'red'];

export const getDisasterEvents = defineTool({
  name: 'get_disaster_events',
  title: 'Disaster events',
  description:
    'Current disaster alerts from GDACS (Global Disaster Alert and ' +
    'Coordination System, EC Joint Research Centre): earthquakes, tropical ' +
    'cyclones, floods, volcanoes, wildfires and droughts with their ' +
    'green/orange/red alert level, most severe first. Optionally filtered ' +
    'by type, minimum alert level and area.',
  inputSchema: {
    type: 'object',
    properties: {
      area: AREA_SCHEMA,
      types: {
        type: 'array',
        items: { type: 'string', enum: Object.keys(EVENT_TYPE_LABELS) },
        minItems: 1,
        description:
          'EQ earthquake, TC tropical cyclone, FL flood, VO volcano, WF wildfire, DR drought.',
      },
      min_alert: { type: 'string', enum: ALERT_ORDER },
      limit: LIMIT_SCHEMA,
    },
    additionalProperties: false,
  },
  requires: ['disasters'],
  async run(args, { services, signal }) {
    const area = args.area
      ? await resolveArea(args.area, { services, signal })
      : null;
    const snapshot = await services.disasters.getSnapshot({ signal });
    if (snapshot.unavailable)
      throw new ToolError(
        'unavailable',
        'GDACS disaster events are unavailable right now',
      );
    const rank = (event) => ALERT_ORDER.indexOf(event.alertLevel);
    const minimum = ALERT_ORDER.indexOf(args.min_alert ?? 'green');
    const events = snapshot.events
      .filter(
        (event) =>
          (!args.types || args.types.includes(event.type)) &&
          rank(event) >= minimum &&
          (!area || areaContains(area, event)),
      )
      .sort(
        (a, b) =>
          rank(b) - rank(a) ||
          String(b.modifiedAt ?? '').localeCompare(
            String(a.modifiedAt ?? ''),
          ) ||
          a.id.localeCompare(b.id),
      );
    const result = capRows(events, args.limit);
    const stale = snapshot.stale === true;
    const top = events[0];
    const where = area ? ` in ${area.label}` : ' worldwide';
    const severest = top
      ? `; most severe: ${top.alertLevel[0].toUpperCase()}${top.alertLevel.slice(1)} ` +
        `${EVENT_TYPE_LABELS[top.type].toLowerCase()} ${top.name}` +
        (top.country ? ` (${top.country})` : '')
      : '';
    return {
      summary:
        `${countNoun(events.length, 'GDACS disaster event')}${where}${severest}` +
        (stale ? ' (data may be stale).' : '.'),
      data: {
        view: suggestView(
          services,
          area
            ? { area, layers: ['disaster-events'] }
            : {
                point: { lat: 20, lon: 0 },
                altitudeM: 15_000_000,
                layers: ['disaster-events'],
              },
        ),
        stale,
        fetched_at: isoTime(snapshot.fetchedAt),
        source: snapshot.source ?? null,
        attribution: snapshot.attribution ?? null,
        ...result,
        rows: result.rows.map((event) => ({
          id: event.id,
          type: event.type,
          type_label: EVENT_TYPE_LABELS[event.type],
          name: event.name,
          alert_level: event.alertLevel,
          country: event.country,
          severity: event.severity,
          from: event.fromDate,
          to: event.toDate,
          current: event.isCurrent,
          lat: event.lat,
          lon: event.lon,
          report_url: event.reportUrl,
        })),
      },
    };
  },
});
