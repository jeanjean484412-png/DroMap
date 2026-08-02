import { NextRequest, NextResponse } from "next/server";

const NOMINATIM_SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const MIN_REQUEST_INTERVAL_MS = 1_100;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const MAX_CACHE_ENTRIES = 200;
const REQUEST_TIMEOUT_MS = 10_000;

type CachedSearch = {
  expiresAt: number;
  payload: PlaceSearchResponse;
};

type NominatimSearchResult = {
  place_id?: number | string;
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: string[];
  category?: string;
  type?: string;
  addresstype?: string;
  importance?: number;
  licence?: string;
  address?: {
    country_code?: string;
  };
};

type PlaceSearchResult = {
  id: string;
  displayName: string;
  lat: number;
  lng: number;
  bounds: {
    south: number;
    west: number;
    north: number;
    east: number;
  } | null;
  category: string;
  type: string;
  importance: number | null;
  countryCode: string;
};

type PlaceSearchResponse = {
  results: PlaceSearchResult[];
  attribution: string;
};

const responseCache = new Map<string, CachedSearch>();
let requestQueue: Promise<void> = Promise.resolve();
let nextAllowedRequestAt = 0;

function normalizeQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseFiniteNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBounds(value: unknown): PlaceSearchResult["bounds"] {
  if (!Array.isArray(value) || value.length < 4) {
    return null;
  }

  const south = parseFiniteNumber(value[0]);
  const north = parseFiniteNumber(value[1]);
  const west = parseFiniteNumber(value[2]);
  const east = parseFiniteNumber(value[3]);

  if (south === null || north === null || west === null || east === null) {
    return null;
  }

  return {
    south: Math.min(south, north),
    west: Math.min(west, east),
    north: Math.max(south, north),
    east: Math.max(west, east),
  };
}

function normalizeResult(
  value: NominatimSearchResult,
  index: number,
): PlaceSearchResult | null {
  const lat = parseFiniteNumber(value.lat);
  const lng = parseFiniteNumber(value.lon);
  const displayName = String(value.display_name ?? "").trim();

  if (lat === null || lng === null || !displayName) {
    return null;
  }

  return {
    id: String(value.place_id ?? `${lat}-${lng}-${index}`),
    displayName,
    lat,
    lng,
    bounds: parseBounds(value.boundingbox),
    category: String(value.category ?? ""),
    type: String(value.addresstype ?? value.type ?? ""),
    importance: parseFiniteNumber(value.importance),
    countryCode: String(value.address?.country_code ?? "")
      .trim()
      .toLowerCase(),
  };
}

function readCachedResponse(cacheKey: string) {
  const cached = responseCache.get(cacheKey);

  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    responseCache.delete(cacheKey);
    return null;
  }

  return cached.payload;
}

function writeCachedResponse(cacheKey: string, payload: PlaceSearchResponse) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value as string | undefined;

    if (oldestKey) {
      responseCache.delete(oldestKey);
    }
  }

  responseCache.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });
}

async function waitForPublicServiceSlot() {
  const waitMs = Math.max(0, nextAllowedRequestAt - Date.now());

  if (waitMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, waitMs));
  }

  nextAllowedRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS;
}

async function runSerialized<T>(task: () => Promise<T>) {
  let releaseQueue: () => void = () => undefined;
  const previousQueue = requestQueue;
  requestQueue = new Promise<void>((resolve) => {
    releaseQueue = resolve;
  });

  await previousQueue;

  try {
    await waitForPublicServiceSlot();
    return await task();
  } finally {
    releaseQueue();
  }
}

async function fetchNominatimResults(
  query: string,
  acceptLanguage: string,
): Promise<PlaceSearchResponse> {
  const url = new URL(NOMINATIM_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "8");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", acceptLanguage);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": acceptLanguage,
        "User-Agent": "DroMap/1.0 place-search",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned ${response.status}`);
    }

    const rawResults = (await response.json()) as NominatimSearchResult[];
    const results = Array.isArray(rawResults)
      ? rawResults
          .map((result, index) => normalizeResult(result, index))
          .filter((result): result is PlaceSearchResult => result !== null)
      : [];

    return {
      results,
      attribution: "Données © contributeurs OpenStreetMap · recherche Nominatim",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET(request: NextRequest) {
  const query = normalizeQuery(request.nextUrl.searchParams.get("q") ?? "");

  if (query.length < 2) {
    return NextResponse.json(
      { error: "Saisis au moins deux caractères." },
      { status: 400 },
    );
  }

  if (query.length > 160) {
    return NextResponse.json(
      { error: "La recherche est trop longue." },
      { status: 400 },
    );
  }

  const requestedLanguage = request.headers.get("accept-language") ?? "fr";
  const acceptLanguage = requestedLanguage.slice(0, 80) || "fr";
  const cacheKey = `${acceptLanguage.toLowerCase()}::${query.toLowerCase()}`;
  const cached = readCachedResponse(cacheKey);

  if (cached) {
    return NextResponse.json(cached, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  }

  try {
    const payload = await runSerialized(() =>
      fetchNominatimResults(query, acceptLanguage),
    );
    writeCachedResponse(cacheKey, payload);

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Le service de recherche a mis trop de temps à répondre."
        : "Le service de recherche de lieux est momentanément indisponible.";

    return NextResponse.json({ error: message }, { status: 503 });
  }
}
