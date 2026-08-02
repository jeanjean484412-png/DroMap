const GEOBOUNDARIES_API_BASE =
  "https://www.geoboundaries.org/api/current/gbOpen";
const METADATA_TIMEOUT_MS = 30_000;
const DOWNLOAD_TIMEOUT_MS = 180_000;
const MAX_REMOTE_BYTES = 300 * 1024 * 1024;

const ADM_LEVELS = ["ADM0", "ADM1", "ADM2", "ADM3", "ADM4", "ADM5"] as const;
const DOWNLOAD_HOSTS = new Set([
  "www.geoboundaries.org",
  "geoboundaries.org",
  "github.com",
  "raw.githubusercontent.com",
  "objects.githubusercontent.com",
  "githubusercontent.com",
]);

type AdmLevel = (typeof ADM_LEVELS)[number];
type GeometryMode = "simplified" | "original";

type GeoBoundariesMetadata = {
  boundaryId: string;
  boundaryName: string;
  boundaryIso: string;
  boundaryType: string;
  boundaryYearRepresented: string;
  boundarySource: string;
  boundaryLicense: string;
  licenseSource: string;
  buildDate: string;
  admUnitCount: number | null;
  meanVertices: number | null;
  gjDownloadUrl: string;
  simplifiedGeometryGeoJson: string;
};


type Bbox = [number, number, number, number];

function parseBbox(value: string | null): Bbox | null {
  if (!value) {
    return null;
  }

  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  const [west, south, east, north] = parts;
  if (west >= east || south >= north) {
    return null;
  }

  return [west, south, east, north];
}

function geometryIntersectsBbox(geometry: unknown, bbox: Bbox) {
  if (!geometry || typeof geometry !== "object") {
    return false;
  }

  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates)) {
    return false;
  }

  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  const stack: unknown[] = [coordinates];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!Array.isArray(current)) {
      continue;
    }

    if (
      current.length >= 2 &&
      typeof current[0] === "number" &&
      typeof current[1] === "number" &&
      Number.isFinite(current[0]) &&
      Number.isFinite(current[1])
    ) {
      const lng = current[0];
      const lat = current[1];
      if (lng < west) west = lng;
      if (lng > east) east = lng;
      if (lat < south) south = lat;
      if (lat > north) north = lat;
      continue;
    }

    for (const child of current) {
      if (Array.isArray(child)) {
        stack.push(child);
      }
    }
  }

  if (!Number.isFinite(west) || !Number.isFinite(south)) {
    return false;
  }

  return !(east < bbox[0] || west > bbox[2] || north < bbox[1] || south > bbox[3]);
}

function filterGeoJsonToBbox(text: string, bbox: Bbox) {
  const parsed = JSON.parse(text) as {
    type?: unknown;
    features?: unknown;
  };

  if (parsed.type !== "FeatureCollection" || !Array.isArray(parsed.features)) {
    throw new Error("Le fichier distant n’est pas une FeatureCollection GeoJSON exploitable.");
  }

  const originalCount = parsed.features.length;
  const features = parsed.features.filter((feature) => {
    if (!feature || typeof feature !== "object") {
      return false;
    }

    return geometryIntersectsBbox(
      (feature as { geometry?: unknown }).geometry,
      bbox,
    );
  });

  return {
    text: JSON.stringify({ ...parsed, features }),
    originalCount,
    keptCount: features.length,
  };
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

function getString(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

function getNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeMetadata(value: unknown): GeoBoundariesMetadata {
  const candidate = Array.isArray(value) ? value[0] : value;

  if (!candidate || typeof candidate !== "object") {
    throw new Error(
      "La réponse geoBoundaries ne contient pas de métadonnées exploitables.",
    );
  }

  const record = candidate as Record<string, unknown>;
  const boundaryName = getString(record, "boundaryName");
  const boundaryType = getString(record, "boundaryType");
  const gjDownloadUrl = getString(record, "gjDownloadURL");
  const simplifiedGeometryGeoJson = getString(
    record,
    "simplifiedGeometryGeoJSON",
  );

  if (
    !boundaryName ||
    !boundaryType ||
    (!gjDownloadUrl && !simplifiedGeometryGeoJson)
  ) {
    throw new Error(
      "La réponse geoBoundaries ne fournit aucun fichier GeoJSON exploitable.",
    );
  }

  return {
    boundaryId: getString(record, "boundaryID"),
    boundaryName,
    boundaryIso: getString(record, "boundaryISO"),
    boundaryType,
    boundaryYearRepresented: getString(record, "boundaryYearRepresented"),
    boundarySource: getString(record, "boundarySource"),
    boundaryLicense: getString(record, "boundaryLicense"),
    licenseSource: getString(record, "licenseSource"),
    buildDate: getString(record, "buildDate"),
    admUnitCount: getNumber(record, "admUnitCount"),
    meanVertices: getNumber(record, "meanVertices"),
    gjDownloadUrl,
    simplifiedGeometryGeoJson,
  };
}

async function fetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "application/json, application/geo+json, text/html;q=0.9, */*;q=0.8",
        "User-Agent": "DroMap-GeoJSON-Library/1.0",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `geoBoundaries n’a pas répondu dans les ${Math.round(timeoutMs / 1000)} secondes prévues.`,
      );
    }

    throw new Error(
      "Le serveur DroMap n’a pas réussi à joindre geoBoundaries. Réessaie dans quelques instants.",
      { cause: error },
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function validateIso(value: string | null) {
  const iso = value?.trim().toUpperCase() ?? "";
  return /^[A-Z]{3}$/.test(iso) ? iso : null;
}

function validateAdm(value: string | null): AdmLevel | null {
  const adm = value?.trim().toUpperCase() ?? "";
  return ADM_LEVELS.includes(adm as AdmLevel) ? (adm as AdmLevel) : null;
}

function validateGeometry(value: string | null): GeometryMode | null {
  return value === "simplified" || value === "original" ? value : null;
}

function sortAdmLevels(levels: Iterable<AdmLevel>) {
  const unique = new Set(levels);
  return ADM_LEVELS.filter((level) => unique.has(level));
}

async function getAvailableLevels(iso: string) {
  const countryIndexUrl = `${GEOBOUNDARIES_API_BASE}/${iso}/`;
  const response = await fetchWithTimeout(countryIndexUrl, METADATA_TIMEOUT_MS);

  if (response.status === 404) {
    return [] as AdmLevel[];
  }

  if (!response.ok) {
    throw new Error(
      `geoBoundaries a répondu avec le code ${response.status} pendant la vérification du pays.`,
    );
  }

  const html = await response.text();
  const matches = html.match(/\bADM[0-5]\b/g) ?? [];
  return sortAdmLevels(matches as AdmLevel[]);
}

async function getMetadata(iso: string, adm: AdmLevel) {
  const sourceUrl = `${GEOBOUNDARIES_API_BASE}/${iso}/${adm}/`;
  const response = await fetchWithTimeout(sourceUrl, METADATA_TIMEOUT_MS);

  if (!response.ok) {
    throw new Error(
      `geoBoundaries a répondu avec le code ${response.status} pour ${iso} ${adm}.`,
    );
  }

  const text = await response.text();
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(
      "geoBoundaries a renvoyé une réponse invalide au lieu des métadonnées attendues.",
    );
  }

  return {
    metadata: normalizeMetadata(parsed),
    sourceUrl,
  };
}

function resolveDownloadUrl(
  metadata: GeoBoundariesMetadata,
  geometry: GeometryMode,
) {
  const rawUrl =
    geometry === "simplified"
      ? metadata.simplifiedGeometryGeoJson || metadata.gjDownloadUrl
      : metadata.gjDownloadUrl || metadata.simplifiedGeometryGeoJson;

  if (!rawUrl) {
    throw new Error("Aucun lien GeoJSON n’est disponible pour ce niveau.");
  }

  const url = new URL(rawUrl);
  if (url.protocol === "http:") {
    url.protocol = "https:";
  }

  if (url.protocol !== "https:" || !DOWNLOAD_HOSTS.has(url.hostname)) {
    throw new Error(
      "Le lien de téléchargement fourni par geoBoundaries n’utilise pas une source autorisée.",
    );
  }

  return url.toString();
}

function getUnavailableMessage(iso: string, adm: AdmLevel, levels: AdmLevel[]) {
  if (levels.length === 0) {
    return `Aucune limite gbOpen n’est actuellement publiée pour ${iso}.`;
  }

  return `${adm} n’est pas disponible pour ${iso}. Niveaux disponibles : ${levels.join(", ")}.`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? "metadata";
  const iso = validateIso(url.searchParams.get("iso"));
  const adm = validateAdm(url.searchParams.get("adm"));

  if (!iso || !adm) {
    return jsonResponse(
      {
        ok: false,
        code: "INVALID_PARAMETERS",
        message: "Le code pays ISO3 ou le niveau ADM demandé est invalide.",
        availableLevels: [],
      },
      400,
    );
  }

  try {
    const availableLevels = await getAvailableLevels(iso);

    if (!availableLevels.includes(adm)) {
      return jsonResponse({
        ok: false,
        code: "LEVEL_UNAVAILABLE",
        message: getUnavailableMessage(iso, adm, availableLevels),
        availableLevels,
      });
    }

    const { metadata, sourceUrl } = await getMetadata(iso, adm);

    if (action === "metadata") {
      return jsonResponse({
        ok: true,
        availableLevels,
        metadata,
        sourceUrl,
      });
    }

    if (action !== "download") {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_ACTION",
          message: "L’action demandée n’est pas reconnue.",
          availableLevels,
        },
        400,
      );
    }

    const geometry = validateGeometry(url.searchParams.get("geometry"));
    if (!geometry) {
      return jsonResponse(
        {
          ok: false,
          code: "INVALID_GEOMETRY",
          message: "Le mode de géométrie demandé est invalide.",
          availableLevels,
        },
        400,
      );
    }

    const downloadUrl = resolveDownloadUrl(metadata, geometry);
    const upstream = await fetchWithTimeout(downloadUrl, DOWNLOAD_TIMEOUT_MS);

    if (!upstream.ok || !upstream.body) {
      throw new Error(
        `Le fichier GeoJSON distant a répondu avec le code ${upstream.status}.`,
      );
    }

    const contentLengthHeader = upstream.headers.get("content-length");
    const contentLength = contentLengthHeader
      ? Number(contentLengthHeader)
      : Number.NaN;

    if (Number.isFinite(contentLength) && contentLength > MAX_REMOTE_BYTES) {
      return jsonResponse(
        {
          ok: false,
          code: "REMOTE_FILE_TOO_LARGE",
          message:
            "Ce fichier dépasse 300 Mo et ne peut pas être chargé directement dans cette version de DroMap.",
          availableLevels,
        },
        413,
      );
    }

    const filename = `geoBoundaries-${iso}-${adm}-${geometry}.geojson`;
    const bbox = parseBbox(url.searchParams.get("bbox"));

    if (bbox) {
      const text = await upstream.text();
      const filtered = filterGeoJsonToBbox(text, bbox);

      return new Response(filtered.text, {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json; charset=utf-8",
          "Content-Disposition": `inline; filename="${filename}"`,
          "Cache-Control": "no-store, max-age=0",
          "X-DroMap-GeoBoundaries-Source": sourceUrl,
          "X-DroMap-Original-Feature-Count": String(filtered.originalCount),
          "X-DroMap-Filtered-Feature-Count": String(filtered.keptCount),
        },
      });
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ??
          "application/geo+json; charset=utf-8",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, max-age=0",
        "X-DroMap-GeoBoundaries-Source": sourceUrl,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "La requête geoBoundaries a échoué pour une raison inconnue.";

    console.error("[DroMap geoBoundaries proxy]", error);

    return jsonResponse(
      {
        ok: false,
        code: "UPSTREAM_ERROR",
        message,
        availableLevels: [],
      },
      502,
    );
  }
}
