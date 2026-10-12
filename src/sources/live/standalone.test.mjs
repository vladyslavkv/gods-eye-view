import test from 'node:test';
import assert from 'node:assert/strict';
import { createFlightSource } from './standalone.js';

const disabled = {
  found: false,
  disabled: true,
  reason: 'not licensed for commercial use in this build',
};

test('should ask the server once when adsbdb enrichment is disabled', async () => {
  const urls = [];
  const source = createFlightSource({
    fetchImpl: async (url) => {
      urls.push(url);
      return Response.json(disabled);
    },
  });
  assert.deepEqual(
    await source.getEnrichment({ kind: 'type', id: 'abc123' }),
    disabled,
  );
  assert.deepEqual(
    await source.getEnrichment({ kind: 'type', id: 'def456' }),
    disabled,
  );
  assert.deepEqual(urls, ['/api/adsbdb/type/abc123']);
});

test('should refuse a route lookup when one is requested', async () => {
  const source = createFlightSource({
    fetchImpl: async () => assert.fail('no request'),
  });
  await assert.rejects(
    source.getEnrichment({ kind: 'route', id: 'UAL123' }),
    (error) => error.code === 'unsupported',
  );
});
