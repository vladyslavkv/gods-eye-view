# Submarine cables (OpenStreetMap)

© OpenStreetMap contributors. Licensed under the Open Database License (ODbL)
1.0 — https://opendatacommons.org/licenses/odbl/1-0/. This directory is a
derived database: keep the attribution and redistribute it (or any adaptation
of it) under ODbL.

Build script: `scripts/build-osm-submarine-cables.mjs` (transform in
`src/data/osmSubmarineCables.js`).

Overpass instance: https://maps.mail.ru/osm/tools/overpass/api/interpreter

OSM base timestamp (`osm3s.timestamp_osm_base`): 2026-10-12T06:09:51Z

Query:

```
[out:json][timeout:300];
(
way["communication"="line"]["submarine"="yes"];
relation["communication"="line"]["submarine"="yes"];
way["communication"="line"]["location"~"^(underwater|submarine)$"];
relation["communication"="line"]["location"~"^(underwater|submarine)$"];
way["telecom"="line"]["location"~"^(underwater|submarine)$"];
relation["telecom"="line"]["location"~"^(underwater|submarine)$"];
);
out tags geom;
nwr["telecom"="cable_landing_station"];
out tags center;
```

Contents:

- `cables.geojson`: 909 cable features (OSM ways and relations), 595455 bytes
- `landing-points.geojson`: 58 landing points (elements tagged `telecom=cable_landing_station`; a way contributes the centre Overpass reports for it), 18824 bytes

Transform:

- Ways become LineStrings; relations become their member ways.
- Douglas-Peucker simplification per line at 0.001° (~110 m
  at the equator); coordinates rounded to 5 decimals. Vertices:
  39328 → 16114.
- `properties.id` is `<osm type>/<osm id>`; every other property is an OSM
  tag as mapped. Facts OSM does not record (ready-for-service year, length,
  owners) are absent, never inferred.
- Privacy: `contact:*`, `addr:*`, `email`, `phone`, `fax` and `mobile`
  tags are dropped, as are `note`/`description`/`comment` values that
  contain an email address or phone number (the same transform as the dams
  snapshot).
- Landing points are never synthesized from cable geometry.
