import test from 'node:test';
import assert from 'node:assert/strict';
import { createBrowserViteConfig } from '../../build/vite.js';

test('should hand the browser the Esri licence flag only when the operator declares it', () => {
  assert.equal(
    createBrowserViteConfig({ esriImageryLicensed: true }).define[
      'import.meta.env.ESRI_IMAGERY_LICENSED'
    ],
    'true',
  );
  for (const declared of [false, undefined])
    assert.equal(
      'import.meta.env.ESRI_IMAGERY_LICENSED' in
        createBrowserViteConfig({ esriImageryLicensed: declared }).define,
      false,
    );
});

test('should read ESRI_IMAGERY_LICENSED as declared only when it is exactly 1', async () => {
  const { esriImageryLicensedFromEnv } = await import('../../build/vite.js');
  assert.equal(esriImageryLicensedFromEnv({ ESRI_IMAGERY_LICENSED: '1' }), true);
  for (const value of [undefined, '', '0', 'true', 'yes'])
    assert.equal(
      esriImageryLicensedFromEnv({ ESRI_IMAGERY_LICENSED: value }),
      false,
    );
});
