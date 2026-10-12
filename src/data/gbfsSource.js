/** Allowlisted GBFS hostnames; wildcard *.publicbikesystem.net also accepted. */
const GBFS_ALLOWED_HOSTS = new Set([
  'gbfs.lyft.com',
  'gbfs.bluebikes.com',
  'gbfs.bcycle.com',
  'gbfs.biketownpdx.com',
  'gbfs.cogobikeshare.com',
  'austin.publicbikesystem.net',
  'hon.publicbikesystem.net',
  'chat.publicbikesystem.net',
]);

/**
 * GBFS hosts whose published data terms cover commercial use: Lyft's
 * system-data policy (Bay Wheels, Citi Bike, Divvy, Capital Bikeshare,
 * Bluebikes) permits it, short of re-publishing the data stand-alone. Every
 * other allowlisted operator publishes no licence, so its feeds are served only
 * when the operator opts in (GBFS_UNLICENSED_FEEDS_ENABLED=1,
 * docs/COMMERCIAL_CONFIG.md).
 */
const GBFS_COMMERCIAL_HOSTS = new Set(['gbfs.lyft.com', 'gbfs.bluebikes.com']);

/**
 * Whether a GBFS host's terms cover commercial use without an opt-in.
 * @param {string} hostname
 * @returns {boolean}
 */
export function isCommerciallyLicensedGbfsHost(hostname) {
  return GBFS_COMMERCIAL_HOSTS.has(
    String(hostname || '')
      .trim()
      .toLowerCase(),
  );
}

/**
 * Check whether a hostname is in the GBFS allowlist.
 *
 * Also accepts any subdomain of publicbikesystem.net.
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isAllowedGbfsHost(hostname) {
  const host = String(hostname || '')
    .trim()
    .toLowerCase();
  if (!host) return false;
  if (GBFS_ALLOWED_HOSTS.has(host)) return true;
  return host.endsWith('.publicbikesystem.net');
}

/**
 * Only allow station_information.json and station_status.json endpoints.
 *
 * @param {string} pathname
 * @returns {boolean}
 */
export function isAllowedGbfsPath(pathname) {
  return /\/station_(information|status)\.json$/i.test(String(pathname || ''));
}

/**
 * Return an appropriate Cache-Control header for a GBFS endpoint.
 *
 * station_information is semi-static (5 min cache); station_status is
 * real-time (no-store).
 *
 * @param {string} pathname
 * @returns {string} Cache-Control header value.
 */
export function gbfsCacheControl(pathname) {
  if (/\/station_information\.json$/i.test(String(pathname || ''))) {
    return 'public, max-age=300';
  }
  return 'no-store';
}
