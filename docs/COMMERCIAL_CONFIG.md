# Commercial configuration

Environment switches that decide which third-party sources this commercial fork
may contact. Licences and attribution for every source are in
[DATA_SOURCES.md](../DATA_SOURCES.md). Keys and identities an operator sets live here instead of `.env.example`.

## MET Norway weather (`MET_NORWAY_USER_AGENT`)

Cockpit local weather and cockpit weather effects use the keyless MET Norway
Locationforecast 2.0 API (NLOD 2.0 / CC BY 4.0, commercial use permitted).
Its [Terms of Service](https://api.met.no/doc/TermsOfService) require every
request to carry an identifying User-Agent with the application name and a
company email address or website; anonymous, fake or random agents are
throttled or banned.

```
MET_NORWAY_USER_AGENT="yourproduct.example/1.0 support@yourproduct.example"
```

Unset, the server sends the upstream project's identity
(`gods-eye-view/0.1 (+https://github.com/bilawalsidhu/gods-eye-view)`), which
names that project rather than your deployment — set your own before going
live. Read once at server start.

Other obligations already handled in code (`server/providers/regional/weather.js`):
coordinates sent with one decimal (limit: four), no request before `Expires`,
`If-Modified-Since` revalidation, server-side proxy only (no browser-to-API
calls). Traffic above 20 requests/second for the whole application needs a
separate agreement with MET Norway.

## Vessels (AIS)

| Variable | Default | Effect |
| --- | --- | --- |
| _(none)_ | — | Vessels come from Fintraffic Digitraffic Marine AIS: keyless, [CC BY 4.0](https://www.digitraffic.fi/en/terms-of-service/), Finland and the Baltic Sea. Nothing to configure. |
| `AISSTREAM_API_KEY` | unset | AISStream key. **On its own it does nothing.** |
| `AISSTREAM_COMMERCIAL_OK` | unset | Set to exactly `1`, together with `AISSTREAM_API_KEY`, to add AISStream's worldwide websocket feed alongside Digitraffic. |

Why AISStream is opt-in: AISStream.io publishes no terms of service
(`https://aisstream.io/terms` and `https://aisstream.io/tos` return 404,
checked 2026-10-12), and requests for commercial permission have gone
unanswered. Its licence for commercial use is therefore **unclear**, so this
fork never contacts it by default. Set `AISSTREAM_COMMERCIAL_OK=1` only after
you have your own written permission from AISStream or have accepted the risk.

With AISStream on, `/api/vessels` answers with `X-Feed-Source: AISStream +
Digitraffic`, AISStream's socket health leads the feed status, and each vessel
row names its own `source`. Without it, the header reads `Digitraffic` and an
empty but current Digitraffic poll is reported as complete coverage.

Pinokio launches do not forward `AISSTREAM_COMMERCIAL_OK`, so AISStream stays
off there.

## Opt-in sources

These sources publish no terms, or no terms that can be verified to cover
commercial use, or terms that require a key or agreement this keyless app does
not hold. A licence audit (fetched 2026-10-11) classified each one. Each
stays **off** unless its environment variable is set to exactly `1` on the
server. Any other value, including `true`, leaves it off. Set a variable only
after you have cleared that source's terms for your own deployment.

A source that is off shows as **"disabled — not licensed for commercial use in
this build"**, or as routing/terrain unavailable. It is not reported as an
error. The server reads these variables from its own environment. A value in
`.env` takes effect after a restart. CCTV packs pick up a change when the
catalog next refreshes, within 15 minutes. The browser learns the ones it
needs from `GET /api/opt-in-sources`, which returns booleans only. If that
request fails, the browser treats every source as off.

| Source | Variable | Default | Why it is opt-in | When it is off |
| --- | --- | --- | --- | --- |
| adsbdb aircraft enrichment (`api.adsbdb.com`) | `ADSBDB_ENABLED` | off | Type/registration come from PlaneBase. [adsbdb](https://www.adsbdb.com) publishes no licence for that data or for the service. | `/api/adsbdb/type/<hex>` answers `{found:false, disabled:true}` without calling upstream. Flights keep the type (`t`) and registration (`r`) that adsb.lol (ODbL 1.0) reports, so the type display and the 3D models still work. |
| TxDOT ITS cameras (`its.txdot.gov`) | `CCTV_TXDOT_ENABLED` | off | No licence found for the camera data. | Pack not loaded. |
| City of Tallinn ristmikud cameras (`ristmikud.tallinn.ee`) | `CCTV_TALLINN_ENABLED` | off | No terms published. | Pack not loaded. |
| DelDOT live video (`tmc.deldot.gov`, `video.deldot.gov`) | `CCTV_DELDOT_ENABLED` | off | No terms published. | Pack not loaded. |
| Transpordiamet / Tarktee road cameras (`tarktee.transpordiamet.ee`) | `CCTV_TARKTEE_ENABLED` | off | The data licence requires registration and an API key, and this app is keyless. | Pack not loaded. |
| Ontario 511 cameras (`511on.ca`) | `CCTV_ONTARIO_ENABLED` | off | API use requires applying for an access token, which this app does not hold. | Pack not loaded. |
| Caltrans cameras (`cwwp2.dot.ca.gov`) | `CCTV_CALTRANS_ENABLED` (new; `CCTV_CALTRANS_DISTRICTS` still picks districts) | off | Bulk streaming of 10 or more streams requires a written agreement with Caltrans. | Pack not loaded. |
| Photon public instance (`photon.komoot.io`) | `PHOTON_ENABLED` | off | The [public instance](https://photon.komoot.io) publishes a fair-use policy only. It says nothing about commercial use. | Place search goes from Google (when a key is set) to the local Nominatim route (`/api/geocode`). A Photon endpoint that the composer configures itself (`endpoints.photon`) is always used. |
| OSRM routing | `OSRM_BASE_URL` | none | FOSSGIS's [Nutzungsbedingungen](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) say: "Die gewerbliche Nutzung ist nur gestattet, wenn die Nutzung der Dienste keinen wesentlichen Teil eines Onlineangebots darstellt" (commercial use is allowed only when the service is not a substantial part of an online offering). | `/api/route` answers `{ok:false, unavailable:true}`, and the Directions layer reports that routing is unavailable. Point `OSRM_BASE_URL` at your own or a commercially licensed OSRM. `{profile}` becomes `foot`, `car` or `bike`, for example `https://osrm.example.com/routed-{profile}`. To use the FOSSGIS servers under their terms, set it explicitly to `https://routing.openstreetmap.de/routed-{profile}`. |
| Re:Earth Terrain hosted service (`terrain.reearth.land`) | `REEARTH_TERRAIN_ENABLED` | off | [The hosted service](https://terrain.reearth.land) publishes no service terms. Only the data licence (CC BY 4.0) is published. | Keyless globe stacks use the flat ellipsoid. `/api/terrain/heights` answers 503 `disabled`, and entity heights come from the bundled EGM96 geoid. |
| Metro Transit realtime vehicles (`svc.metrotransit.org`) | `TRANSIT_METROTRANSIT_ENABLED` | off | No licence found for the realtime feed. The public-domain statement covers only the companion schedule dataset. | The feed is not served or polled. In its region the Transit row reads "Metro Transit disabled — not licensed for commercial use in this build". |
| GBFS feeds without a licence: BIKETOWN, CoGo, BCycle (all `gbfs.bcycle.com` systems, including Indego and LA Metro Bike), PBSC (Austin, Chattanooga, Honolulu) | `GBFS_UNLICENSED_FEEDS_ENABLED` | off | No licence found. | The proxy refuses them with 403 `disabled`. The Bikeshare row and `get_bike_share` name the system as disabled. |

These stay on by default:

- **Lyft-run GBFS feeds** (Bay Wheels, Citi Bike, Divvy, Capital Bikeshare, Bluebikes). Lyft's data-sharing policy permits commercial use, but not re-publishing the data on its own.
- **InciWeb** and **NOAA nowCOAST.** Both are U.S. federal government works, in the public domain under [17 U.S.C. §105](https://www.law.cornell.edu/uscode/text/17/105).

Removed outright, with no switch:

- **Stadt Warendorf webcam.** The [Impressum](https://www.warendorf.de/de/impressum) says "Alle Rechte vorbehalten… ohne schriftliche Genehmigung" (all rights reserved; no use without written permission).
- **adsbdb flight-route lookups.** The route data "may not be copied, published, or incorporated into other databases without the explicit permission of David J Taylor".

Document these variables here rather than in `.env.example`.

## Basemap: `ESRI_IMAGERY_LICENSED`

| Value | Effect |
| --- | --- |
| unset (default), or anything other than `1` | The keyless landing basemap is **NASA Blue Marble** via NASA GIBS (public domain). The **Esri Satellite** tile is hidden from the MAP SOURCE row, and any other route to it (a share link, the `set_map_stack` voice tool) is refused with the reason "Esri World Imagery needs Esri software or an ArcGIS Online subscription; set ESRI_IMAGERY_LICENSED=1 once licensed". No Esri tile is requested. The Recent Imagery comparison globe is Blue Marble. |
| `1` | Esri World Imagery is offered as the **Esri Satellite** map stack (the MAP SOURCE row then shows six tiles in two rows of three) and becomes the Recent Imagery comparison globe. The keyless landing basemap stays Blue Marble. |

Why it is off by default: Esri's terms-of-use summary for its ArcGIS Online
items says "If you do not have Esri software, you must purchase an ArcGIS
Online subscription"
([tou_summary.pdf](https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf),
linked from the World Imagery item). Set the flag only when your deployment
holds Esri software or an ArcGIS Online subscription that covers this use.

How it reaches the browser: like the map keys (`GOOGLE_MAPS_API_KEY`,
`CESIUM_ION_TOKEN`), the server reads it from the environment or the dotenv
files when it starts (`npm run dev` / `npm run preview`) or when the bundle is
built (`npm run build`), and hands it to the page through Vite's `define`
(`build/vite.js`). Restart the server, or rebuild, after changing it. Only the
exact value `1` counts.
