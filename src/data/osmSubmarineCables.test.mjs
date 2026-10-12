import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import {
  OSM_SUBMARINE_CABLE_QUERY,
  buildOsmSubmarineCableDataset,
  scrubOsmTags,
} from './osmSubmarineCables.js';

const TIMESTAMP = '2026-10-12T00:00:00Z';

function overpass(elements) {
  return { osm3s: { timestamp_osm_base: TIMESTAMP }, elements };
}

function cableWay(id, tags = {}, geometry = null) {
  return {
    type: 'way',
    id,
    tags: { communication: 'line', submarine: 'yes', ...tags },
    geometry: geometry || [
      { lat: 10, lon: 20 },
      { lat: 10.5, lon: 20.5 },
      { lat: 11, lon: 21 },
    ],
  };
}

test('should ask Overpass for every submarine telecom tag combination when building the query', () => {
  for (const clause of [
    'way["communication"="line"]["submarine"="yes"]',
    'relation["communication"="line"]["submarine"="yes"]',
    'way["communication"="line"]["location"~"^(underwater|submarine)$"]',
    'way["telecom"="line"]["location"~"^(underwater|submarine)$"]',
    'nwr["telecom"="cable_landing_station"]',
  ]) {
    assert.ok(OSM_SUBMARINE_CABLE_QUERY.includes(clause), clause);
  }
  assert.match(OSM_SUBMARINE_CABLE_QUERY, /out tags geom;/);
  assert.match(OSM_SUBMARINE_CABLE_QUERY, /out tags center;/);
});

test('should turn cable ways into LineStrings keyed by OSM id when the response is valid', () => {
  const { cables, landingPoints, stats } = buildOsmSubmarineCableDataset(
    overpass([
      cableWay(2, { name: 'Bravo', operator: 'Op', ref: 'B-1' }),
      cableWay(1, { location: 'underwater', submarine: undefined }),
    ]),
  );
  assert.equal(cables.type, 'FeatureCollection');
  assert.deepEqual(
    cables.features.map((feature) => feature.properties.id),
    ['way/1', 'way/2'],
  );
  const bravo = cables.features[1];
  assert.equal(bravo.geometry.type, 'LineString');
  assert.equal(bravo.properties.name, 'Bravo');
  assert.equal(bravo.properties.operator, 'Op');
  assert.equal(bravo.properties.ref, 'B-1');
  assert.deepEqual(landingPoints.features, []);
  assert.equal(stats.timestamp, TIMESTAMP);
  assert.equal(stats.cables, 2);
  assert.equal(stats.landingPoints, 0);
});

test('should leave absent OSM facts absent when a way has no name or dates', () => {
  const { cables } = buildOsmSubmarineCableDataset(overpass([cableWay(7)]));
  const props = cables.features[0].properties;
  for (const invented of ['name', 'rfs', 'length', 'owners', 'color']) {
    assert.equal(Object.hasOwn(props, invented), false, invented);
  }
});

test('should never synthesize landing points from cable endpoints when no station is tagged', () => {
  const { landingPoints } = buildOsmSubmarineCableDataset(
    overpass([cableWay(1), cableWay(2)]),
  );
  assert.deepEqual(landingPoints.features, []);
});

test('should take landing points only from tagged stations when nodes and ways carry the tag', () => {
  const { landingPoints, stats } = buildOsmSubmarineCableDataset(
    overpass([
      {
        type: 'node',
        id: 5,
        lat: 1,
        lon: 2,
        tags: { telecom: 'cable_landing_station', name: 'North CLS' },
      },
      {
        type: 'way',
        id: 6,
        center: { lat: 3, lon: 4 },
        tags: { telecom: 'cable_landing_station' },
      },
      { type: 'node', id: 9, lat: 0, lon: 0, tags: { man_made: 'pier' } },
    ]),
  );
  assert.deepEqual(
    landingPoints.features.map((feature) => [
      feature.properties.id,
      feature.geometry.coordinates,
    ]),
    [
      ['node/5', [2, 1]],
      ['way/6', [4, 3]],
    ],
  );
  assert.equal(stats.landingPoints, 2);
});

test('should drop duplicate elements when Overpass returns one way from two clauses', () => {
  const { cables } = buildOsmSubmarineCableDataset(
    overpass([cableWay(3), cableWay(3)]),
  );
  assert.equal(cables.features.length, 1);
});

test('should merge relation member geometry into one MultiLineString when a cable is a relation', () => {
  const { cables } = buildOsmSubmarineCableDataset(
    overpass([
      {
        type: 'relation',
        id: 4,
        tags: { communication: 'line', submarine: 'yes', name: 'Rel' },
        members: [
          {
            type: 'way',
            geometry: [
              { lat: 0, lon: 0 },
              { lat: 0, lon: 1 },
            ],
          },
          {
            type: 'way',
            geometry: [
              { lat: 1, lon: 1 },
              { lat: 1, lon: 2 },
            ],
          },
          { type: 'node', lat: 5, lon: 5 },
        ],
      },
    ]),
  );
  assert.equal(cables.features[0].properties.id, 'relation/4');
  assert.equal(cables.features[0].geometry.type, 'MultiLineString');
  assert.equal(cables.features[0].geometry.coordinates.length, 2);
});

test('should simplify and round coordinates when a way is denser than the tolerance', () => {
  const geometry = [];
  for (let i = 0; i <= 100; i += 1) {
    geometry.push({ lat: 10 + i * 0.001, lon: 20.123456789 + i * 0.001 });
  }
  const { cables, stats } = buildOsmSubmarineCableDataset(
    overpass([cableWay(1, {}, geometry)]),
    { toleranceDeg: 0.001 },
  );
  const coords = cables.features[0].geometry.coordinates;
  assert.equal(coords.length, 2);
  assert.deepEqual(coords[0], [20.12346, 10]);
  assert.equal(stats.inputVertices, 101);
  assert.equal(stats.outputVertices, 2);
});

test('should skip a cable when its geometry collapses below two points', () => {
  const { cables } = buildOsmSubmarineCableDataset(
    overpass([cableWay(1, {}, [{ lat: 1, lon: 1 }])]),
  );
  assert.equal(cables.features.length, 0);
});

test('should drop contact fields and personal identifiers when scrubbing tags', () => {
  assert.deepEqual(
    scrubOsmTags({
      name: 'Station',
      operator: 'Carrier',
      ref: 'X',
      email: 'a@b.example',
      phone: '+1 555 0100',
      fax: '+1 555 0101',
      'contact:email': 'noc@b.example',
      'contact:phone': '+1',
      'addr:street': 'Somewhere',
      note: 'Ask noc@b.example',
      description: 'Call +1 (555) 010-0199 for access',
      fixme: 'continue',
    }),
    { name: 'Station', operator: 'Carrier', ref: 'X', fixme: 'continue' },
  );
});

test('should reject a response when it lacks elements or the OSM base timestamp', () => {
  assert.throws(() => buildOsmSubmarineCableDataset({}), /elements/);
  assert.throws(
    () => buildOsmSubmarineCableDataset({ elements: [] }),
    /timestamp_osm_base/,
  );
});

test('should ship a bundled OSM snapshot when the dataset is read from disk', () => {
  const dir = new URL('./local_data/osm_submarine_cables/', import.meta.url);
  const cables = JSON.parse(readFileSync(new URL('cables.geojson', dir)));
  const landing = JSON.parse(
    readFileSync(new URL('landing-points.geojson', dir)),
  );
  const readme = readFileSync(new URL('README.md', dir), 'utf8');
  assert.ok(cables.features.length > 500);
  assert.ok(
    cables.features.every((feature) =>
      /^(way|relation)\/\d+$/.test(feature.properties.id),
    ),
  );
  assert.ok(
    landing.features.every(
      (feature) => feature.properties.telecom === 'cable_landing_station',
    ),
  );
  assert.ok(statSync(new URL('cables.geojson', dir)).size < 5 * 1024 * 1024);
  assert.match(readme, /ODbL/);
  assert.match(readme, /OpenStreetMap contributors/);
  assert.ok(readme.includes(`${cables.features.length}`));
  for (const text of [
    JSON.stringify(cables),
    JSON.stringify(landing),
    readme,
  ]) {
    assert.doesNotMatch(text, /telegeography|submarinecablemap/i);
    assert.doesNotMatch(text, /"(email|phone|fax|contact:[^"]*)":/);
  }
});
