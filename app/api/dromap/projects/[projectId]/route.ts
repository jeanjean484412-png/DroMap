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

type ProjectManifestRow = {
  project_id?: unknown;
  current_revision?: unknown;
  chunk_count?: unknown;
  encoding?: unknown;
  updated_at?: unknown;
  deleted_at?: unknown;
  payload_size_bytes?: unknown;
  metadata?: unknown;
};

function rowToManifest(row: ProjectManifestRow | null | undefined) {
  if (
    !row ||
    typeof row.project_id !== "string" ||
    typeof row.current_revision !== "string" ||
    typeof row.chunk_count !== "number" ||
    !Number.isInteger(row.chunk_count) ||
    row.chunk_count < 1 ||
    (row.encoding !== "gzip-base64" && row.encoding !== "base64")
  ) {
    return null;
  }
  return {
    projectId: row.project_id,
    revision: row.current_revision,
    chunkCount: row.chunk_count,
    encoding: row.encoding,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
    deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
    payloadSizeBytes:
      typeof row.payload_size_bytes === "number" && Number.isFinite(row.payload_size_bytes)
        ? row.payload_size_bytes
        : 0,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? row.metadata
        : {},
  };
}

async function readCurrentManifest(ownerId: string, projectId: string, accessToken: string) {
  const response = await supabaseRestFetch(
    `/dromap_projects?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&select=project_id,current_revision,chunk_count,encoding,updated_at,deleted_at,payload_size_bytes,metadata&limit=1`,
    accessToken,
    { method: "GET" },
  );
  const rows = await parseJsonResponse<ProjectManifestRow[]>(response);
  return response.ok ? rowToManifest(rows?.[0]) : null;
}

function normalizeMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function removeRevisionChunks(
  ownerId: string,
  projectId: string,
  revision: string,
  accessToken: string,
) {
  if (!validRevision(revision)) return;
  await supabaseRestFetch(
    `/dromap_project_chunks?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&revision=eq.${encodeURIComponent(revision)}`,
    accessToken,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  ).catch(() => null);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "La sauvegarde en ligne est momentanément indisponible." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { projectId } = await context.params;
  if (!projectId) return NextResponse.json({ error: "Projet invalide." }, { status: 400 });

  try {
    const manifest = await readCurrentManifest(auth.user.id, projectId, auth.accessToken);
    if (!manifest) return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    return NextResponse.json({ manifest });
  } catch {
    return NextResponse.json({ error: "Le projet en ligne ne peut pas être vérifié pour le moment." }, { status: 503 });
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "La sauvegarde en ligne est momentanément indisponible." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        revision?: unknown;
        expectedRevision?: unknown;
        expectedUpdatedAt?: unknown;
        chunkCount?: unknown;
        encoding?: unknown;
        payloadSizeBytes?: unknown;
        updatedAt?: unknown;
        deletedAt?: unknown;
        metadata?: unknown;
      }
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
  const expectedUpdatedAt =
    body && Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt")
      ? typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt
        : body.expectedUpdatedAt === null
          ? null
          : undefined
      : undefined;
  const chunkCount = typeof body?.chunkCount === "number" ? body.chunkCount : 0;
  const encoding = body?.encoding;
  const payloadSizeBytes = typeof body?.payloadSizeBytes === "number" ? body.payloadSizeBytes : 0;
  const syncUpdatedAt = new Date().toISOString();
  const deletedAt = typeof body?.deletedAt === "string" ? body.deletedAt : null;
  const metadata = normalizeMetadata(body?.metadata);

  if (
    !projectId ||
    !validRevision(revision) ||
    expectedRevision === undefined ||
    expectedUpdatedAt === undefined ||
    (typeof expectedRevision === "string" && !validRevision(expectedRevision)) ||
    (typeof expectedUpdatedAt === "string" && !expectedUpdatedAt) ||
    !Number.isInteger(chunkCount) ||
    chunkCount < 1 ||
    chunkCount > 10_001 ||
    (encoding !== "gzip-base64" && encoding !== "base64") ||
    !Number.isFinite(payloadSizeBytes) ||
    payloadSizeBytes < 0
  ) {
    return NextResponse.json({ error: "Projet invalide." }, { status: 400 });
  }

  try {
    const chunksResponse = await supabaseRestFetch(
      `/dromap_project_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&revision=eq.${encodeURIComponent(revision)}&select=chunk_index&order=chunk_index.asc`,
      auth.accessToken,
      { method: "GET" },
    );
    const chunks = await parseJsonResponse<Array<{ chunk_index?: unknown }>>(chunksResponse);
    const complete =
      chunksResponse.ok &&
      Array.isArray(chunks) &&
      chunks.length === chunkCount &&
      chunks.every((row, index) => row.chunk_index === index);
    if (!complete) {
      return NextResponse.json({ error: "Le projet n’a pas été entièrement transféré." }, { status: 409 });
    }

    let manifestResponse: Response;
    if (expectedRevision === null) {
      manifestResponse = await supabaseRestFetch(
        "/dromap_projects",
        auth.accessToken,
        {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            owner_id: auth.user.id,
            project_id: projectId,
            current_revision: revision,
            chunk_count: chunkCount,
            encoding,
            payload_size_bytes: Math.floor(payloadSizeBytes),
            updated_at: syncUpdatedAt,
            deleted_at: deletedAt,
            metadata,
          }),
        },
      );
    } else {
      manifestResponse = await supabaseRestFetch(
        `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&current_revision=eq.${encodeURIComponent(expectedRevision)}${typeof expectedUpdatedAt === "string" ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : ""}&select=project_id,current_revision,chunk_count,encoding,updated_at,deleted_at,payload_size_bytes,metadata`,
        auth.accessToken,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            current_revision: revision,
            chunk_count: chunkCount,
            encoding,
            payload_size_bytes: Math.floor(payloadSizeBytes),
            updated_at: syncUpdatedAt,
            deleted_at: deletedAt,
            metadata,
          }),
        },
      );
    }

    const updatedRows = await parseJsonResponse<ProjectManifestRow[]>(manifestResponse);
    const manifest = manifestResponse.ok ? rowToManifest(updatedRows?.[0]) : null;
    if (!manifest) {
      const current = await readCurrentManifest(auth.user.id, projectId, auth.accessToken);
      await removeRevisionChunks(auth.user.id, projectId, revision, auth.accessToken);
      if (current) {
        return NextResponse.json(
          {
            error: "Ce projet a été modifié sur un autre appareil. Choisis la version à conserver.",
            current,
          },
          { status: 409 },
        );
      }
      const payload = await parseJsonResponse(manifestResponse);
      console.warn("DroMap: validation de la sauvegarde projet refusée", payload);
      return NextResponse.json({ error: "Le projet n’a pas pu être enregistré en ligne." }, { status: 502 });
    }

    // Le manifeste pointe vers la nouvelle révision : les anciennes copies peuvent être supprimées.
    void supabaseRestFetch(
      `/dromap_project_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&revision=neq.${encodeURIComponent(revision)}`,
      auth.accessToken,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    ).catch(() => null);

    return NextResponse.json({ ok: true, manifest });
  } catch {
    await removeRevisionChunks(auth.user.id, projectId, revision, auth.accessToken);
    return NextResponse.json({ error: "La sauvegarde en ligne est momentanément indisponible." }, { status: 503 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "La sauvegarde en ligne est momentanément indisponible." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { projectId } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { expectedRevision?: unknown; expectedUpdatedAt?: unknown; updatedAt?: unknown; deletedAt?: unknown; metadata?: unknown }
    | null;
  const expectedRevision = typeof body?.expectedRevision === "string" ? body.expectedRevision : "";
  const expectedUpdatedAt =
    body && Object.prototype.hasOwnProperty.call(body, "expectedUpdatedAt")
      ? typeof body.expectedUpdatedAt === "string"
        ? body.expectedUpdatedAt
        : body.expectedUpdatedAt === null
          ? null
          : undefined
      : undefined;
  const syncUpdatedAt = new Date().toISOString();
  const deletedAt = typeof body?.deletedAt === "string" ? body.deletedAt : null;
  const metadata = normalizeMetadata(body?.metadata);

  if (
    !projectId ||
    !validRevision(expectedRevision) ||
    expectedUpdatedAt === undefined ||
    (typeof expectedUpdatedAt === "string" && !expectedUpdatedAt)
  ) {
    return NextResponse.json({ error: "Projet invalide." }, { status: 400 });
  }

  try {
    const response = await supabaseRestFetch(
      `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&current_revision=eq.${encodeURIComponent(expectedRevision)}${typeof expectedUpdatedAt === "string" ? `&updated_at=eq.${encodeURIComponent(expectedUpdatedAt)}` : ""}&select=project_id,current_revision,chunk_count,encoding,updated_at,deleted_at,payload_size_bytes,metadata`,
      auth.accessToken,
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          updated_at: syncUpdatedAt,
          deleted_at: deletedAt,
          metadata,
        }),
      },
    );
    const rows = await parseJsonResponse<ProjectManifestRow[]>(response);
    const manifest = response.ok ? rowToManifest(rows?.[0]) : null;
    if (!manifest) {
      const current = await readCurrentManifest(auth.user.id, projectId, auth.accessToken);
      if (current) {
        return NextResponse.json(
          {
            error: "Ce projet a été modifié sur un autre appareil. Choisis la version à conserver.",
            current,
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: "Le projet n’a pas pu être synchronisé." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, manifest });
  } catch {
    return NextResponse.json({ error: "La synchronisation en ligne est momentanément indisponible." }, { status: 503 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "La sauvegarde en ligne est momentanément indisponible." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { projectId } = await context.params;

  try {
    const chunksResponse = await supabaseRestFetch(
      `/dromap_project_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
      auth.accessToken,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    if (!chunksResponse.ok) {
      const payload = await parseJsonResponse(chunksResponse);
      console.warn("DroMap: suppression des données du projet refusée", payload);
      return NextResponse.json({ error: "Le projet n’a pas pu être supprimé en ligne." }, { status: 502 });
    }

    const response = await supabaseRestFetch(
      `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
      auth.accessToken,
      { method: "DELETE", headers: { Prefer: "return=minimal" } },
    );
    if (!response.ok) {
      const payload = await parseJsonResponse(response);
      console.warn("DroMap: suppression du projet refusée", payload);
      return NextResponse.json({ error: "Le projet n’a pas pu être supprimé en ligne." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La suppression en ligne est momentanément indisponible." }, { status: 503 });
  }
}
