# Commercial configuration

This fork is used inside a commercial product. Sources whose terms exclude
commercial use were removed (see [DATA_SOURCES.md — Removed in this fork](../DATA_SOURCES.md#removed-in-this-fork)).
The sections below cover the sources that remain in the code but are not
on by default.

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
