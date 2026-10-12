import test from 'node:test';
import assert from 'node:assert/strict';
import { createViewport } from './viewport.js';
import { createModel } from './model.js';

const PORTLAND = { lat: 45.5152, lon: -122.6784 };
const SAN_FRANCISCO = { lat: 37.7749, lon: -122.4194 };

function viewport(unlicensedFeedsEnabled) {
  const state = { _unlicensedFeedsEnabled: unlicensedFeedsEnabled };
  const parts = {};
  parts.model = createModel({ state, services: {}, parts });
  return {
    state,
    view: createViewport({
      state,
      services: { render: { governorRequestRender() {} } },
      parts,
      source: {},
    }),
  };
}

test('should not load an unlicensed bikeshare system when unlicensed feeds are not opted in', () => {
  const { state, view } = viewport(false);
  assert.deepEqual([...view.computeInRangeCities(PORTLAND)], []);
  assert.deepEqual(state._unlicensedInRange, ['BIKETOWN']);
});

test('should load an unlicensed bikeshare system when the server opts in', () => {
  const { state, view } = viewport(true);
  assert.deepEqual(
    [...view.computeInRangeCities(PORTLAND)],
    ['portland-biketown'],
  );
  assert.deepEqual(state._unlicensedInRange, []);
});

test('should load a Lyft-run system without any opt-in', () => {
  const { view } = viewport(false);
  assert.ok(view.computeInRangeCities(SAN_FRANCISCO).has('sf-bay-wheels'));
});
