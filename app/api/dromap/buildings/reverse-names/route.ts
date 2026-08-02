import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse";
const MAX_POINTS_PER_REQUEST = 20;
const MIN_DELAY_MS = 1_100;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_RESULT_DISTANCE_METERS = 140;

type ReverseNamePoint = {
  id: string;
  lat: number;
  lng: number;
};

type NominatimReverseResult = {
  lat?: unknown;
  lon?: unknown;
  name?: unknown;
  display_name?: unknown;
  category?: unknown;
  type?: unknown;
  namedetails?: unknown;
  extratags?: unknown;
  address?: unknown;
  error?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown) {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isGenericOrAddressLikeName(value: string) {
  const normalized = normalizeComparable(value);
  if (!normalized) return true;
  const generic = new Set([
    "batiment",
    "building",
    "indifferencie",
    "commercial",
    "industriel",
    "residentiel",
    "agricole",
    "sans nom",
    "unknown",
  ]);
  if (generic.has(normalized)) return true;
  if (/^\d+[a-z]?\s/.test(normalized)) return true;
  return false;
}

function getRecordStrings(value: unknown) {
  if (!isRecord(value)) return {} as Record<string, string>;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    const text = normalizeText(entry);
    if (text) result[key] = text;
  }
  return result;
}

const LATIN_LETTER_PATTERN = /\p{Script=Latin}/u;
const CYRILLIC_LETTER_PATTERN = /\p{Script=Cyrillic}/u;
const LETTER_PATTERN = /\p{L}/u;

function getScriptPriority(value: string) {
  let hasLetter = false;
  let hasLatin = false;
  let hasCyrillic = false;
  let hasUnsupportedLetter = false;

  for (const character of value) {
    if (!LETTER_PATTERN.test(character)) continue;
    hasLetter = true;
    if (LATIN_LETTER_PATTERN.test(character)) hasLatin = true;
    else if (CYRILLIC_LETTER_PATTERN.test(character)) hasCyrillic = true;
    else hasUnsupportedLetter = true;
  }

  if (!hasLetter || hasUnsupportedLetter) return -1;
  if (hasLatin) return 300;
  if (hasCyrillic) return 200;
  return -1;
}

function getLocalizedKeyPriority(key: string) {
  const normalized = key.toLocaleLowerCase("fr");
  if (normalized.endsWith(":fr") || normalized.endsWith("_fr")) return 1_400;
  if (
    normalized === "int_name" ||
    normalized.includes("latin") ||
    normalized.includes("latn") ||
    normalized.includes("translit")
  ) {
    return 1_050;
  }
  if (normalized.endsWith(":en") || normalized.endsWith("_en")) return 900;
  if (normalized === "official_name") return 180;
  if (normalized === "name") return 160;
  if (normalized === "short_name") return 140;
  if (normalized === "alt_name" || normalized === "loc_name") return 100;
  if (normalized === "brand") return 70;
  if (normalized === "operator") return 60;
  return 0;
}

function extractBestName(payload: NominatimReverseResult) {
  const namedetails = getRecordStrings(payload.namedetails);
  const extratags = getRecordStrings(payload.extratags);
  const candidates: Array<{
    value: string;
    key: string;
    sourcePriority: number;
    order: number;
  }> = [];

  let order = 0;
  for (const [key, value] of Object.entries(namedetails)) {
    candidates.push({ value, key, sourcePriority: 90, order: order++ });
  }

  const directName = normalizeText(payload.name);
  if (directName) {
    candidates.push({
      value: directName,
      key: "name",
      sourcePriority: 60,
      order: order++,
    });
  }

  for (const [key, value] of Object.entries(extratags)) {
    candidates.push({ value, key, sourcePriority: 30, order: order++ });
  }

  const selected = candidates
    .filter((candidate) => !isGenericOrAddressLikeName(candidate.value))
    .map((candidate) => ({
      ...candidate,
      scriptPriority: getScriptPriority(candidate.value),
    }))
    .filter((candidate) => candidate.scriptPriority >= 0)
    .map((candidate) => ({
      ...candidate,
      score:
        getLocalizedKeyPriority(candidate.key) +
        candidate.scriptPriority +
        candidate.sourcePriority,
    }))
    .sort(
      (first, second) =>
        second.score - first.score || first.order - second.order,
    )[0];

  return selected?.value ?? null;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceMeters(
  first: { lat: number; lng: number },
  second: { lat: number; lng: number },
) {
  const radius = 6_371_000;
  const dLat = toRadians(second.lat - first.lat);
  const dLng = toRadians(second.lng - first.lng);
  const lat1 = toRadians(first.lat);
  const lat2 = toRadians(second.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parsePoints(payload: unknown) {
  if (!isRecord(payload) || !Array.isArray(payload.points)) {
    return [] as ReverseNamePoint[];
  }
  const result: ReverseNamePoint[] = [];
  const seen = new Set<string>();
  for (const rawPoint of payload.points) {
    if (!isRecord(rawPoint)) continue;
    const id = normalizeText(rawPoint.id);
    const lat = parseFiniteNumber(rawPoint.lat);
    const lng = parseFiniteNumber(rawPoint.lng);
    if (
      !id ||
      seen.has(id) ||
      lat === null ||
      lng === null ||
      lat < -85.05112878 ||
      lat > 85.05112878 ||
      lng < -180 ||
      lng > 180
    ) {
      continue;
    }
    seen.add(id);
    result.push({ id, lat, lng });
    if (result.length >= MAX_POINTS_PER_REQUEST) break;
  }
  return result;
}

async function reverseLookup(point: ReverseNamePoint) {
  const url = new URL(NOMINATIM_REVERSE_URL);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("namedetails", "1");
  url.searchParams.set("extratags", "1");
  url.searchParams.set("accept-language", "fr,en,ru");
  const contactEmail = process.env.NOMINATIM_CONTACT_EMAIL?.trim();
  if (contactEmail) url.searchParams.set("email", contactEmail);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "fr,en;q=0.8,ru;q=0.6",
        "User-Agent": "DroMap/1.0 optional-building-name-reverse-lookup",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as NominatimReverseResult;
    if (payload.error) return null;

    const name = extractBestName(payload);
    const resultLat = parseFiniteNumber(payload.lat);
    const resultLng = parseFiniteNumber(payload.lon);
    if (!name || resultLat === null || resultLng === null) return null;

    const distance = distanceMeters(point, {
      lat: resultLat,
      lng: resultLng,
    });
    if (distance > MAX_RESULT_DISTANCE_METERS) return null;

    const category = normalizeText(payload.category);
    const type = normalizeText(payload.type);
    if (category === "highway" || category === "boundary") return null;

    const confidence =
      distance <= 20 ? "forte" : distance <= 65 ? "moyenne" : "prudente";

    return {
      id: point.id,
      name,
      displayName: normalizeText(payload.display_name),
      category,
      type,
      distanceMeters: Math.round(distance),
      confidence,
      source: "OpenStreetMap Nominatim",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide." },
      { status: 400 },
    );
  }

  if (
    !isRecord(payload) ||
    payload.purpose !== "manual-selected-buildings"
  ) {
    return NextResponse.json(
      {
        error:
          "La recherche par coordonnées est réservée à une sélection manuelle ciblée de bâtiments.",
      },
      { status: 400 },
    );
  }

  const points = parsePoints(payload);
  if (!points.length) {
    return NextResponse.json(
      { error: "Aucune coordonnée de bâtiment valide n'a été fournie." },
      { status: 400 },
    );
  }

  const proposals = [] as Array<NonNullable<Awaited<ReturnType<typeof reverseLookup>>>>;
  for (let index = 0; index < points.length; index += 1) {
    if (index > 0) await wait(MIN_DELAY_MS);
    const proposal = await reverseLookup(points[index]);
    if (proposal) proposals.push(proposal);
  }

  return NextResponse.json({
    proposals,
    searchedCount: points.length,
    limit: MAX_POINTS_PER_REQUEST,
    warning:
      "La recherche inverse renvoie l'objet OpenStreetMap nommé le plus proche, pas nécessairement le nom juridique du bâtiment. Les propositions doivent être vérifiées avant application.",
  });
}
