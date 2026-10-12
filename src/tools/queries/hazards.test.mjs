import assert from 'node:assert/strict';
import test from 'node:test';
import { composeCatalog, coreTools } from '../index.js';
import { eventRow } from '../../layers/disasterEvents/testDoubles.mjs';

const quake = eventRow({
  id: 'EQ-7',
  type: 'EQ',
  eventId: 7,
  name: 'Earthquake in Tonga',
  alertLevel: 'red',
  country: 'Tonga',
  severity: 'Magnitude 7.1M, Depth:10km',
  lat: -21.2,
  lon: -175.2,
  modifiedAt: '2026-10-12T05:00:00.000Z',
  reportUrl:
    'https://www.gdacs.org/report.aspx?eventid=7&episodeid=1&eventtype=EQ',
});
const flood = eventRow({
  id: 'FL-9',
  type: 'FL',
  eventId: 9,
  name: 'Flood in Nepal',
  alertLevel: 'green',
  country: 'Nepal',
  lat: 27.99,
  lon: 84.63,
  reportUrl:
    'https://www.gdacs.org/report.aspx?eventid=9&episodeid=1&eventtype=FL',
});
const disasters = (events, extra = {}) => ({
  async getSnapshot() {
    return {
      source: 'GDACS',
      attribution: 'GDACS, European Commission Joint Research Centre',
      fetchedAt: Date.parse('2026-10-12T06:00:00.000Z'),
      stale: false,
      unavailable: false,
      events,
      ...extra,
    };
  },
});
const call = (services, args = {}) =>
  composeCatalog({ tools: coreTools, services }).call(
    'get_disaster_events',
    args,
  );

test('should list current events most severe first when no filter is given', async () => {
  const result = await call({
    disasters: disasters([flood, eventRow(), quake]),
  });
  assert.equal(
    result.summary,
    '3 GDACS disaster events worldwide; most severe: Red earthquake Earthquake in Tonga (Tonga).',
  );
  assert.deepEqual(
    result.data.rows.map((row) => row.id),
    ['EQ-7', 'VO-1000151', 'FL-9'],
  );
  assert.deepEqual(result.data.rows[0], {
    id: 'EQ-7',
    type: 'EQ',
    type_label: 'Earthquake',
    name: 'Earthquake in Tonga',
    alert_level: 'red',
    country: 'Tonga',
    severity: 'Magnitude 7.1M, Depth:10km',
    from: '2026-10-08T10:29:00.000Z',
    to: '2026-10-08T10:29:00.000Z',
    current: true,
    lat: -21.2,
    lon: -175.2,
    report_url: quake.reportUrl,
  });
  assert.deepEqual(result.data.view.layers, ['disaster-events']);
  assert.equal(result.data.stale, false);
  assert.match(result.data.attribution, /Joint Research Centre/);
});

test('should filter by type, minimum alert and area when asked', async () => {
  const services = { disasters: disasters([flood, eventRow(), quake]) };
  const floods = await call(services, { types: ['FL'] });
  assert.deepEqual(
    floods.data.rows.map((row) => row.id),
    ['FL-9'],
  );
  const severe = await call(services, { min_alert: 'orange' });
  assert.deepEqual(
    severe.data.rows.map((row) => row.id),
    ['EQ-7', 'VO-1000151'],
  );
  const asia = await call(services, { area: { bbox: [60, 0, 130, 40] } });
  assert.deepEqual(
    asia.data.rows.map((row) => row.id),
    ['VO-1000151', 'FL-9'],
  );
  assert.match(asia.summary, /^2 GDACS disaster events in the requested box/);
  const none = await call(services, { types: ['DR'] });
  assert.equal(none.summary, '0 GDACS disaster events worldwide.');
});

test('should fail as unavailable when GDACS cannot be reached', async () => {
  await assert.rejects(
    call({ disasters: disasters([], { unavailable: true, stale: true }) }),
    (error) => error.code === 'unavailable',
  );
});

test('should say the data may be stale when the proxy serves a cached snapshot', async () => {
  const result = await call({
    disasters: disasters([quake], { stale: true }),
  });
  assert.match(result.summary, /\(data may be stale\)\.$/);
  assert.equal(result.data.stale, true);
});

test('should add a disaster alerts section to the situation brief when GDACS is available', async () => {
  const weather = {
    getConditions: async () => ({ status: 'ready', weather: null }),
  };
  const result = await composeCatalog({
    tools: coreTools,
    services: { weather, disasters: disasters([flood, quake]) },
  }).call('situation_brief', { area: { bbox: [80, 20, 90, 30] } });
  assert.equal(result.data.sections.disasters.data.rows[0].id, 'FL-9');
  assert.ok(result.data.view.layers.includes('disaster-events'));
});
