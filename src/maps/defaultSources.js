import { MAP_STACKS } from './catalog.js';
import { KEYLESS_DEFAULT_STACK_ID } from './imageryComparison.js';
import { photorealUnavailableReason } from './availability.js';
import { keySetupRequirement } from '../keySetupCore.mjs';
import {
  createOsmImagery,
  createEsriImagery,
  createBlueMarbleImagery,
  createIonImagery,
  ESRI_ATTRIBUTION_HTML,
  GIBS_ATTRIBUTION_HTML,
} from './imagery.js';
import { createWorldTerrain, createKeylessTerrain } from './terrain.js';

/**
 * Esri's terms require Esri software or an ArcGIS Online subscription for this
 * use (DATA_SOURCES.md), so the stack stays off until the operator says so.
 */
export const ESRI_UNLICENSED_REASON =
  'Esri World Imagery needs Esri software or an ArcGIS Online subscription; set ESRI_IMAGERY_LICENSED=1 once licensed';

const IMAGERY_FACTORIES = {
  osm: createOsmImagery,
  'esri-imagery': createEsriImagery,
  gibs: createBlueMarbleImagery,
};

/** Select sources and setup guidance without putting provider branches in the controller. */
export function createDefaultMapSources({
  googleTileset = null,
  cesiumToken = '',
  googleApiKey = '',
  esriImageryLicensed = false,
} = {}) {
  const ionToken = String(cesiumToken || '').trim();
  const hasIon = Boolean(ionToken);
  const hasGoogle = Boolean(String(googleApiKey || '').trim());
  const terrain = {
    id: hasIon ? 'world' : 'keyless',
    create: hasIon
      ? (request) => createWorldTerrain(ionToken, request)
      : createKeylessTerrain,
  };
  return {
    defaultId: googleTileset ? 'photoreal' : KEYLESS_DEFAULT_STACK_ID,
    unknownId: 'photoreal',
    recoveryId: googleTileset ? 'photoreal' : null,
    state: { hasCesiumIonToken: hasIon },
    sources: MAP_STACKS.map((descriptor) => {
      const common = {
        descriptor,
        available: !descriptor.requiresIon || hasIon,
        unavailableReason: descriptor.requiresIon
          ? keySetupRequirement('cesium-ion')
          : null,
      };
      if (descriptor.kind === 'photoreal')
        return {
          ...common,
          available: Boolean(googleTileset),
          unavailableReason: photorealUnavailableReason(hasIon || hasGoogle),
          tileset: googleTileset,
        };
      const imagery =
        descriptor.kind === 'ion'
          ? () => createIonImagery(descriptor.style, ionToken)
          : IMAGERY_FACTORIES[descriptor.kind];
      return {
        ...common,
        imagery,
        terrain,
        ...(descriptor.kind === 'gibs'
          ? {
              credit: GIBS_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Blue Marble is unavailable; using OSM',
              },
              tileFailureFallback: {
                id: 'osm',
                threshold: 2,
                message: 'Blue Marble tile requests failed; using OSM',
              },
            }
          : {}),
        ...(descriptor.id === 'esri-imagery'
          ? {
              available: esriImageryLicensed === true,
              unavailableReason: esriImageryLicensed
                ? null
                : ESRI_UNLICENSED_REASON,
              credit: ESRI_ATTRIBUTION_HTML,
              constructionFallback: {
                id: 'osm',
                message: 'Esri Satellite is unavailable; using OSM',
              },
              tileFailureFallback: {
                id: 'osm',
                threshold: 2,
                message: 'Esri Satellite tile requests failed; using OSM',
              },
            }
          : {}),
      };
    }),
  };
}
