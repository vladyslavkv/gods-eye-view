/** Submarine telecom cables and cable landing stations mapped in OpenStreetMap. */

import { suggestView } from '../views.js';
import { defineTool, ToolError } from '../catalog.js';
import {
  AREA_SCHEMA,
  areaContains,
  lineTouchesArea,
  resolveArea,
} from '../area.js';
import { LIMIT_SCHEMA, capRows, countNoun } from '../results.js';

const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

function cableLines(feature) {
  const geometry = feature?.geometry;
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

export const findSubmarineCables = defineTool({
  name: 'find_submarine_cables',
  title: 'Submarine cables',
  description:
    'Undersea telecommunication cables and cable landing stations mapped ' +
    'in OpenStreetMap: those passing through or landing in an area, ' +
    'and/or those whose name matches. Rows carry only what OSM records ' +
    '(name, operator, ref); unnamed cable segments have a null name.',
  inputSchema: {
    type: 'object',
    properties: {
      area: AREA_SCHEMA,
      name: { type: 'string', minLength: 2, maxLength: 80 },
      limit: LIMIT_SCHEMA,
    },
    additionalProperties: false,
  },
  requires: ['cables'],
  async run(args, { services, signal }) {
    if (!args.area && !args.name)
      throw new ToolError('invalid_arguments', 'Give an area, a name or both');
    const area = args.area
      ? await resolveArea(args.area, { services, signal })
      : null;
    const wanted = args.name?.toLowerCase();
    const { cables, landingPoints } = await services.cables.fetch(signal);
    const landingRows = (landingPoints?.features || [])
      .map((feature) => ({
        id: feature.properties?.id ?? null,
        name: feature.properties?.name ?? null,
        lon: feature.geometry?.coordinates?.[0],
        lat: feature.geometry?.coordinates?.[1],
      }))
      .filter(
        (point) =>
          point.name &&
          Number.isFinite(point.lat) &&
          (!area || areaContains(area, point)),
      );
    const rows = (cables?.features || [])
      .filter((feature) => {
        const name = String(feature.properties?.name || '');
        if (wanted && !name.toLowerCase().includes(wanted)) return false;
        return (
          !area ||
          cableLines(feature).some((line) => lineTouchesArea(line, area))
        );
      })
      .map(({ properties = {} }) => ({
        id: properties.id ?? null,
        name: properties.name ?? null,
        operator: properties.operator ?? null,
        ref: properties.ref ?? null,
      }))
      // Named cables alphabetically, then unnamed segments.
      .sort(
        (a, b) =>
          (a.name === null) - (b.name === null) ||
          (a.name || '').localeCompare(b.name || ''),
      );
    const where = area ? ` in ${area.label}` : '';
    const what = wanted ? ` matching "${args.name}"` : '';
    return {
      summary:
        `${countNoun(rows.length, 'submarine cable')}${what}${where}` +
        (area
          ? `, with ${countNoun(landingRows.length, 'cable landing station')}.`
          : '.'),
      data: {
        view: suggestView(
          services,
          area
            ? { area, layers: ['submarine-cables'] }
            : {
                point: { lat: 20, lon: 0 },
                altitudeM: 15_000_000,
                layers: ['submarine-cables'],
              },
        ),
        ...capRows(rows, args.limit),
        landing_stations: area ? capRows(landingRows, args.limit) : null,
        attribution: ATTRIBUTION,
      },
    };
  },
});
