import "server-only";

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];

async function queryEndpoints(query: string, timeoutMs = 20_000): Promise<{ elements: Array<Record<string, unknown>> }> {
  const failures: string[] = [];
  const configured = (process.env.DROMAP_OVERPASS_API_URLS ?? process.env.DROMAP_OVERPASS_API_URL)?.split(",").map(url => url.trim()).filter(Boolean);
  const controller = new AbortController();
  const requests = (configured?.length ? configured.slice(0, 2) : ENDPOINTS).map(async endpoint => {
    try {
      const response = await fetch(endpoint, {
        method: "POST", body: new URLSearchParams({ data: query }), redirect: "error",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "User-Agent": "DroMap/1.0 geographical queries" },
        signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), controller.signal]), cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
  throw new Error(`Les sources OpenStreetMap n'ont pas pu terminer la recherche (${failures.join(" ; ")}). Aucun résultat partiel n'a été retenu.`);
}

// Retry overloaded broad searches as smaller, complete queries within route budgets.
export async function queryOverpass(query: string): Promise<{ elements: Array<Record<string, unknown>> }> {
  try { return await queryEndpoints(query); }
  catch (initialError) {
    const pattern = /\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)/g;
    const matches = [...query.matchAll(pattern)];
    if (!matches.length || matches.some(match => match[0] !== matches[0][0])) throw initialError;
    const [south, west, north, east] = matches[0].slice(1).map(Number);
    if (north <= south || east <= west) throw initialError;
    const midLat = (south + north) / 2, midLng = (west + east) / 2;
    const cells = [[south,west,midLat,midLng],[south,midLng,midLat,east],[midLat,west,north,midLng],[midLat,midLng,north,east]];
    const elements = new Map<string, Record<string, unknown>>();
    for (let index = 0; index < cells.length; index += 2) {
      const results = await Promise.all(cells.slice(index,index+2).map(cell => queryEndpoints(query.replace(pattern, `(${cell.join(",")})`), 12_000)));
      for (const result of results) for (const element of result.elements) elements.set(`${element.type}:${element.id}`, element);
    }
    const result = { elements: [...elements.values()] };
    if (Buffer.byteLength(JSON.stringify(result)) > 25 * 1024 * 1024) throw new Error("Réponse supérieure à 25 Mo");
    return result;
  }
}
