import * as Cesium from 'cesium';

// Attribution and service rights are documented in DATA_SOURCES.md.
export const ESRI_ATTRIBUTION_HTML =
  '<a href="https://www.esri.com" target="_blank" rel="noopener">Powered by Esri</a>';
/** The credit line of ArcGIS Online item 10df2279f9684e4a9f6a7f08febac2a9. */
export const ESRI_SOURCE_CREDIT =
  'Powered by Esri — Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';

/** NASA GIBS Blue Marble (shaded relief + bathymetry): keyless, public domain. */
export const BLUE_MARBLE_TILE_URL =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const BLUE_MARBLE_MAX_LEVEL = 8;
export const GIBS_ATTRIBUTION_HTML =
  'NASA Blue Marble · <a href="https://gibs.earthdata.nasa.gov" target="_blank" rel="noopener">NASA GIBS</a>';

export function createOsmImagery() {
  return new Cesium.OpenStreetMapImageryProvider({
    url: 'https://tile.openstreetmap.org/',
    credit: '© OpenStreetMap contributors',
  });
}

export function createEsriImagery() {
  return Cesium.ArcGisMapServerImageryProvider.fromUrl(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    {
      credit: ESRI_SOURCE_CREDIT,
      enablePickFeatures: false,
    },
  );
}

export function createBlueMarbleImagery() {
  return new Cesium.UrlTemplateImageryProvider({
    url: BLUE_MARBLE_TILE_URL,
    maximumLevel: BLUE_MARBLE_MAX_LEVEL,
    tilingScheme: new Cesium.WebMercatorTilingScheme(),
  });
}

export function createIonImagery(style, accessToken) {
  accessToken = String(accessToken || '').trim();
  if (!accessToken) throw new Error('Ion imagery requires an explicit token');
  return Cesium.IonImageryProvider.fromAssetId(style, { accessToken });
}
