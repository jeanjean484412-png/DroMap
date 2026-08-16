import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

function validRevision(value: string) {
  return value.length >= 8 && value.length <= 120 && /^[A-Za-z0-9._-]+$/.test(value);
}

type LibraryRow = {
  current_revision?: unknown;
  chunk_count?: unknown;
  encoding?: unknown;
  updated_at?: unknown;
  payload_size_bytes?: unknown;
};

function rowToManifest(row: LibraryRow | null | undefined) {
  if (
    !row ||
    typeof row.current_revision !== "string" ||
    typeof row.chunk_count !== "number" ||
    !Number.isInteger(row.chunk_count) ||
    row.chunk_count < 1 ||
    (row.encoding !== "gzip-base64" && row.encoding !== "base64")
  ) return null;
  return {
    revision: row.current_revision,
    chunkCount: row.chunk_count,
    encoding: row.encoding,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    payloadSizeBytes:
      typeof row.payload_size_bytes === "number" && Number.isFinite(row.payload_size_bytes)
        ? row.payload_size_bytes
        : 0,
  };
}

async function readManifest(ownerId: string, accessToken: string) {
  const response = await supabaseRestFetch(
    `/dromap_personal_library?owner_id=eq.${encodeURIComponent(ownerId)}&select=current_revision,chunk_count,encoding,updated_at,payload_size_bytes&limit=1`,
    accessToken,
    { method: "GET" },
  );
  const rows = await parseJsonResponse<LibraryRow[]>(response);
  return response.ok ? rowToManifest(rows?.[0]) : null;
}

async function removeRevision(ownerId: string, revision: string, accessToken: string) {
  if (!validRevision(revision)) return;
  await supabaseRestFetch(
    `/dromap_personal_library_chunks?owner_id=eq.${encodeURIComponent(ownerId)}&revision=eq.${encodeURIComponent(revision)}`,
    accessToken,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  ).catch(() => null);
}

export async function GET() {
  if (!getSupabaseConfig()) return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  try {
    const manifest = await readManifest(auth.user.id, auth.accessToken);
    if (!manifest) return NextResponse.json({ error: "Bibliothèque introuvable." }, { status: 404 });
    return NextResponse.json({ manifest });
  } catch {
    return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  if (!getSupabaseConfig()) return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as
    | { revision?: unknown; expectedRevision?: unknown; chunkCount?: unknown; encoding?: unknown; payloadSizeBytes?: unknown; updatedAt?: unknown }
    | null;
  const revision = typeof body?.revision === "string" ? body.revision : "";
  const expectedRevision =
    body && Object.prototype.hasOwnProperty.call(body, "expectedRevision")
      ? typeof body.expectedRevision === "string"
        ? body.expectedRevision
        : body.expectedRevision === null
          ? null
          : undefined
      : undefined;
  const chunkCount = typeof body?.chunkCount === "number" ? body.chunkCount : 0;
  const encoding = body?.encoding;
  const payloadSizeBytes = typeof body?.payloadSizeBytes === "number" ? body.payloadSizeBytes : 0;
  const updatedAt = typeof body?.updatedAt === "string" && body.updatedAt ? body.updatedAt : new Date().toISOString();

  if (
    !validRevision(revision) ||
    expectedRevision === undefined ||
    (typeof expectedRevision === "string" && !validRevision(expectedRevision)) ||
    !Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 10001 ||
    (encoding !== "gzip-base64" && encoding !== "base64") ||
    !Number.isFinite(payloadSizeBytes) || payloadSizeBytes < 0
  ) return NextResponse.json({ error: "Bibliothèque invalide." }, { status: 400 });

  try {
    const chunksResponse = await supabaseRestFetch(
      `/dromap_personal_library_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&revision=eq.${encodeURIComponent(revision)}&select=chunk_index&order=chunk_index.asc`,
      auth.accessToken,
      { method: "GET" },
    );
    const chunks = await parseJsonResponse<Array<{ chunk_index?: unknown }>>(chunksResponse);
    const complete = chunksResponse.ok && Array.isArray(chunks) && chunks.length === chunkCount && chunks.every((row, index) => row.chunk_index === index);
    if (!complete) return NextResponse.json({ error: "La bibliothèque n’a pas été entièrement transférée." }, { status: 409 });

    let response: Response;
    if (expectedRevision === null) {
      response = await supabaseRestFetch("/dromap_personal_library", auth.accessToken, {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          owner_id: auth.user.id,
          current_revision: revision,
          chunk_count: chunkCount,
          encoding,
          payload_size_bytes: Math.floor(payloadSizeBytes),
          updated_at: updatedAt,
        }),
      });
    } else {
      response = await supabaseRestFetch(
        `/dromap_personal_library?owner_id=eq.${encodeURIComponent(auth.user.id)}&current_revision=eq.${encodeURIComponent(expectedRevision)}&select=current_revision,chunk_count,encoding,updated_at,payload_size_bytes`,
        auth.accessToken,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            current_revision: revision,
            chunk_count: chunkCount,
            encoding,
            payload_size_bytes: Math.floor(payloadSizeBytes),
            updated_at: updatedAt,
          }),
        },
      );
    }

    const rows = await parseJsonResponse<LibraryRow[]>(response);
    const manifest = response.ok ? rowToManifest(rows?.[0]) : null;
    if (!manifest) {
      const current = await readManifest(auth.user.id, auth.accessToken);
      await removeRevision(auth.user.id, revision, auth.accessToken);
      if (current) {
        return NextResponse.json({
          error: "Ta bibliothèque a été modifiée sur un autre appareil.",
          current,
        }, { status: 409 });
      }
      return NextResponse.json({ error: "La bibliothèque n’a pas pu être synchronisée." }, { status: 502 });
    }

    void supabaseRestFetch(
      `/dromap_personal_library_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&revision=neq.${encodeURIComponent(revision)}`,
      auth.accessToken,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    ).catch(() => null);

    return NextResponse.json({ ok: true, manifest });
  } catch {
    await removeRevision(auth.user.id, revision, auth.accessToken);
    return NextResponse.json({ error: "La bibliothèque en ligne est momentanément indisponible." }, { status: 503 });
  }
}
