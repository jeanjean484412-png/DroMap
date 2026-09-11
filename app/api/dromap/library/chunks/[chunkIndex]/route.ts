import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

const MAX_CHUNK_CHARACTERS = 2_700_000;

function validRevision(value: string) {
  return value.length >= 8 && value.length <= 120 && /^[A-Za-z0-9._-]+$/.test(value);
}

function parseChunkIndex(value: string) {
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 && index <= 10000 ? index : null;
}

async function handlePUT(
  request: Request,
  context: { params: Promise<{ chunkIndex: string }> },
) {
  if (!getSupabaseConfig()) return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { chunkIndex: rawChunkIndex } = await context.params;
  const chunkIndex = parseChunkIndex(rawChunkIndex);
  const body = (await request.json().catch(() => null)) as { revision?: unknown; chunk?: unknown } | null;
  const revision = typeof body?.revision === "string" ? body.revision : "";
  const chunk = typeof body?.chunk === "string" ? body.chunk : null;
  if (chunkIndex === null || !validRevision(revision) || chunk === null) return NextResponse.json({ error: "Partie de bibliothèque invalide." }, { status: 400 });
  if (chunk.length > MAX_CHUNK_CHARACTERS) return NextResponse.json({ error: "Cette partie de la bibliothèque est trop volumineuse." }, { status: 413 });

  try {
    const response = await supabaseRestFetch(
      "/dromap_personal_library_chunks?on_conflict=owner_id,revision,chunk_index",
      auth.accessToken,
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ owner_id: auth.user.id, revision, chunk_index: chunkIndex, chunk_data: chunk }),
      },
    );
    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      if (payload && typeof payload === "object" && "message" in payload && payload.message === "DROMAP_STORAGE_LIMIT") {
        return NextResponse.json({ error: "La limite technique de stockage du compte est atteinte. Libère de l’espace ou contacte le support." }, { status: 413 });
      }
      console.warn("DroMap: sauvegarde d'une partie de bibliothèque refusée", payload);
      return NextResponse.json({ error: "Une partie de la bibliothèque n’a pas pu être enregistrée." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  }
}

async function handleGET(
  request: Request,
  context: { params: Promise<{ chunkIndex: string }> },
) {
  if (!getSupabaseConfig()) return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { chunkIndex: rawChunkIndex } = await context.params;
  const chunkIndex = parseChunkIndex(rawChunkIndex);
  const revision = new URL(request.url).searchParams.get("revision") ?? "";
  if (chunkIndex === null || !validRevision(revision)) return NextResponse.json({ error: "Partie de bibliothèque invalide." }, { status: 400 });

  try {
    const response = await supabaseRestFetch(
      `/dromap_personal_library_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&revision=eq.${encodeURIComponent(revision)}&chunk_index=eq.${chunkIndex}&select=chunk_data&limit=1`,
      auth.accessToken,
      { method: "GET" },
    );
    const rows = await parseJsonResponse<Array<{ chunk_data?: unknown }>>(response);
    const chunk = rows?.[0]?.chunk_data;
    if (!response.ok || typeof chunk !== "string") return NextResponse.json({ error: "La bibliothèque en ligne est incomplète." }, { status: 404 });
    return NextResponse.json({ chunk });
  } catch {
    return NextResponse.json({ error: "La bibliothèque en ligne ne peut pas être chargée pour le moment." }, { status: 503 });
  }
}

export const PUT = withRequestSecurity(handlePUT);
export const GET = withRequestSecurity(handleGET);
