import { createOptInSources } from '../../sources/optInSources.js';

/** Read a GBFS station document through the existing bounded server proxy. */
export function createBikeshareSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  const optIn = createOptInSources({ fetchImpl });
  return {
    /** Whether the server opted in to feeds without published commercial terms. */
    unlicensedFeedsEnabled: () => optIn('gbfs-unlicensed'),
    async getStations(upstreamUrl, { signal } = {}) {
      const url = new URL(upstreamUrl);
      if (url.protocol !== 'https:' || url.username || url.password || url.hash)
        throw new TypeError('A public HTTPS GBFS URL is required');
      signal?.throwIfAborted();
      const response = await fetchImpl(
        '/api/gbfs/' + encodeURIComponent(url.href),
        { method: 'GET', headers: { Accept: 'application/json' }, signal },
      );
      if (!response.ok) throw new Error('GBFS HTTP ' + response.status);
      const payload = await response.json();
      signal?.throwIfAborted();
      if (!payload || typeof payload !== 'object')
        throw new Error('Malformed GBFS payload');
      return payload;
    },
  };
}
