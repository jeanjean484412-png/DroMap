import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readBoundedBytes } from "@/lib/dromap/bounded-stream";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function checkRequestOrigin(request: Request) {
  const target = new URL(request.url);
  // Next can reconstruct request.url with its bind address (localhost), while
  // Host is the address actually used by the browser. Do not trust arbitrary
  // X-Forwarded-Host values; browsers cannot set the Host header themselves.
  const host = request.headers.get("host") ?? target.host;
  if (!host || /[\s/\\@?#]/.test(host)) return false;
  let expectedOrigin: string;
  try { expectedOrigin = new URL(`${target.protocol}//${host}`).origin; }
  catch { return false; }
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site" || site === "same-site") return false;
  const origin = request.headers.get("origin");
  if (origin) return origin === expectedOrigin;
  const referer = request.headers.get("referer");
  if (referer) {
    try { return new URL(referer).origin === expectedOrigin; }
    catch { return false; }
  }
  // Browsers supply Origin/Fetch Metadata. CLI/server clients have no ambient
  // browser session, and remain compatible without either header.
  return !site || site === "same-origin";
}

function bodyLimit(path: string) {
  if (path === "/api/dromap/contact") return 4 * 1024 * 1024;
  if (path === "/api/dromap/publications") return 5 * 1024 * 1024;
  if (path.includes("/chunks/")) return 2_710_000;
  if (path === "/api/dromap/ai" || path === "/api/dromap/buildings/reverse-names") return 4 * 1024 * 1024;
  if (path.startsWith("/api/dromap/projects/")) return 256 * 1024;
  if (path === "/api/dromap/billing/webhook") return 1024 * 1024;
  return 64 * 1024;
}

export function withRequestSecurity<Args extends unknown[]>(handler: (request: NextRequest, ...args: Args) => Promise<Response>) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const mutation = MUTATIONS.has(request.method);
    const webhook = path === "/api/dromap/billing/webhook";
    if ((mutation || path === "/api/dromap/auth/session") && !webhook && !checkRequestOrigin(request)) {
      return NextResponse.json({ error: "Origine de la requête refusée." }, { status: 403 });
    }
    if (mutation && request.body) {
      const max = bodyLimit(path);
      const declared = Number(request.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > max) {
        return NextResponse.json({ error: "Requête trop volumineuse." }, { status: 413 });
      }
      try {
        const bytes = await readBoundedBytes(request.body, max, AbortSignal.timeout(30_000));
        const headers = new Headers(request.headers);
        headers.delete("content-length");
        if (bytes.byteLength > 0) {
          const type = headers.get("content-type")?.split(";")[0].trim().toLowerCase();
          const expected = path === "/api/dromap/contact" ? "multipart/form-data" : "application/json";
          if (type !== expected) {
            return NextResponse.json({ error: "Format de requête invalide." }, { status: 415 });
          }
        }
        request = new Request(request.url, {
          method: request.method,
          headers,
          body: bytes.byteLength > 0 ? bytes : undefined,
          signal: request.signal,
        });
      } catch (error) {
        return NextResponse.json({ error: "Requête invalide ou trop volumineuse." }, {
          status: error instanceof Error && error.message === "BODY_TOO_LARGE" ? 413
            : error instanceof Error && error.name === "TimeoutError" ? 408 : 400,
        });
      }
    }
    // Next.js peut fournir ici un NextRequest créé par une autre instance du
    // runtime que celle importée dans ce module (notamment avec Turbopack).
    // `instanceof` devient alors faux et reconstruire `new NextRequest(request)`
    // tente de lire les champs privés de l'autre instance, ce qui provoque un
    // HTTP 500 avant même d'atteindre la route. Les handlers n'utilisent que
    // l'interface de la requête déjà fournie par Next ; après contrôle du corps,
    // la Request Web reconstruite expose également cette interface.
    const response = await handler(request as NextRequest, ...args);
    if (mutation || /^\/api\/dromap\/(auth|account|projects|library|billing)(\/|$)/.test(path) || path.includes("/source")) {
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
    }
    return response;
  };
}
