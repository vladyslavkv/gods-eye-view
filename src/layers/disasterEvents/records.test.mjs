import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GDACS_EVENT_TYPES,
  gdacsReportUrl,
  normalizeGdacsFeatures,
} from './records.js';
import { gdacsFeature } from './testDoubles.mjs';

test('should normalize a GDACS centroid when the feature is valid', () => {
  const [row] = normalizeGdacsFeatures(
    { type: 'FeatureCollection', features: [gdacsFeature()] },
    'VO',
  );
  assert.deepEqual(row, {
    id: 'VO-1000151',
    type: 'VO',
    eventId: 1000151,
    episodeId: 1,
    name: 'Eruption Taal',
    alertLevel: 'orange',
    country: 'Philippines',
    fromDate: '2026-10-08T10:29:00.000Z',
    toDate: '2026-10-08T10:29:00.000Z',
    modifiedAt: '2026-10-08T13:02:20.000Z',
    severity: null,
    isCurrent: true,
    lat: 14.0106,
    lon: 120.9975,
    reportUrl:
      'https://www.gdacs.org/report.aspx?eventid=1000151&episodeid=1&eventtype=VO',
  });
});

test('should keep one marker per event when GDACS sends polygons and extra points', () => {
  const rows = normalizeGdacsFeatures(
    {
      type: 'FeatureCollection',
      features: [
        gdacsFeature({ eventtype: 'FL', Class: 'Point_Affected' }),
        gdacsFeature({ eventtype: 'FL' }),
        gdacsFeature({ eventtype: 'FL', Class: 'Point_Global' }),
        gdacsFeature(
          { eventtype: 'FL', Class: 'Poly_Affected' },
          {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
            ],
          },
        ),
        gdacsFeature({ eventtype: 'FL' }),
      ],
    },
    'FL',
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 'FL-1000151');
});

test('should skip invalid features when the rest of the collection is valid', () => {
  const rows = normalizeGdacsFeatures(
    {
      type: 'FeatureCollection',
      features: [
        null,
        gdacsFeature({ eventtype: 'EQ' }),
        gdacsFeature({ alertlevel: 'Purple' }),
        gdacsFeature({ eventid: -4 }),
        gdacsFeature({ name: '<script>', description: '' }),
        gdacsFeature({}, { type: 'Point', coordinates: [181, 0] }),
        gdacsFeature({ eventid: 7, severitydata: { severitytext: 'M 5.5' } }),
      ],
    },
    'VO',
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.severity]),
    [['VO-7', 'M 5.5']],
  );
});

test('should drop unreadable dates instead of inventing them when GDACS dates are malformed', () => {
  const [row] = normalizeGdacsFeatures(
    {
      type: 'FeatureCollection',
      features: [
        gdacsFeature({
          fromdate: 'yesterday',
          todate: '2026-13-40T00:00:00',
          datemodified: null,
          country: 42,
          iscurrent: 'false',
        }),
      ],
    },
    'VO',
  );
  assert.equal(row.fromDate, null);
  assert.equal(row.toDate, null);
  assert.equal(row.modifiedAt, null);
  assert.equal(row.country, null);
  assert.equal(row.isCurrent, false);
});

test('should reject the whole payload when it is not a feature collection', () => {
  assert.throws(() => normalizeGdacsFeatures({ message: 'nope' }, 'EQ'));
  assert.throws(() => normalizeGdacsFeatures(null, 'EQ'));
  assert.throws(() =>
    normalizeGdacsFeatures({ type: 'FeatureCollection', features: [] }, 'XX'),
  );
});

test('should build report links only on the GDACS origin when given an event', () => {
  assert.deepEqual(GDACS_EVENT_TYPES, ['EQ', 'TC', 'FL', 'VO', 'WF', 'DR']);
  assert.equal(
    gdacsReportUrl('EQ', 1570064, 1738371),
    'https://www.gdacs.org/report.aspx?eventid=1570064&episodeid=1738371&eventtype=EQ',
  );
});
