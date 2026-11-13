import MGRS from "geographiclib-mgrs";

type Coordinates = { lat: number; lng: number };
type CoordinateFormat = "MGRS" | "DMS" | "décimales";
type ParsedCoordinates =
  | { kind: "place" }
  | { kind: "invalid"; message: string }
  | { kind: "coordinates"; point: Coordinates; format: CoordinateFormat };

const INVALID_COORDINATES: ParsedCoordinates = {
  kind: "invalid",
  message: "Les coordonnées sont invalides. Vérifie le format et les valeurs.",
};

const MGRS_REFERENCE = /^(?:\d{1,2}[C-HJ-NP-X]|[ABYZ])[A-HJ-NP-Z]{2}(\d{0,10})$/;
const NUMBER = String.raw`[+-]?\d+(?:[.,]\d+)?`;
const ANGLE = String.raw`(${NUMBER})(?:\s*[°:º]\s*|\s+)(\d{1,2})(?:\s*['′’:]\s*|\s+)(\d{1,2}(?:[.,]\d+)?)\s*(?:["″”]|['′’]{2})?`;
const DMS_SUFFIX = new RegExp(String.raw`^${ANGLE}\s*([NSEWO])[\s,;/]*${ANGLE}\s*([NSEWO])$`, "i");
const DMS_PREFIX = new RegExp(String.raw`^([NSEWO])\s*${ANGLE}[\s,;/]*([NSEWO])\s*${ANGLE}$`, "i");
const SIGNED_DMS = new RegExp(String.raw`^${ANGLE}[\s,;/]+${ANGLE}$`);
const DECIMAL_DOT = /^([+-]?\d+(?:\.\d+)?)\s*[,;/]\s*([+-]?\d+(?:\.\d+)?)$/;
const DECIMAL_SPACED = new RegExp(String.raw`^(${NUMBER})(?:\s*[;/]\s*|\s+)(${NUMBER})$`);

function parseAngle(degrees: string, minutes: string, seconds: string, direction?: string) {
  const decimalDegrees = Number(degrees.replace(",", "."));
  const decimalMinutes = Number(minutes);
  const decimalSeconds = Number(seconds.replace(",", "."));
  if (!Number.isInteger(decimalDegrees) || decimalMinutes >= 60 || decimalSeconds >= 60) {
    return NaN;
  }

  const negativeDirection = direction === "S" || direction === "W" || direction === "O";
  if ((degrees.startsWith("-") && direction && !negativeDirection) ||
      (degrees.startsWith("+") && negativeDirection)) {
    return NaN;
  }

  const magnitude = Math.abs(decimalDegrees) + decimalMinutes / 60 + decimalSeconds / 3600;
  return degrees.startsWith("-") || negativeDirection ? -magnitude : magnitude;
}

function coordinateResult(lat: number, lng: number, format: CoordinateFormat): ParsedCoordinates {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return INVALID_COORDINATES;
  }

  if (Math.abs(lat) > 85.05112878) {
    return { kind: "invalid", message: "Ces coordonnées dépassent la latitude affichable sur la carte." };
  }

  return { kind: "coordinates", point: { lat, lng }, format };
}

function directedDms(first: number, firstDirection: string, second: number, secondDirection: string) {
  const firstIsLatitude = firstDirection === "N" || firstDirection === "S";
  const secondIsLatitude = secondDirection === "N" || secondDirection === "S";
  if (firstIsLatitude === secondIsLatitude) return INVALID_COORDINATES;

  return firstIsLatitude
    ? coordinateResult(first, second, "DMS")
    : coordinateResult(second, first, "DMS");
}

export function parsePlaceSearchCoordinates(query: string): ParsedCoordinates {
  const normalized = query.trim().toUpperCase().replace(/−/g, "-");
  const compact = normalized.replace(/\s+/g, "");
  const mgrs = MGRS_REFERENCE.exec(compact);
  if (mgrs) {
    const digits = mgrs[1];
    // Un mot court peut aussi être un nom de lieu. Un carré UPS seul s'écrit en majuscules.
    if (digits.length === 0 && /^[A-Za-z]{3}$/.test(query.trim()) && query.trim() !== normalized) {
      return { kind: "place" };
    }
    const spacedDigits = /(\d+)\s+(\d+)$/.exec(normalized);
    if (digits.length % 2 !== 0 || (spacedDigits && spacedDigits[1].length !== spacedDigits[2].length)) {
      return INVALID_COORDINATES;
    }
    try {
      const [lng, lat] = MGRS.toPoint(compact, true);
      return coordinateResult(lat, lng, "MGRS");
    } catch {
      return digits.length === 0 ? { kind: "place" } : INVALID_COORDINATES;
    }
  }

  const suffix = DMS_SUFFIX.exec(normalized);
  if (suffix) {
    const [, d1, m1, s1, h1, d2, m2, s2, h2] = suffix;
    return directedDms(parseAngle(d1, m1, s1, h1), h1, parseAngle(d2, m2, s2, h2), h2);
  }

  const prefix = DMS_PREFIX.exec(normalized);
  if (prefix) {
    const [, h1, d1, m1, s1, h2, d2, m2, s2] = prefix;
    return directedDms(parseAngle(d1, m1, s1, h1), h1, parseAngle(d2, m2, s2, h2), h2);
  }

  const signed = SIGNED_DMS.exec(normalized);
  if (signed) {
    const [, d1, m1, s1, d2, m2, s2] = signed;
    return coordinateResult(parseAngle(d1, m1, s1), parseAngle(d2, m2, s2), "DMS");
  }

  const decimal = DECIMAL_DOT.exec(normalized) ?? DECIMAL_SPACED.exec(normalized);
  if (decimal) {
    return coordinateResult(Number(decimal[1].replace(",", ".")), Number(decimal[2].replace(",", ".")), "décimales");
  }

  return { kind: "place" };
}
