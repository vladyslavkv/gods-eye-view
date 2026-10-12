/** Card and marker styling for one GDACS disaster event. Pure — no Cesium types. */

import { EVENT_TYPE_LABELS } from './records.js';
export { EVENT_TYPE_LABELS } from './records.js';

export const DISASTER_EVENTS_OVERLAY_SOURCE_ID = 'disaster-events';

const ALERT_ACCENTS = Object.freeze({
  green: '#3fb950',
  orange: '#ff9500',
  red: '#ff3b30',
});

/** CSS colour for a GDACS alert level (green when unknown). */
export function alertAccent(alertLevel) {
  return ALERT_ACCENTS[alertLevel] ?? ALERT_ACCENTS.green;
}

const stamp = (iso) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

function dateLine({ fromDate, toDate }) {
  if (fromDate && toDate && fromDate !== toDate)
    return `${stamp(fromDate)} → ${stamp(toDate)}`;
  const only = fromDate || toDate;
  return only ? stamp(only) : null;
}

/**
 * Build the overlay-host entry for one selected event. The caller supplies
 * `position` (Cartesian) — this model stays JSON-safe for tests.
 */
export function buildEventCard(event) {
  const alert = `${event.alertLevel[0].toUpperCase()}${event.alertLevel.slice(1)} alert`;
  const place = event.country ?? (event.isCurrent ? null : 'past event');
  const details = [[alert, place].filter(Boolean).join(' · ')];
  if (event.severity) details.push(event.severity);
  const dates = dateLine(event);
  if (dates) details.push(dates);
  details.push('GDACS report ↗ · click card to open');
  const title = `${EVENT_TYPE_LABELS[event.type].toUpperCase()} · ${event.name}`;
  return {
    id: `disaster-event-card:${event.id}`,
    selected: true,
    interactive: true,
    accessibilityLabel: `Open ${title} on GDACS`,
    title,
    details,
    accent: alertAccent(event.alertLevel),
    priority: Number.MAX_SAFE_INTEGER,
    gapPx: 15,
    verticalOnly: true,
    placement: 'above',
  };
}
