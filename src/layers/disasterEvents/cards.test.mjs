import test from 'node:test';
import assert from 'node:assert/strict';
import { alertAccent, buildEventCard, EVENT_TYPE_LABELS } from './cards.js';
import { eventRow } from './testDoubles.mjs';

test('should name every GDACS type when labelling markers', () => {
  assert.deepEqual(EVENT_TYPE_LABELS, {
    EQ: 'Earthquake',
    TC: 'Tropical cyclone',
    FL: 'Flood',
    VO: 'Volcano',
    WF: 'Wildfire',
    DR: 'Drought',
  });
});

test('should colour by alert level when given a GDACS alert', () => {
  assert.notEqual(alertAccent('green'), alertAccent('orange'));
  assert.notEqual(alertAccent('orange'), alertAccent('red'));
  assert.equal(alertAccent('unknown'), alertAccent('green'));
});

test('should show name, type, alert, country, dates and the GDACS link when an event is selected', () => {
  const card = buildEventCard(
    eventRow({
      severity: 'Magnitude 5.5M, Depth:10km',
      toDate: '2026-10-09T01:00:00.000Z',
    }),
  );
  assert.equal(card.id, 'disaster-event-card:VO-1000151');
  assert.equal(card.title, 'VOLCANO · Eruption Taal');
  assert.deepEqual(card.details, [
    'Orange alert · Philippines',
    'Magnitude 5.5M, Depth:10km',
    '2026-10-08 10:29 UTC → 2026-10-09 01:00 UTC',
    'GDACS report ↗ · click card to open',
  ]);
  assert.equal(card.accent, alertAccent('orange'));
  assert.equal(card.selected, true);
  assert.equal(card.interactive, true);
  assert.match(card.accessibilityLabel, /GDACS/);
});

test('should omit unknown lines when the event lacks country, severity or dates', () => {
  const card = buildEventCard(
    eventRow({
      country: null,
      fromDate: null,
      toDate: null,
      alertLevel: 'red',
      isCurrent: false,
    }),
  );
  assert.deepEqual(card.details, [
    'Red alert · past event',
    'GDACS report ↗ · click card to open',
  ]);
});
