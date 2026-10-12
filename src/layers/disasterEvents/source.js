import { readResponseJsonCapped } from '../../sources/httpBody.js';
import { GDACS_ALERT_LEVELS, GDACS_EVENT_TYPES } from './records.js';

const RESPONSE_LIMIT = 4 * 1024 * 1024;
const REPORT_PREFIX = 'https://www.gdacs.org/report.aspx?';

const validEvent = (event) =>
  typeof event?.id === 'string' &&
  GDACS_EVENT_TYPES.includes(event.type) &&
  GDACS_ALERT_LEVELS.includes(event.alertLevel) &&
  typeof event.name === 'string' &&
  event.name.length > 0 &&
  Number.isFinite(event.lat) &&
  Number.isFinite(event.lon) &&
  Math.abs(event.lat) <= 90 &&
  Math.abs(event.lon) <= 180 &&
  typeof event.reportUrl === 'string' &&
  event.reportUrl.startsWith(REPORT_PREFIX);

/** Request the GDACS event snapshot through the bounded same-origin proxy. */
export function createGdacsEventSource({
  fetchImpl = (...args) => globalThis.fetch(...args),
} = {}) {
  return {
    async getSnapshot({ signal } = {}) {
      signal?.throwIfAborted();
      const response = await fetchImpl('/api/events', { signal });
      if (!response.ok) throw new Error(`GDACS HTTP ${response.status}`);
      const payload = await readResponseJsonCapped(
        response,
        RESPONSE_LIMIT,
        signal,
      );
      signal?.throwIfAborted();
      if (!Array.isArray(payload?.events) || !payload.events.every(validEvent))
        throw new Error('Malformed disaster events snapshot');
      return payload;
    },
  };
}
