import test from 'node:test';
import assert from 'node:assert/strict';
import * as Cesium from 'cesium';
import {
  createIonImagery,
  createBlueMarbleImagery,
  BLUE_MARBLE_TILE_URL,
  ESRI_SOURCE_CREDIT,
  GIBS_ATTRIBUTION_HTML,
} from './imagery.js';
import { createWorldTerrain, createKeylessTerrain } from './terrain.js';
import { createDefaultMapSources } from './defaultSources.js';

test('Esri uses Re:Earth without keys and preserves ion terrain when configured', async () => {
  const originalTerrain = Cesium.CesiumTerrainProvider.fromUrl;
  const originalResource = Cesium.IonResource.fromAssetId;
  const calls = [];
  try {
    Cesium.CesiumTerrainProvider.fromUrl = async (resource) => {
      calls.push(resource);
      return { resource };
    };
    Cesium.IonResource.fromAssetId = async () =>
      assert.fail('keyless mode must not acquire ion terrain');
    const keyless = createDefaultMapSources({ esriImageryLicensed: true });
    const esri = keyless.sources.find(
      ({ descriptor }) => descriptor.id === 'esri-imagery',
    );
    assert.equal(esri.available, true);
    assert.equal(esri.terrain.id, 'keyless');
    assert.equal(esri.terrain.create, createKeylessTerrain);
    // Re:Earth is default-off; this case opts in the way the server would.
    await esri.terrain.create(undefined, { enabled: async () => true });
    // A Resource, not a bare URL: the retry policy rides on it (terrainRetry.js).
    assert.equal(calls.length, 1);
    assert.ok(calls[0] instanceof Cesium.Resource);
    assert.equal(
      calls[0].url,
      'https://terrain.reearth.land/cesium-mesh/ellipsoid',
    );
    assert.equal(calls[0].retryAttempts, 3);
    assert.equal(typeof calls[0].retryCallback, 'function');
    assert.equal(
      keyless.sources.find(({ descriptor }) => descriptor.id === 'photoreal')
        .available,
      false,
    );
    for (const credentials of [
      { googleApiKey: 'test-key' },
      { cesiumToken: 'test-token' },
    ]) {
      const keyed = createDefaultMapSources({
        ...credentials,
        esriImageryLicensed: true,
        googleTileset: { show: true },
      });
      assert.equal(
        keyed.sources.find(({ descriptor }) => descriptor.id === 'photoreal')
          .available,
        true,
      );
      assert.equal(
        keyed.sources.find(({ descriptor }) => descriptor.id === 'esri-imagery')
          .terrain.id,
        credentials.cesiumToken ? 'world' : 'keyless',
      );
      const failedTileset = createDefaultMapSources(credentials);
      assert.equal(
        failedTileset.sources.find(
          ({ descriptor }) => descriptor.id === 'photoreal',
        ).available,
        false,
      );
    }
  } finally {
    Cesium.CesiumTerrainProvider.fromUrl = originalTerrain;
    Cesium.IonResource.fromAssetId = originalResource;
  }
});

test('imagery and terrain pass their own ion token without relying on SDK defaults', async () => {
  const originalImagery = Cesium.IonImageryProvider.fromAssetId;
  const originalResource = Cesium.IonResource.fromAssetId;
  const originalTerrain = Cesium.CesiumTerrainProvider.fromUrl;
  const calls = [];
  const defaultToken = Cesium.Ion.defaultAccessToken;
  try {
    Cesium.IonImageryProvider.fromAssetId = async (id, options) => {
      calls.push({ kind: 'imagery', id, options });
      return { id };
    };
    Cesium.IonResource.fromAssetId = async (id, options) => {
      calls.push({ kind: 'resource', id, options });
      return { id };
    };
    Cesium.CesiumTerrainProvider.fromUrl = async (resource, options) => {
      calls.push({ kind: 'terrain', resource, options });
      return { id: 'terrain' };
    };
    await createIonImagery(Cesium.IonWorldImageryStyle.AERIAL, 'imagery-token');
    const result = await createWorldTerrain('terrain-token');
    assert.equal(calls[0].options.accessToken, 'imagery-token');
    assert.equal(calls[1].options.accessToken, 'terrain-token');
    assert.equal(calls[1].id, 1);
    assert.equal(calls[2].options.requestVertexNormals, true);
    assert.equal(result.provider.id, 'terrain');
    assert.equal(Cesium.Ion.defaultAccessToken, defaultToken);
  } finally {
    Cesium.IonImageryProvider.fromAssetId = originalImagery;
    Cesium.IonResource.fromAssetId = originalResource;
    Cesium.CesiumTerrainProvider.fromUrl = originalTerrain;
  }
});

test('cancellation after ion metadata prevents terrain construction', async () => {
  const originalResource = Cesium.IonResource.fromAssetId;
  const originalTerrain = Cesium.CesiumTerrainProvider.fromUrl;
  const controller = new AbortController();
  try {
    Cesium.IonResource.fromAssetId = async () => {
      controller.abort();
      return {};
    };
    Cesium.CesiumTerrainProvider.fromUrl = () =>
      assert.fail('cancelled terrain construction');
    await assert.rejects(
      createWorldTerrain('test-token', { signal: controller.signal }),
      { name: 'AbortError' },
    );
  } finally {
    Cesium.IonResource.fromAssetId = originalResource;
    Cesium.CesiumTerrainProvider.fromUrl = originalTerrain;
  }
});

test('credentialed source factories reject an omitted token instead of consuming an SDK default', async () => {
  assert.throws(
    () => createIonImagery(Cesium.IonWorldImageryStyle.AERIAL, ''),
    /explicit token/,
  );
  await assert.rejects(createWorldTerrain(' '), /explicit ion token/);
});

test('both Google 3D routes keep tiles drawing while draped imagery loads', async () => {
  const { createGoogleDirectTileset, createGoogleIonTileset } =
    await import('./google3d.js');
  const calls = [];
  const sdk = {
    createGooglePhotorealistic3DTileset: async (...args) => {
      calls.push(args);
      return 'direct';
    },
    IonResource: { fromAssetId: async (id, options) => ({ id, ...options }) },
    Cesium3DTileset: {
      fromUrl: async (...args) => {
        calls.push(args);
        return 'ion';
      },
    },
  };
  assert.equal(await createGoogleDirectTileset(sdk, 'key'), 'direct');
  assert.equal(await createGoogleIonTileset(sdk, 'token'), 'ion');
  assert.deepEqual(calls[0], [
    { key: 'key', onlyUsingWithGoogleGeocoder: true },
    { asynchronouslyLoadImagery: true },
  ]);
  assert.equal(calls[1][0].id, 2275207);
  assert.equal(calls[1][0].accessToken, 'token');
  assert.equal(calls[1][1].asynchronouslyLoadImagery, true);
  assert.equal(calls[1][1].enableCollision, true);
});

test('should use flat ellipsoid terrain without contacting Re:Earth when it is not opted in', async (t) => {
  const fromUrl = t.mock.method(
    Cesium.CesiumTerrainProvider,
    'fromUrl',
    async () => ({}),
  );
  const { provider } = await createKeylessTerrain(undefined, {
    enabled: async () => false,
  });
  assert.ok(provider instanceof Cesium.EllipsoidTerrainProvider);
  assert.equal(fromUrl.mock.callCount(), 0, 'Re:Earth was contacted');
});

test('should treat an unreachable opt-in endpoint as Re:Earth disabled', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Failed to fetch');
  });
  const fromUrl = t.mock.method(
    Cesium.CesiumTerrainProvider,
    'fromUrl',
    async () => ({}),
  );
  const { provider } = await createKeylessTerrain();
  assert.ok(provider instanceof Cesium.EllipsoidTerrainProvider);
  assert.equal(fromUrl.mock.callCount(), 0, 'Re:Earth was contacted');
});

test('should land on NASA Blue Marble and keep Esri unavailable with its licence reason when no Esri licence is declared', () => {
  const keyless = createDefaultMapSources();
  assert.equal(keyless.defaultId, 'blue-marble');
  const byId = (id) =>
    keyless.sources.find(({ descriptor }) => descriptor.id === id);
  assert.equal(byId('blue-marble').available, true);
  assert.equal(byId('blue-marble').credit, GIBS_ATTRIBUTION_HTML);
  assert.equal(byId('esri-imagery').available, false);
  assert.equal(byId('esri-imagery').descriptor.hideWhenUnavailable, true);
  assert.match(
    byId('esri-imagery').unavailableReason,
    /ESRI_IMAGERY_LICENSED=1/,
  );
  assert.match(
    byId('esri-imagery').unavailableReason,
    /ArcGIS Online subscription/,
  );
  // A Google tileset still wins the landing; Esri stays licence-gated.
  const keyed = createDefaultMapSources({ googleTileset: { show: true } });
  assert.equal(keyed.defaultId, 'photoreal');
  assert.equal(
    keyed.sources.find(({ descriptor }) => descriptor.id === 'esri-imagery')
      .available,
    false,
  );
});

test('should offer Esri World Imagery when the operator declares an Esri licence', () => {
  const licensed = createDefaultMapSources({ esriImageryLicensed: true });
  const esri = licensed.sources.find(
    ({ descriptor }) => descriptor.id === 'esri-imagery',
  );
  assert.equal(esri.available, true);
  assert.equal(esri.unavailableReason, null);
  assert.equal(licensed.defaultId, 'blue-marble');
});

test('should build the Blue Marble provider from the keyless GIBS Web Mercator endpoint when created', () => {
  const provider = createBlueMarbleImagery();
  assert.ok(provider instanceof Cesium.UrlTemplateImageryProvider);
  assert.equal(provider.url, BLUE_MARBLE_TILE_URL);
  assert.equal(
    BLUE_MARBLE_TILE_URL,
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
  );
  assert.equal(provider.maximumLevel, 8);
  assert.ok(provider.tilingScheme instanceof Cesium.WebMercatorTilingScheme);
  // The acknowledgement is the source's on-screen credit, not a second one.
  assert.equal(provider.credit, undefined);
});

test('should credit Esri with the exact credit line of its ArcGIS Online item', () => {
  assert.equal(
    ESRI_SOURCE_CREDIT,
    'Powered by Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community',
  );
});
