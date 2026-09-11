import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

type ProjectUsageRow = {
  deleted_at?: unknown;
};

type StorageUsageRow = {
  project_bytes?: unknown;
  library_bytes?: unknown;
};

function safeBytes(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

async function handleGET() {
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      { error: "Les comptes DroMap sont momentanément indisponibles." },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const [projectsResponse, usageResponse] = await Promise.all([
      supabaseRestFetch(
        `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&select=deleted_at`,
        auth.accessToken,
        { method: "GET" },
      ),
      supabaseRestFetch(
        `/dromap_storage_usage?owner_id=eq.${encodeURIComponent(auth.user.id)}&select=project_bytes,library_bytes&limit=1`,
        auth.accessToken,
        { method: "GET" },
      ),
    ]);

    if (!projectsResponse.ok || !usageResponse.ok) {
      return NextResponse.json(
        { error: "L’utilisation du compte ne peut pas être calculée pour le moment." },
        { status: 502 },
      );
    }

    const projectRows = (await parseJsonResponse<ProjectUsageRow[]>(projectsResponse)) ?? [];
    const usageRows = (await parseJsonResponse<StorageUsageRow[]>(usageResponse)) ?? [];

    let activeProjects = 0;
    let trashedProjects = 0;
    const projectBytes = safeBytes(usageRows[0]?.project_bytes);
    for (const row of projectRows) {
      if (typeof row.deleted_at === "string" && row.deleted_at) trashedProjects += 1;
      else activeProjects += 1;
    }

    const libraryBytes = safeBytes(usageRows[0]?.library_bytes);
    return NextResponse.json({
      activeProjects,
      trashedProjects,
      projectBytes,
      libraryBytes,
      totalBytes: projectBytes + libraryBytes,
    });
  } catch {
    return NextResponse.json(
      { error: "L’utilisation du compte ne peut pas être calculée pour le moment." },
      { status: 503 },
    );
  }
}

export const GET = withRequestSecurity(handleGET);
