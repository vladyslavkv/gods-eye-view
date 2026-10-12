/** A GDACS MAP-endpoint feature shaped like the live payload (2026-10-12). */
export const gdacsFeature = (overrides = {}, geometry = null) => ({
  type: 'Feature',
  geometry: geometry ?? { type: 'Point', coordinates: [120.9975, 14.0106] },
  properties: {
    eventtype: 'VO',
    eventid: 1000151,
    episodeid: 1,
    name: 'Eruption  Taal',
    description: 'Eruption  Taal',
    alertlevel: 'Orange',
    iscurrent: 'true',
    country: 'Philippines',
    fromdate: '2026-10-08T10:29:00',
    todate: '2026-10-08T10:29:00',
    datemodified: '2026-10-08T13:02:20',
    Class: 'Point_Centroid',
    severitydata: { severity: 0, severitytext: '', severityunit: '' },
    url: { report: 'https://evil.example/report' },
    ...overrides,
  },
});

/** A normalized event row as the proxy serves it. */
export const eventRow = (overrides = {}) => ({
  id: 'VO-1000151',
  type: 'VO',
  eventId: 1000151,
  episodeId: 1,
  name: 'Eruption Taal',
  alertLevel: 'orange',
  country: 'Philippines',
  fromDate: '2026-10-08T10:29:00.000Z',
  toDate: '2026-10-08T10:29:00.000Z',
  modifiedAt: '2026-10-08T13:02:20.000Z',
  severity: null,
  isCurrent: true,
  lat: 14.0106,
  lon: 120.9975,
  reportUrl:
    'https://www.gdacs.org/report.aspx?eventid=1000151&episodeid=1&eventtype=VO',
  ...overrides,
});
