import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 45_000;

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts as [number, number, number, number];
  return (
    a === 10 || a === 127 || a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string) {
  const normalized = address.toLowerCase();
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
}

async function assertPublicHost(url: URL) {
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Hôte local interdit.");
  }
  if (isIP(hostname)) {
    if ((isIP(hostname) === 4 && isPrivateIpv4(hostname)) || (isIP(hostname) === 6 && isPrivateIpv6(hostname))) {
      throw new Error("Adresse privée interdite.");
    }
    return;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error("Hôte introuvable.");
  for (const entry of addresses) {
    if ((entry.family === 4 && isPrivateIpv4(entry.address)) || (entry.family === 6 && isPrivateIpv6(entry.address))) {
      throw new Error("L'hôte résout vers une adresse privée interdite.");
    }
  }
}

function looksLikeGeoJson(text: string) {
  try {
    const value = JSON.parse(text) as { type?: unknown };
    return value && typeof value === "object" && typeof value.type === "string";
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const rawUrl = request.nextUrl.searchParams.get("url")?.trim();
    if (!rawUrl) return NextResponse.json({ error: "URL GeoJSON manquante." }, { status: 400 });
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return NextResponse.json({ error: "Seules les URL HTTP/HTTPS sont autorisées." }, { status: 400 });
    }
    await assertPublicHost(url);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/geo+json,application/json,text/json;q=0.9,*/*;q=0.1",
          "User-Agent": "DroMap/1.0 AI GeoJSON importer",
        },
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`La source a renvoyé ${response.status}.`);
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      if (contentLength > MAX_BYTES) throw new Error("Le fichier dépasse la limite de 25 Mo.");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_BYTES) throw new Error("Le fichier dépasse la limite de 25 Mo.");
      const text = new TextDecoder().decode(buffer);
      if (!looksLikeGeoJson(text)) throw new Error("La source ne contient pas un objet GeoJSON valide.");
      return new NextResponse(text, {
        status: 200,
        headers: {
          "Content-Type": "application/geo+json; charset=utf-8",
          "Cache-Control": "private, max-age=300",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Téléchargement GeoJSON impossible." },
      { status: 502 },
    );
  }
}
