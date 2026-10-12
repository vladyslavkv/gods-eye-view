const MAX_ARTICLES = 5;

function cleanText(value, maxLength = 180) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function safeHttpUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/** Normalize a Nominatim reverse-geocode response into cockpit-sized place context. */
export function normalizeRegionalPlace(payload) {
  const address = payload?.address || {};
  const locality = cleanText(
    address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.hamlet ||
      address.county,
    90,
  );
  const region = cleanText(
    address.state || address.region || address.county,
    90,
  );
  const country = cleanText(address.country, 90);
  const label =
    [locality, region]
      .filter(
        (value, index, values) => value && values.indexOf(value) === index,
      )
      .join(', ') ||
    country ||
    cleanText(payload?.display_name, 120);
  if (!label) return null;
  return {
    label,
    locality: locality || null,
    region: region || null,
    country: country || null,
    countryCode: cleanText(address.country_code, 4).toUpperCase() || null,
  };
}

/** Normalize and deduplicate GDELT ArticleList output without trusting article HTML. */
export function normalizeRegionalArticles(payload, limit = MAX_ARTICLES) {
  const rows = Array.isArray(payload?.articles) ? payload.articles : [];
  const seen = new Set();
  const articles = [];
  for (const row of rows) {
    const url = safeHttpUrl(row?.url || row?.url_mobile);
    const title = cleanText(row?.title, 180);
    if (!url || !title) continue;
    const signature = `${title.toLowerCase()}|${new URL(url).hostname}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    const rawDate = cleanText(row?.seendate, 32);
    const compactDate = /^(\d{8})T(\d{6})Z$/.exec(rawDate);
    const publishedAt = compactDate
      ? `${compactDate[1].slice(0, 4)}-${compactDate[1].slice(4, 6)}-${compactDate[1].slice(6, 8)}T${compactDate[2].slice(0, 2)}:${compactDate[2].slice(2, 4)}:${compactDate[2].slice(4, 6)}Z`
      : Number.isNaN(Date.parse(rawDate))
        ? null
        : new Date(rawDate).toISOString();
    articles.push({
      title,
      url,
      domain: cleanText(
        row?.domain || new URL(url).hostname.replace(/^www\./, ''),
        80,
      ),
      publishedAt,
      sourceCountry: cleanText(row?.sourcecountry, 60) || null,
    });
    if (articles.length >= Math.max(1, Math.min(MAX_ARTICLES, limit))) break;
  }
  return articles;
}

/**
 * MET Norway Locationforecast `symbol_code` base names → [WMO effect family,
 * plain condition]. The WMO code only selects the cockpit label and the visual
 * effect family (clear/cloud/fog/rain/snow/storm); it is not a WMO report.
 * Sleet has no WMO family of its own and renders as rain. The two "lights…"
 * spellings are MET Norway's own codes.
 */
export const MET_SYMBOLS = Object.freeze({
  clearsky: [0, 'clear sky'],
  fair: [1, 'fair'],
  partlycloudy: [2, 'partly cloudy'],
  cloudy: [3, 'cloudy'],
  fog: [45, 'fog'],
  lightrain: [61, 'light rain'],
  rain: [63, 'rain'],
  heavyrain: [65, 'heavy rain'],
  lightsleet: [61, 'light sleet'],
  sleet: [63, 'sleet'],
  heavysleet: [65, 'heavy sleet'],
  lightsnow: [71, 'light snow'],
  snow: [73, 'snow'],
  heavysnow: [75, 'heavy snow'],
  lightrainshowers: [80, 'light rain showers'],
  rainshowers: [81, 'rain showers'],
  heavyrainshowers: [82, 'heavy rain showers'],
  lightsleetshowers: [80, 'light sleet showers'],
  sleetshowers: [81, 'sleet showers'],
  heavysleetshowers: [82, 'heavy sleet showers'],
  lightsnowshowers: [85, 'light snow showers'],
  snowshowers: [86, 'snow showers'],
  heavysnowshowers: [86, 'heavy snow showers'],
  lightrainandthunder: [95, 'light rain and thunder'],
  rainandthunder: [95, 'rain and thunder'],
  heavyrainandthunder: [95, 'heavy rain and thunder'],
  lightsleetandthunder: [95, 'light sleet and thunder'],
  sleetandthunder: [95, 'sleet and thunder'],
  heavysleetandthunder: [95, 'heavy sleet and thunder'],
  lightsnowandthunder: [95, 'light snow and thunder'],
  snowandthunder: [95, 'snow and thunder'],
  heavysnowandthunder: [95, 'heavy snow and thunder'],
  lightrainshowersandthunder: [95, 'light rain showers and thunder'],
  rainshowersandthunder: [95, 'rain showers and thunder'],
  heavyrainshowersandthunder: [95, 'heavy rain showers and thunder'],
  lightssleetshowersandthunder: [95, 'light sleet showers and thunder'],
  sleetshowersandthunder: [95, 'sleet showers and thunder'],
  heavysleetshowersandthunder: [95, 'heavy sleet showers and thunder'],
  lightssnowshowersandthunder: [95, 'light snow showers and thunder'],
  snowshowersandthunder: [95, 'snow showers and thunder'],
  heavysnowshowersandthunder: [95, 'heavy snow showers and thunder'],
});

/** Resolve a MET Norway symbol (with or without its _day/_night/_polartwilight variant). */
export function metSymbol(symbolCode) {
  const base = String(symbolCode ?? '').replace(
    /_(day|night|polartwilight)$/,
    '',
  );
  const entry = Object.hasOwn(MET_SYMBOLS, base) ? MET_SYMBOLS[base] : null;
  return entry ? { weatherCode: entry[0], condition: entry[1] } : null;
}

const HOUR_MS = 3600_000;

/**
 * Pick the MET Norway Locationforecast entry for the current hour and
 * normalize it into a small source-stamped record. This is a short-range model
 * forecast, not an observation. The source has no visibility; it stays null.
 */
export function normalizeRegionalWeather(payload, nowMs = Date.now()) {
  const timeseries = payload?.properties?.timeseries;
  if (!Array.isArray(timeseries)) return null;
  const entry = timeseries.find((row) => {
    const start = Date.parse(row?.time);
    return start <= nowMs && nowMs < start + HOUR_MS;
  });
  const details = entry?.data?.instant?.details;
  const numberOrNull = (value) => {
    if (value === null || value === undefined || value === '') return null;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };
  if (numberOrNull(details?.air_temperature) === null) return null;
  const nextHour = entry.data.next_1_hours;
  const symbolCode = nextHour?.summary?.symbol_code ?? null;
  const symbol = metSymbol(symbolCode);
  const windMs = numberOrNull(details.wind_speed);
  const updatedAt = Date.parse(payload.properties.meta?.updated_at);
  return {
    validAt: new Date(entry.time).toISOString(),
    forecastUpdatedAt: Number.isNaN(updatedAt)
      ? null
      : new Date(updatedAt).toISOString(),
    symbolCode: symbol ? symbolCode : null,
    condition: symbol?.condition ?? null,
    weatherCode: symbol?.weatherCode ?? null,
    temperatureC: numberOrNull(details.air_temperature),
    apparentTemperatureC: numberOrNull(details.apparent_air_temperature),
    precipitationMm: numberOrNull(nextHour?.details?.precipitation_amount),
    cloudCoverPct: numberOrNull(details.cloud_area_fraction),
    windKph: windMs === null ? null : Math.round(windMs * 3.6 * 10) / 10,
    windDirectionDeg: numberOrNull(details.wind_from_direction),
    visibilityM: null,
  };
}

/** Translate the WMO effect-family code (from a MET Norway symbol) into concise cockpit copy. */
export function weatherCodeLabel(code) {
  const value = Number(code);
  if (!Number.isFinite(value)) return 'CONDITIONS UNKNOWN';
  if (value === 0) return 'CLEAR';
  if ([1, 2].includes(value)) return 'PARTLY CLOUDY';
  if (value === 3) return 'OVERCAST';
  if ([45, 48].includes(value)) return 'FOG';
  if (value >= 51 && value <= 57) return 'DRIZZLE';
  if (value >= 61 && value <= 67) return 'RAIN';
  if (value >= 71 && value <= 77) return 'SNOW';
  if (value >= 80 && value <= 82) return 'RAIN SHOWERS';
  if (value >= 85 && value <= 86) return 'SNOW SHOWERS';
  if (value >= 95) return 'THUNDERSTORM';
  return 'MIXED CONDITIONS';
}

/** Great-circle distance used to avoid refetching a regional brief every animation frame. */
export function regionalDistanceM(from, to) {
  if (
    ![from?.latitude, from?.longitude, to?.latitude, to?.longitude].every(
      Number.isFinite,
    )
  ) {
    return Infinity;
  }
  const phi1 = (from.latitude * Math.PI) / 180;
  const phi2 = (to.latitude * Math.PI) / 180;
  const deltaPhi = ((to.latitude - from.latitude) * Math.PI) / 180;
  const deltaLambda = ((to.longitude - from.longitude) * Math.PI) / 180;
  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
