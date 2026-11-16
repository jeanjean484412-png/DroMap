import "server-only";
import { setTimeout as wait } from "node:timers/promises";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

export class OverpassUnavailableError extends Error {}

async function queryEndpoints(
  query: string,
  timeoutMs = 20_000,
  preferredEndpoint?: string,
): Promise<{ elements: Array<Record<string, unknown>> }> {
  const failures: string[] = [];
  const configured = (process.env.DROMAP_OVERPASS_API_URLS ?? process.env.DROMAP_OVERPASS_API_URL)?.split(",").map(url => url.trim()).filter(Boolean);
  const usePreferred = !configured?.length && Boolean(preferredEndpoint);
  const endpoints = configured?.length
    ? configured.slice(0, 2)
    : [...new Set(preferredEndpoint ? [preferredEndpoint, ...ENDPOINTS] : ENDPOINTS)];
  const controller = new AbortController();
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([deadline, controller.signal]);
  const requests = endpoints.map(async (endpoint, index) => {
    try {
      if (usePreferred && index > 0) await wait(2_000, undefined, { signal });
      const response = await fetch(endpoint, {
        method: "POST", body: new URLSearchParams({ data: query }), redirect: "error",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "DroMap/1.0 (+https://dromap.fr; contact@dromap.fr)" },
        signal, cache: "no-store",
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`HTTP ${response.status}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Réponse vide");
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 25 * 1024 * 1024) throw new Error("Réponse supérieure à 25 Mo");
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (data.remark || !Array.isArray(data.elements)) throw new Error("Recherche incomplète");
      return data;
    } catch (error) {
      failures.push(error instanceof Error && /abort|timeout/i.test(error.name) ? "délai dépassé" : error instanceof Error ? error.message : "connexion impossible");
      throw error;
    }
  });
  try { const result = await Promise.any(requests); controller.abort(); return result; } catch { /* both sources failed */ }
  console.warn("[dromap-overpass] Échec des sources", failures);
  throw new OverpassUnavailableError(`Les sources OpenStreetMap n'ont pas pu terminer la recherche (${failures.join(" ; ")}). Aucun résultat partiel n'a été retenu.`);
}

// Retry overloaded broad searches as smaller, complete queries within route budgets.
export async function queryOverpass(
  query: string,
  { preferredEndpoint }: { preferredEndpoint?: string } = {},
): Promise<{ elements: Array<Record<string, unknown>> }> {
  try { return await queryEndpoints(query, preferredEndpoint ? 22_000 : 20_000, preferredEndpoint); }
  catch (initialError) {
    const pattern = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g;
    const matches = [...query.matchAll(pattern)];
    if (!matches.length || matches.some(match => match[0] !== matches[0][0])) throw initialError;
    const [south, west, north, east] = matches[0].slice(1).map(Number);
    if (north <= south || east <= west) throw initialError;
    const midLat = (south + north) / 2, midLng = (west + east) / 2;
    const cells = [[south,west,midLat,midLng],[south,midLng,midLat,east],[midLat,west,north,midLng],[midLat,midLng,north,east]];
    const elements = new Map<string, Record<string, unknown>>();
    // Les recherches de routes ont au plus 22 s pour la zone entière,
    // puis deux lots de 16 s, sous les 60 s allouées à la route HTTP.
    const cellTimeoutMs = preferredEndpoint ? 16_000 : 12_000;
    for (let index = 0; index < cells.length; index += 2) {
      const results = await Promise.all(
        cells.slice(index, index + 2).map((cell) =>
          queryEndpoints(
            query.replace(pattern, `(${cell.join(",")})`),
            cellTimeoutMs,
            preferredEndpoint,
          ),
        ),
      );
      for (const result of results) for (const element of result.elements) elements.set(`${element.type}:${element.id}`, element);
    }
    const result = { elements: [...elements.values()] };
    if (Buffer.byteLength(JSON.stringify(result)) > 25 * 1024 * 1024) throw new Error("Réponse supérieure à 25 Mo");
    return result;
  }
}
