import test from 'node:test';
import assert from 'node:assert/strict';
import { createOptInSources } from './optInSources.js';
import {
  BROWSER_OPT_IN_SOURCES,
  optInSourcesEndpoint,
} from '../../server/providers/optInSources.js';

function serve(env) {
  let handler;
  optInSourcesEndpoint().configureServer({
    middlewares: { use: (_route, fn) => (handler = fn) },
  });
  const saved = { ...process.env };
  for (const name of Object.values(BROWSER_OPT_IN_SOURCES))
    delete process.env[name];
  Object.assign(process.env, env);
  const res = {
    writeHead(status) {
      this.status = status;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  handler({ method: 'GET', url: '/' }, res);
  for (const key of Object.keys(process.env))
    if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  return res;
}

test('should report every browser opt-in source off when no env enables it', () => {
  assert.deepEqual(serve({}).body, {
    sources: {
      photon: false,
      'reearth-terrain': false,
      'gbfs-unlicensed': false,
    },
  });
});

test('should report a source on only when its env variable is exactly 1', () => {
  const {
    body: { sources },
  } = serve({
    PHOTON_ENABLED: '1',
    REEARTH_TERRAIN_ENABLED: 'true',
  });
  assert.equal(sources.photon, true);
  assert.equal(sources['reearth-terrain'], false);
});

test('should read opt-ins once and answer per source name', async () => {
  let calls = 0;
  const enabled = createOptInSources({
    fetchImpl: async () => {
      calls += 1;
      return Response.json({ sources: { photon: true } });
    },
  });
  assert.equal(await enabled('photon'), true);
  assert.equal(await enabled('reearth-terrain'), false);
  assert.equal(calls, 1);
});

test('should treat an unreachable server as no opt-ins when the request fails', async () => {
  const enabled = createOptInSources({
    fetchImpl: async () => {
      throw new TypeError('Failed to fetch');
    },
  });
  assert.equal(await enabled('photon'), false);
});
