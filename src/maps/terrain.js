import * as Cesium from 'cesium';
import { createTerrainRetryPolicy } from './terrainRetry.js';
import { createOptInSources } from '../sources/optInSources.js';

const terrainOptIn = createOptInSources();

/** Re:Earth / Mapterhorn ellipsoidal quantized mesh, CC BY 4.0. */
export const KEYLESS_TERRAIN_URL =
  'https://terrain.reearth.land/cesium-mesh/ellipsoid';

/** These factories are lazy: a hidden globe must not trigger terrain loading. */
export async function createWorldTerrain(accessToken, { signal } = {}) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken)
    throw new Error('World terrain requires an explicit ion token');
  signal?.throwIfAborted();
  const resource = await Cesium.IonResource.fromAssetId(1, { accessToken });
  signal?.throwIfAborted();
  return {
    provider: await Cesium.CesiumTerrainProvider.fromUrl(resource, {
      requestVertexNormals: true,
      requestWaterMask: false,
      ellipsoid: Cesium.Ellipsoid.WGS84,
    }),
  };
}

function logThrottle({ statusCode, delayMs, inWindow }) {
  // One line per cooldown window, not per tile: a burst throttles dozens.
  if (inWindow !== 1) return;
  console.warn(
    `[MapStack] Re:Earth terrain answered ${statusCode}; retrying throttled tiles after ${Math.round(delayMs)} ms`,
  );
}

/**
 * The Re:Earth resource with the tile retry policy attached. Cesium copies
 * `retryCallback`/`retryAttempts` onto every derived resource, so layer.json
 * and each `{z}/{x}/{y}.terrain` fetch inherit it (see `terrainRetry.js`).
 * @param {ReturnType<typeof createTerrainRetryPolicy>} [policy]
 * @returns {Cesium.Resource}
 */
export function createKeylessTerrainResource(
  policy = createTerrainRetryPolicy({ onThrottle: logThrottle }),
) {
  return new Cesium.Resource({
    url: KEYLESS_TERRAIN_URL,
    retryCallback: policy.retryCallback,
    retryAttempts: policy.retryAttempts,
  });
}

/**
 * Keyless globe terrain. The hosted Re:Earth service publishes no service
 * terms, so it is used only when the server opts in (REEARTH_TERRAIN_ENABLED=1,
 * docs/COMMERCIAL_CONFIG.md); otherwise the globe is the flat ellipsoid.
 * @param {unknown} [_request] Map-stack request (unused).
 * @param {{enabled?: () => Promise<boolean>}} [options]
 */
export async function createKeylessTerrain(
  _request,
  { enabled = () => terrainOptIn('reearth-terrain') } = {},
) {
  if (!(await enabled())) {
    console.info(
      '[MapStack] Re:Earth terrain disabled — not licensed for commercial use in this build; using flat ellipsoid terrain',
    );
    return { provider: new Cesium.EllipsoidTerrainProvider() };
  }
  try {
    return {
      provider: await Cesium.CesiumTerrainProvider.fromUrl(
        createKeylessTerrainResource(),
      ),
    };
  } catch (error) {
    console.warn(
      '[MapStack] Re:Earth terrain unavailable, falling back to flat ellipsoid terrain:',
      error,
    );
    return { provider: new Cesium.EllipsoidTerrainProvider() };
  }
}
