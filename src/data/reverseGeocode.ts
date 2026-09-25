import type { Point } from '../types';

interface GeocodingConfig {
  provider: 'nominatim';
  endpoint: string;
  enabled: boolean;
}

interface NominatimResponse {
  display_name?: string;
  address?: Record<string, string | undefined>;
}

interface CacheEntry {
  label: string;
  savedAt: number;
}

const DEFAULT_CONFIG: GeocodingConfig = {
  provider: 'nominatim',
  endpoint: 'https://nominatim.openstreetmap.org/reverse',
  enabled: true,
};

const CACHE_KEY = 'sokak:reverse-geocode:v1';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;
const MIN_REQUEST_INTERVAL_MS = 1100;

let configPromise: Promise<GeocodingConfig> | null = null;
let requestQueue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function clean(value?: string): string {
  return value?.trim() ?? '';
}

function first(...values: Array<string | undefined>): string {
  return values.map(clean).find(Boolean) ?? '';
}

function uniqueParts(parts: string[]): string[] {
  const seen = new Set<string>();
  return parts.filter((part) => {
    const normalized = part.toLocaleLowerCase('tr-TR');
    if (!part || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

export function formatNominatimAddress(payload: NominatimResponse): string {
  const address = payload.address ?? {};
  const road = first(
    address.road,
    address.pedestrian,
    address.footway,
    address.cycleway,
    address.path,
  );
  const houseNumber = clean(address.house_number);
  const street = road ? `${road}${houseNumber ? ` ${houseNumber}` : ''}` : '';

  const neighbourhood = first(
    address.neighbourhood,
    address.quarter,
    address.suburb,
    address.city_district,
    address.district,
    address.village,
    address.hamlet,
  );

  const city = first(
    address.city,
    address.town,
    address.municipality,
    address.county,
  );

  const preferred = uniqueParts([neighbourhood, street, city]);
  if (preferred.length >= 2) return preferred.slice(0, 2).join(' · ');
  if (preferred.length === 1) return preferred[0];

  const displayParts = (payload.display_name ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  return uniqueParts(displayParts).slice(0, 2).join(' · ');
}

function coordinateKey(point: Point): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(([, entry]) =>
        typeof entry?.label === 'string' &&
        typeof entry?.savedAt === 'number' &&
        now - entry.savedAt < CACHE_TTL_MS
      ),
    );
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, CacheEntry>): void {
  try {
    const entries = Object.entries(cache)
      .sort((a, b) => b[1].savedAt - a[1].savedAt)
      .slice(0, MAX_CACHE_ENTRIES);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Reverse geocoding still works when browser storage is unavailable.
  }
}

async function loadConfig(): Promise<GeocodingConfig> {
  if (!configPromise) {
    configPromise = fetch(`${import.meta.env.BASE_URL}geocoding-config.json`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Geocoding config unavailable');
        const config = await response.json() as Partial<GeocodingConfig>;
        if (config.provider !== 'nominatim' || typeof config.endpoint !== 'string') {
          throw new Error('Unsupported geocoding config');
        }
        return {
          provider: 'nominatim',
          endpoint: config.endpoint,
          enabled: config.enabled !== false,
        } satisfies GeocodingConfig;
      })
      .catch(() => DEFAULT_CONFIG);
  }
  return configPromise;
}

function queueRequest<T>(work: () => Promise<T>): Promise<T> {
  const run = async () => {
    const elapsed = Date.now() - lastRequestAt;
    const wait = Math.max(0, MIN_REQUEST_INTERVAL_MS - elapsed);
    if (wait > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, wait));
    }

    try {
      return await work();
    } finally {
      lastRequestAt = Date.now();
    }
  };

  const result = requestQueue.then(run, run);
  requestQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function reverseGeocode(point: Point): Promise<string | null> {
  const key = coordinateKey(point);
  const cache = readCache();
  const cached = cache[key];
  if (cached) return cached.label;

  const config = await loadConfig();
  if (!config.enabled) return null;

  return queueRequest(async () => {
    const latestCache = readCache();
    if (latestCache[key]) return latestCache[key].label;

    const url = new URL(config.endpoint);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(point.lat));
    url.searchParams.set('lon', String(point.lng));
    url.searchParams.set('zoom', '18');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('layer', 'address');
    url.searchParams.set('accept-language', 'tr');

    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      referrerPolicy: 'strict-origin-when-cross-origin',
    });

    if (!response.ok) {
      throw new Error(`Adres servisi yanıt vermedi (${response.status}).`);
    }

    const payload = await response.json() as NominatimResponse;
    const label = formatNominatimAddress(payload);
    if (!label) return null;

    latestCache[key] = { label, savedAt: Date.now() };
    writeCache(latestCache);
    return label;
  });
}
