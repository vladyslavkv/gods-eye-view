/**
 * Ask the server once which default-off sources its operator opted in to
 * (`/api/opt-in-sources`). Any failure — no server, an error, a malformed
 * body — reads as "none", the answer that keeps unlicensed sources off.
 * @param {{fetchImpl?: typeof fetch}} [options]
 * @returns {(name: string) => Promise<boolean>}
 */
export function createOptInSources({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  let pending = null;
  return async (name) => {
    pending ??= Promise.resolve()
      .then(() =>
        fetchImpl('/api/opt-in-sources', {
          headers: { Accept: 'application/json' },
        }),
      )
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => body?.sources ?? {})
      .catch(() => ({}));
    return (await pending)[name] === true;
  };
}
