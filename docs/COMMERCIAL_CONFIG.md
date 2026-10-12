# Commercial configuration

Settings an operator of a commercial deployment sets for third-party terms
compliance. They live here instead of `.env.example`.

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
