import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextRequest, NextResponse } from "next/server";
import { checkAiAccess } from "@/lib/dromap/server/ai-access";
import { readPublicUrl } from "@/lib/dromap/server/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 45_000;

function looksLikeGeoJson(text: string) {
  try {
    const value = JSON.parse(text) as { type?: unknown };
    return value && typeof value === "object" && typeof value.type === "string";
  } catch {
    return false;
  }
}

async function handleGET(request: NextRequest) {
  const accessError = await checkAiAccess("geojson");
  if (accessError) return accessError;
  try {
    const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
    if (!rawUrl) return NextResponse.json({ error: "URL GeoJSON manquante." }, { status: 400 });
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return NextResponse.json({ error: "Seules les URL HTTP/HTTPS sont autorisées." }, { status: 400 });
    }
    const text = await readPublicUrl(url, MAX_BYTES, TIMEOUT_MS);
    if (!looksLikeGeoJson(text)) throw new Error("La source ne contient pas un objet GeoJSON valide.");
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "application/geo+json; charset=utf-8",
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Téléchargement GeoJSON impossible." },
      { status: 502 },
    );
  }
}

export const GET = withRequestSecurity(handleGET);
