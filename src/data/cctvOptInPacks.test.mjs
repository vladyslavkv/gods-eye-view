import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { createCctvCatalog } from '../../server/providers/cctv/catalog.js';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Packs without verifiable commercial terms: env switch → upstream host or cityId. */
const OPT_IN_PACKS = [
  { env: 'CCTV_TXDOT_ENABLED', host: 'its.txdot.gov' },
  { env: 'CCTV_TARKTEE_ENABLED', host: 'tarktee.transpordiamet.ee' },
  { env: 'CCTV_DELDOT_ENABLED', host: 'tmc.deldot.gov' },
  { env: 'CCTV_ONTARIO_ENABLED', host: '511on.ca' },
  { env: 'CCTV_CALTRANS_ENABLED', host: 'cwwp2.dot.ca.gov' },
];

const CCTV_ENV = [
  'CCTV_SOURCES_FILE',
  'CCTV_SOURCES_JSON',
  'CCTV_FORCE_AUSTIN',
  'CCTV_PREFER_AUSTIN',
  'CCTV_TALLINN_ENABLED',
  'CCTV_WARENDORF_ENABLED',
  ...OPT_IN_PACKS.map((pack) => pack.env),
];

/** Run one catalog refresh against a recording fetch that answers 503. */
async function refreshWith(t, env) {
  const saved = Object.fromEntries(CCTV_ENV.map((k) => [k, process.env[k]]));
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  for (const key of CCTV_ENV) delete process.env[key];
  Object.assign(process.env, env);
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'warn', () => {});
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (url) => {
    requested.push(String(url));
    return new Response('unavailable', { status: 503 });
  });
  const sources = await createCctvCatalog({ sourceRoot: REPO_ROOT })();
  return { hosts: requested.map((url) => new URL(url).hostname), sources };
}

for (const pack of OPT_IN_PACKS) {
  test(`should not contact ${pack.host} when ${pack.env} is unset`, async (t) => {
    const { hosts } = await refreshWith(t, {});
    assert.equal(hosts.includes(pack.host), false);
  });

  test(`should contact ${pack.host} when ${pack.env}=1`, async (t) => {
    const { hosts } = await refreshWith(t, { [pack.env]: '1' });
    assert.ok(hosts.includes(pack.host), `${pack.host} was asked`);
  });

  test(`should keep ${pack.host} off when ${pack.env} is anything but 1`, async (t) => {
    const { hosts } = await refreshWith(t, { [pack.env]: 'true' });
    assert.equal(hosts.includes(pack.host), false);
  });
}

test('should not register Tallinn cameras when CCTV_TALLINN_ENABLED is unset', async (t) => {
  const { sources } = await refreshWith(t, {});
  assert.deepEqual(
    sources.filter((source) => source.pack === 'tallinn'),
    [],
  );
});

test('should register Tallinn cameras when CCTV_TALLINN_ENABLED=1', async (t) => {
  const { sources } = await refreshWith(t, { CCTV_TALLINN_ENABLED: '1' });
  assert.ok(sources.some((source) => source.pack === 'tallinn'));
});

test('should never register a Warendorf camera even when its old switch is set', async (t) => {
  const { sources, hosts } = await refreshWith(t, {
    CCTV_WARENDORF_ENABLED: '1',
  });
  assert.equal(
    sources.some((source) => /warendorf/i.test(`${source.id} ${source.url}`)),
    false,
  );
  assert.equal(
    hosts.some((host) => host.includes('warendorf')),
    false,
  );
});
