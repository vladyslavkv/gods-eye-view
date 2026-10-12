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
