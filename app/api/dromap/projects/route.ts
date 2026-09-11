import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

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

async function handleGET() {
  if (!getSupabaseConfig()) {
    return NextResponse.json({ error: "La sauvegarde en ligne est momentanément indisponible." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const response = await supabaseRestFetch(
      `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&select=project_id,current_revision,chunk_count,encoding,updated_at,deleted_at,payload_size_bytes,metadata&order=updated_at.desc`,
      auth.accessToken,
      { method: "GET" },
    );
    const rows = await parseJsonResponse<ProjectManifestRow[]>(response);
    if (!response.ok || !rows) {
      return NextResponse.json({ error: "Les projets en ligne n’ont pas pu être chargés." }, { status: 502 });
    }

    const manifests = rows.flatMap((row) => {
      if (
        typeof row.project_id !== "string" ||
        typeof row.current_revision !== "string" ||
        typeof row.chunk_count !== "number" ||
        !Number.isInteger(row.chunk_count) ||
        row.chunk_count <= 0 ||
        (row.encoding !== "gzip-base64" && row.encoding !== "base64")
      ) {
        return [];
      }
      return [{
        projectId: row.project_id,
        revision: row.current_revision,
        chunkCount: row.chunk_count,
        encoding: row.encoding,
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
        deletedAt: typeof row.deleted_at === "string" ? row.deleted_at : null,
        payloadSizeBytes: typeof row.payload_size_bytes === "number" ? row.payload_size_bytes : 0,
        metadata:
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? row.metadata
            : {},
      }];
    });
    return NextResponse.json({ manifests });
  } catch {
    return NextResponse.json({ error: "Les projets en ligne sont momentanément indisponibles." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
