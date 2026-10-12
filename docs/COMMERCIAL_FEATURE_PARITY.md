# Commercial feature parity

Every user-facing feature of upstream God's Eye View
([bilawalsidhu/gods-eye-view](https://github.com/bilawalsidhu/gods-eye-view) `main`
@ `591f299`, fetched 2026-10-11 — the fork's base, with no newer upstream
commits), the data source behind it in this fork, that source's licence for
commercial use, and its status here. Licence pages were fetched 2026-10-11/12;
the quotes and conditions live in [DATA_SOURCES.md](../DATA_SOURCES.md), and the
opt-in switches in [COMMERCIAL_CONFIG.md](COMMERCIAL_CONFIG.md).

Classes: **OK** = commercial use permitted; **OK+C** = permitted with conditions
(listed); **NC** = non-commercial; **UNCLEAR** = no terms could be verified.
A source that is NC or UNCLEAR is never on by default.

## Layers

| Feature (upstream layer id) | Source in this fork | Class / conditions | Citation | Status | Plan / commit |
| --- | --- | --- | --- | --- | --- |
| Flights (`flights`) | adsb.lol v2 (250 nm around the view; worldwide callsign/ICAO lookup) | OK+C: ODbL attribution + share-alike on derived DBs; operator asked to contact adsb.lol for production; future feeder key | [adsb.lol licence](https://adsb.lol/privacy-license/), [api README](https://github.com/adsblol/api) | Present, **degraded**: upstream's worldwide snapshot came from OpenSky (NC, removed). No commercially licensed global snapshot exists: adsb.lol has none, adsb.fi and airplanes.live are NC | Leave regional; a paid feed would be needed for global |
| Military flights (`military`) | adsb.lol `/v2/mil` | OK+C (ODbL) | as above | Present | — |
| Aircraft type/registration enrichment | adsb.lol `t`/`r` fields; adsbdb opt-in | adsb.lol ODbL; adsbdb aircraft data UNCLEAR (PlaneBase, no licence) | [adsbdb README](https://github.com/mrjackwills/adsbdb) | Present (adsb.lol fields); adsbdb opt-in `ADSBDB_ENABLED=1` | `4b66b4f` |
| Flight routes (origin/destination) | — | adsbdb route data NC ("may not be copied, published… without the explicit permission of David J Taylor") | adsbdb README | **Not possible** — no commercially licensed free route source found; removed | `4b66b4f` |
| Local ADS-B (`local-adsb`) | Operator's own receiver | Own data | — | Present | — |
| Vessels (`ais-live-vessels`) | Fintraffic Digitraffic Marine AIS (Baltic); AISStream opt-in | Digitraffic OK+C: CC BY 4.0 attribution. AISStream UNCLEAR (no ToS, `/terms` 404) | [Digitraffic terms](https://www.digitraffic.fi/en/terms-of-service/) | **Restored** keyless, Baltic coverage only by default; worldwide AISStream with `AISSTREAM_API_KEY` + `AISSTREAM_COMMERCIAL_OK=1`. Kystverket (NLOD) is licence-OK but only reachable via raw TCP or registered API — not added | `184a4f5`, `4545249` |
| Satellites (`satellites`) | CelesTrak GP | OK+C: download once per update; citation | [CelesTrak usage policy](https://celestrak.org/usage-policy.php) | Present | — |
| Space missions (`rocket-launches`) | The Space Devs LL2 | OK+C: add value; 15 req/h keyless | [TSD FAQ](https://github.com/TheSpaceDevs/Tutorials/blob/main/faqs/faq_TSD.md) | Present | — |
| Earthquakes (`earthquakes`) | USGS | OK (US public domain) | [USGS copyrights](https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits) | Present | — |
| Active fires (`local-firms`) | NASA FIRMS | OK+C: MAP_KEY, cite FIRMS, no endorsement | [FIRMS FAQ](https://www.earthdata.nasa.gov/data/tools/firms/faq) | Present | — |
| Fire perimeters (`fire-perimeters`) | NIFC WFIGS + InciWeb links | OK (US federal works, 17 U.S.C. §105) | [doi.gov copyright](https://www.doi.gov/copyright), [17 U.S.C. §105](https://www.law.cornell.edu/uscode/text/17/105) | Present | `85dcbb2` (basis documented) |
| Cyclones (`weather-cyclones`) | NOAA NHC/CPHC | OK+C: don't present modified data as official | [NHC disclaimer](https://www.nhc.noaa.gov/disclaimer.shtml) | Present | — |
| Radar / satellite clouds / lightning (`weather-radar`, `weather-satellite`, `weather-lightning`) | NOAA nowCOAST | OK (US federal works); lightning = NOAA derived product only | [NWS disclaimer](https://www.weather.gov/disclaimer), [lightning PDD](https://ocean.weather.gov/lightning/lightning_pdd.php) | Present | `85dcbb2` (basis documented) |
| Wind (`wind`) | NOAA GFS; ECMWF Open Data | GFS OK; ECMWF OK+C (CC BY 4.0) | [NODD](https://registry.opendata.aws/noaa-gfs-bdp-pds/), [ECMWF open data](https://www.ecmwf.int/en/forecasts/datasets/open-data) | Present | — |
| Traffic (`traffic`) | Simulation; TomTom BYOK | TomTom free tier = evaluation only; paid tier needed for commercial use | [TomTom terms](https://docs.tomtom.com/legal/terms-and-conditions) | Present (simulation keyless; TomTom with operator's paid key) | — |
| Transit (`transit`) | MBTA, CapMetro, OVapi, Entur, TransLink QLD, HSL; Metro Transit opt-in | OK+C per operator (CC BY 4.0 / NLOD / developer licences); Metro Transit UNCLEAR | DATA_SOURCES.md transit rows | Present; Metro Transit opt-in `TRANSIT_METROTRANSIT_ENABLED=1` | `e00bfe0` |
| Bikeshare (`bikeshare`) | Lyft-run GBFS; unlicensed feeds opt-in | Lyft OK+C (no stand-alone re-publishing); Biketown/CoGo/BCycle/PBSC UNCLEAR | [Citi Bike data policy](https://citibikenyc.com/data-sharing-policy) | Present; unlicensed feeds opt-in `GBFS_UNLICENSED_FEEDS_ENABLED=1` | `7d4ec83` |
| CCTV (`cctv`) | Austin, NSW, TfL, Fintraffic, DriveBC, Calgary, Statens vegvesen by default | OK / OK+C (attribution per jurisdiction) | DATA_SOURCES.md CCTV rows | Present. Warendorf (all rights reserved) **removed**; TxDOT, Tallinn, DelDOT (no terms), Tarktee and Ontario 511 (need key/token), Caltrans (≥10 streams need agreement) opt-in | `b00379c` |
| ALPR cameras (`alpr-cameras`) | OpenStreetMap extract | OK+C (ODbL) | [OSM copyright](https://www.openstreetmap.org/copyright) | Present | — |
| Radio (`radio`) | Radio Browser | OK ("Data license: public domain") | [api.radio-browser.info](https://api.radio-browser.info) | Present | `85dcbb2` (licence text fixed) |
| Street Level (`street-level`) | Mapillary (operator token) | OK+C, narrow: CC BY-SA imagery; commercial use limited to the purposes in §12 | [Mapillary terms](https://www.mapillary.com/terms) | Present (BYOK); operator must confirm their use fits §12 | — |
| Recent imagery (`recent-imagery`) | NASA GIBS + CMR (HLS, VIIRS) | OK+C: GIBS acknowledgement | [GIBS docs](https://nasa-gibs.github.io/gibs-api-docs/), [Earthdata data use](https://www.earthdata.nasa.gov/engage/open-data-services-software-policies/data-use-guidance) | Present | — |
| Directions (`directions`) | Operator OSRM (`OSRM_BASE_URL`) | FOSSGIS public OSRM: commercial use only if not an essential part of the offer | [FOSSGIS Nutzungsbedingungen](https://www.fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen/) | Present when `OSRM_BASE_URL` is set; otherwise reports routing unavailable | `122d811`, `4e4b8be` |
| Military installations (`military-installations`) | OpenFreeMap / Overture / OSM | OK+C (ODbL) | [OpenFreeMap](https://openfreemap.org), [Overture attribution](https://docs.overturemaps.org/attribution/) | Present | — |
| Datacenters, dams (`local-datacenters`, `local-dams`) | OSM / OpenInfraMap extracts | OK+C (ODbL) | OSM copyright | Present | — |
| Submarine cables (`telegeography-submarine-cables` → `submarine-cables`) | OSM extract: 909 cables, 58 landing stations | OK+C (ODbL; one-off Overpass extract) | OSM copyright, [Overpass commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html) | **Restored** (TeleGeography CC BY-NC-SA never returns). Fewer named cables and no RFS/length/owner fields — OSM does not carry them. Old share token `u` stays retired; new token `3` | `206228e` |
| Disaster events (upstream `bhote-koshi-2026` + locator) | GDACS event list | OK+C: CC BY 4.0 via EC legal notice; credit + changes indicated; no GDACS logo | [GDACS terms](https://www.gdacs.org/About/termofuse.aspx), [EC legal notice](https://commission.europa.eu/legal-notice_en#copyright-notice) | **Restored as a live layer** `disaster-events` + `get_disaster_events` (token `4`). The Bhote Koshi pack itself (CC BY-NC imagery) is **not possible** | `b497138`, `c98606d` |
| Nepal scene pack / director recipes | — | Built on the CC BY-NC Bhote Koshi data | — | **Not possible** — event-specific narrative with no commercially licensed equivalent | — |
| Military awareness (`military-awareness`) | Derived from the layers above | — | — | Present | — |

## Globe, cockpit and voice services

| Feature | Source in this fork | Class / conditions | Status | Commit |
| --- | --- | --- | --- | --- |
| Keyless basemap | NASA GIBS Blue Marble (shaded relief + bathymetry) | OK+C: GIBS acknowledgement; no NASA endorsement | **Replaced** Esri World Imagery (needs an ArcGIS subscription — [tou_summary.pdf](https://www.esri.com/content/dam/arcgisonline/docs/tou_summary.pdf)); Esri opt-in `ESRI_IMAGERY_LICENSED=1`. Max ~500 m/px | `13492c3`, `ab04797` |
| Photorealistic 3D globe, Places | Google Maps Platform (operator key) | OK+C: no caching, Maps End User Terms, no use near a non-Google map | Present (BYOK) | — |
| Keyless terrain | Re:Earth / Mapterhorn | Data CC BY 4.0; hosted service terms UNCLEAR | Opt-in `REEARTH_TERRAIN_ENABLED=1`; default flat / EGM96 | `f95aebf` |
| Place search | Google → Nominatim; Photon opt-in | Nominatim OK+C (1 req/s, identify, cache); Photon UNCLEAR | Present; Photon opt-in `PHOTON_ENABLED=1` | `34ff551` |
| Cockpit regional news | GDELT DOC 2.0 | OK+C: cite and link GDELT ([terms](https://www.gdeltproject.org/about.html#termsofuse)) | Present; Google News RSS (NC) stays removed | — |
| Cockpit local weather + weather effects | MET Norway Locationforecast 2.0 | OK+C: NLOD 2.0 / CC BY 4.0; identifying User-Agent; honour Expires; ≤4 decimals ([licence](https://api.met.no/doc/License), [ToS](https://api.met.no/doc/TermsOfService)) | **Replaced** Open-Meteo free API (NC: "You may only use the free API services for non-commercial purposes"); labelled as current-hour forecast | `5261a7c` |

## Integration

Merged on `integrate/parity` and pushed to `main`; the merge-only fix
`47a8af9` teaches the cable layer the `blue-marble` stack and gives the
`scenes` package ownership of `src/maps/imageryComparison.js`.

## Open items

- `.env.example` (held by another session's uncommitted work) still lists the
  old CCTV defaults and `CCTV_WARENDORF_ENABLED`; the authoritative list is
  [COMMERCIAL_CONFIG.md](COMMERCIAL_CONFIG.md).
- `MET_NORWAY_USER_AGENT` must name the operator's product and contact before a
  public deployment.
- TomTom's 120 s shared proxy cache may conflict with TomTom §11.4 on any tier.
- Credits of opt-in sources still list in the Data attribution popover when the
  source is off.
- `src/data/trafficTiming.test.mjs` "traffic timing pairs real ordering…" fails
  on `main` before and after this work.
