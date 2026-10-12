import assert from 'node:assert/strict';
import test from 'node:test';
import { createDisasterEventsLayer } from './index.js';
import { eventRow } from './testDoubles.mjs';

const snapshot = (events, extra = {}) => ({
  stale: false,
  unavailable: false,
  fetchedAt: 1,
  events,
  ...extra,
});

function harness(source, { pick = () => null, cardHit = () => null } = {}) {
  const sources = [];
  const overlay = { entries: new Map(), visible: null };
  const clicks = { handler: null, destroyed: 0 };
  const owners = new Map();
  const opened = [];
  const viewer = {
    scene: { pick },
    dataSources: {
      add(value) {
        sources.push(value);
      },
      remove(value) {
        sources.splice(sources.indexOf(value), 1);
      },
    },
  };
  const layer = createDisasterEventsLayer({
    source,
    overlayHost: {
      setEntries(sourceId, entries) {
        overlay.entries.set(sourceId, entries);
      },
      setVisible(sourceId, visible) {
        overlay.visible = visible;
      },
      clearSource(sourceId) {
        overlay.entries.delete(sourceId);
      },
      hitTest: (x, y, options) => cardHit(x, y, options),
    },
    screenSpaceEventHandlerFactory: () => ({
      setInputAction(callback) {
        clicks.handler = callback;
      },
      destroy() {
        clicks.destroyed += 1;
        clicks.handler = null;
      },
    }),
    picking: {
      resolvePickId: (picked) => picked?.id ?? null,
      isOwnedByOtherLayer: (layerId, pickedId) =>
        String(pickedId).startsWith('other-layer:'),
      registerPickOwner: (layerId, predicate) => owners.set(layerId, predicate),
      unregisterPickOwner: (layerId) => owners.delete(layerId),
    },
    pointer: { isPointerFree: () => true },
    openExternal: (url) => opened.push(url),
  });
  layer.init(viewer);
  layer.enable(viewer);
  return { layer, viewer, sources, overlay, clicks, owners, opened };
}

const quake = eventRow({
  id: 'EQ-7',
  type: 'EQ',
  eventId: 7,
  name: 'Earthquake in Tonga',
  alertLevel: 'red',
  reportUrl:
    'https://www.gdacs.org/report.aspx?eventid=7&episodeid=1&eventtype=EQ',
});

test('should render one marker per event when the snapshot arrives', async () => {
  const h = harness({ getSnapshot: async () => snapshot([eventRow(), quake]) });
  assert.equal(h.layer.id, 'disaster-events');
  assert.equal(await h.layer.update(h.viewer), true);
  const entities = h.sources[0].entities.values;
  assert.deepEqual(
    entities.map((entity) => entity.id),
    ['disaster-event:VO-1000151', 'disaster-event:EQ-7'],
  );
  assert.ok(entities[0].point, 'marker point missing');
  const labels = h.overlay.entries.get('disaster-events-labels');
  assert.deepEqual(
    labels.map((entry) => [entry.id, entry.title, entry.variant]),
    [
      ['VO-1000151', 'VO', 'label'],
      ['EQ-7', 'EQ', 'label'],
    ],
  );
  assert.equal(
    entities[1].label,
    undefined,
    'world text belongs to the overlay host',
  );
  assert.ok(
    entities[1].point.pixelSize.getValue() >
      entities[0].point.pixelSize.getValue(),
    'red alerts must draw larger than orange',
  );
  assert.deepEqual(h.layer.getStats(), {
    count: 2,
    lastUpdate: h.layer.getStats().lastUpdate,
    error: null,
    stale: false,
  });
  assert.ok(h.owners.get('disaster-events')('disaster-event:EQ-7'));
});

test('should clear markers and report an error when GDACS is unavailable', async () => {
  let current = snapshot([quake]);
  const h = harness({ getSnapshot: async () => current });
  await h.layer.update(h.viewer);
  current = snapshot([], { unavailable: true, stale: true });
  assert.equal(await h.layer.update(h.viewer), false);
  assert.equal(h.sources[0].entities.values.length, 0);
  assert.equal(h.layer.getStats().count, 0);
  assert.equal(h.layer.getStats().error, 'Disaster events unavailable');
});

test('should flag stale data when the proxy serves its last good snapshot', async () => {
  const h = harness({
    getSnapshot: async () => snapshot([quake], { stale: true }),
  });
  assert.equal(await h.layer.update(h.viewer), true);
  assert.equal(h.layer.getStats().stale, true);
});

test('should publish a card on marker click and open GDACS from the card', async () => {
  let pickResult = { id: 'disaster-event:EQ-7' };
  let cardHitResult = null;
  const h = harness(
    { getSnapshot: async () => snapshot([quake]) },
    { pick: () => pickResult, cardHit: () => cardHitResult },
  );
  await h.layer.update(h.viewer);
  h.clicks.handler({ position: { x: 1, y: 1 } });
  const [card] = h.overlay.entries.get('disaster-events');
  assert.equal(card.title, 'EARTHQUAKE · Earthquake in Tonga');
  assert.ok(card.position, 'card must carry a world anchor');
  card.activate();
  assert.deepEqual(h.opened, [quake.reportUrl]);

  cardHitResult = { entryId: card.id };
  pickResult = null;
  h.clicks.handler({ position: { x: 2, y: 2 } });
  assert.equal(h.opened.length, 2);
  assert.equal(h.overlay.entries.get('disaster-events').length, 1);

  cardHitResult = null;
  pickResult = { id: 'other-layer:aircraft-1' };
  h.clicks.handler({ position: { x: 3, y: 3 } });
  assert.equal(h.overlay.entries.get('disaster-events').length, 1);

  pickResult = null;
  h.clicks.handler({ position: { x: 4, y: 4 } });
  assert.equal(h.overlay.entries.get('disaster-events')?.length ?? 0, 0);
});

test('should drop the card when a refresh no longer carries the selected event', async () => {
  let events = [quake];
  const h = harness(
    { getSnapshot: async () => snapshot(events) },
    { pick: () => ({ id: 'disaster-event:EQ-7' }) },
  );
  await h.layer.update(h.viewer);
  h.clicks.handler({ position: { x: 1, y: 1 } });
  events = [eventRow()];
  await h.layer.update(h.viewer);
  assert.equal(h.overlay.entries.get('disaster-events')?.length ?? 0, 0);
});

test('should release click handling, ownership and card when disabled', async () => {
  const h = harness(
    { getSnapshot: async () => snapshot([quake]) },
    { pick: () => ({ id: 'disaster-event:EQ-7' }) },
  );
  await h.layer.update(h.viewer);
  h.clicks.handler({ position: { x: 1, y: 1 } });
  h.layer.disable(h.viewer);
  assert.equal(h.clicks.destroyed, 1);
  assert.equal(h.owners.has('disaster-events'), false);
  assert.equal(h.overlay.entries.has('disaster-events'), false);
  assert.equal(h.overlay.entries.has('disaster-events-labels'), false);
  assert.deepEqual(h.layer.getAnalystRecords(), []);
});

test('should not publish a late refresh after disable or destroy', async () => {
  for (const action of ['disable', 'destroy']) {
    let resolve, signal;
    const h = harness({
      getSnapshot(options) {
        signal = options.signal;
        return new Promise((done) => {
          resolve = done;
        });
      },
    });
    const pending = h.layer.update(h.viewer);
    h.layer[action](h.viewer);
    assert.equal(signal.aborted, true);
    resolve(snapshot([quake]));
    assert.equal(await pending, false);
    assert.equal(h.layer.getStats().count, 0);
    if (action === 'disable') h.layer.destroy(h.viewer);
  }
});

test('should expose analyst records and an alert legend when events are loaded', async () => {
  const h = harness({ getSnapshot: async () => snapshot([eventRow(), quake]) });
  await h.layer.update(h.viewer);
  assert.deepEqual(h.layer.getAnalystRecords(1), [
    {
      id: 'VO-1000151',
      type: 'VO',
      typeLabel: 'Volcano',
      name: 'Eruption Taal',
      alertLevel: 'orange',
      country: 'Philippines',
      severity: null,
      isCurrent: true,
      fromTime: Date.parse('2026-10-08T10:29:00.000Z'),
      toTime: Date.parse('2026-10-08T10:29:00.000Z'),
      reportUrl: eventRow().reportUrl,
      lat: 14.0106,
      lon: 120.9975,
    },
  ]);
  const { legend } = h.layer.getRowControls();
  assert.deepEqual(
    legend.map(({ label, count }) => [label, count]),
    [
      ['Red alert', 1],
      ['Orange alert', 1],
      ['Green alert', 0],
    ],
  );
});
