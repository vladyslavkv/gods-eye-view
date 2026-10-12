#!/usr/bin/env node
/**
 * Build src/data/local_data/osm_submarine_cables/ from OpenStreetMap.
 *
 * Source:   OpenStreetMap via the Overpass API (query: OSM_SUBMARINE_CABLE_QUERY
 *           in src/data/osmSubmarineCables.js)
 * Instance: https://maps.mail.ru/osm/tools/overpass/api/interpreter
 *           (overpass-api.de answered HTTP 406 to this client)
 * License:  Open Database License (ODbL) 1.0 — © OpenStreetMap contributors
 *
 * Transform (deterministic, see buildOsmSubmarineCableDataset):
 *   1. Cable ways → LineString; cable relations → their member ways.
 *   2. Douglas-Peucker per line at DEFAULT_TOLERANCE_DEG, 5-decimal rounding.
 *   3. Contact tags and free text carrying email/phone identifiers dropped.
 *   4. Landing points only from telecom=cable_landing_station elements.
 *   5. Features sorted by OSM type/id for a stable diff.
 *
 * Usage:
 *   node scripts/build-osm-submarine-cables.mjs [raw-overpass.json]
 * With no argument it queries Overpass (retrying with backoff while the
 * instance rate-limits); with an argument it rebuilds from a saved response.
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TOLERANCE_DEG,
  OSM_SUBMARINE_CABLE_QUERY,
  buildOsmSubmarineCableDataset,
} from '../src/data/osmSubmarineCables.js';

const OVERPASS_URL = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
const USER_AGENT =
  'gods-eye-view-data-build/1.0 (one-off submarine cable extract)';
const ATTEMPTS = 6;
const BACKOFF_MS = 15_000;
const OUT_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'data',
  'local_data',
  'osm_submarine_cables',
);

async function fetchOverpass() {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    console.log(`querying ${OVERPASS_URL} (attempt ${attempt}/${ATTEMPTS})`);
    try {
      const res = await fetch(OVERPASS_URL, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: OSM_SUBMARINE_CABLE_QUERY }),
      });
      const text = await res.text();
      if (res.ok && text.trimStart().startsWith('{')) return JSON.parse(text);
      console.warn(`Overpass HTTP ${res.status}: ${text.slice(0, 200)}`);
    } catch (error) {
      console.warn(`Overpass request failed: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS * attempt));
  }
  throw new Error(`Overpass did not answer after ${ATTEMPTS} attempts`);
}

function readme({ stats, cableBytes, landingBytes }) {
  const landing = stats.landingPoints
    ? `${stats.landingPoints} landing points (elements tagged \`telecom=cable_landing_station\`; a way contributes the centre Overpass reports for it)`
    : 'no landing points (OSM had no element tagged `telecom=cable_landing_station`)';
  return `# Submarine cables (OpenStreetMap)

© OpenStreetMap contributors. Licensed under the Open Database License (ODbL)
1.0 — https://opendatacommons.org/licenses/odbl/1-0/. This directory is a
derived database: keep the attribution and redistribute it (or any adaptation
of it) under ODbL.

Build script: \`scripts/build-osm-submarine-cables.mjs\` (transform in
\`src/data/osmSubmarineCables.js\`).

Overpass instance: ${OVERPASS_URL}

OSM base timestamp (\`osm3s.timestamp_osm_base\`): ${stats.timestamp}

Query:

\`\`\`
${OSM_SUBMARINE_CABLE_QUERY}
\`\`\`

Contents:

- \`cables.geojson\`: ${stats.cables} cable features (OSM ways and relations), ${cableBytes} bytes
- \`landing-points.geojson\`: ${landing}, ${landingBytes} bytes

Transform:

- Ways become LineStrings; relations become their member ways.
- Douglas-Peucker simplification per line at ${DEFAULT_TOLERANCE_DEG}° (~110 m
  at the equator); coordinates rounded to 5 decimals. Vertices:
  ${stats.inputVertices} → ${stats.outputVertices}.
- \`properties.id\` is \`<osm type>/<osm id>\`; every other property is an OSM
  tag as mapped. Facts OSM does not record (ready-for-service year, length,
  owners) are absent, never inferred.
- Privacy: \`contact:*\`, \`addr:*\`, \`email\`, \`phone\`, \`fax\` and \`mobile\`
  tags are dropped, as are \`note\`/\`description\`/\`comment\` values that
  contain an email address or phone number (the same transform as the dams
  snapshot).
- Landing points are never synthesized from cable geometry.
`;
}

async function main() {
  const raw = process.argv[2]
    ? JSON.parse(await readFile(process.argv[2], 'utf8'))
    : await fetchOverpass();
  const { cables, landingPoints, stats } = buildOsmSubmarineCableDataset(raw);
  const cableText = `${JSON.stringify(cables)}\n`;
  const landingText = `${JSON.stringify(landingPoints)}\n`;
  await writeFile(path.join(OUT_DIR, 'cables.geojson'), cableText);
  await writeFile(path.join(OUT_DIR, 'landing-points.geojson'), landingText);
  await writeFile(
    path.join(OUT_DIR, 'README.md'),
    readme({
      stats,
      cableBytes: Buffer.byteLength(cableText),
      landingBytes: Buffer.byteLength(landingText),
    }),
  );
  console.log(
    `wrote ${OUT_DIR}: ${stats.cables} cables, ${stats.landingPoints} landing points, ` +
      `${stats.inputVertices} → ${stats.outputVertices} vertices, OSM base ${stats.timestamp}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
