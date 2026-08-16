import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  getSupabaseConfig,
  parseJsonResponse,
  supabaseRestFetch,
} from "@/lib/dromap/server/supabase-rest";

type ProjectUsageRow = {
  payload_size_bytes?: unknown;
  deleted_at?: unknown;
};

type LibraryUsageRow = {
  payload_size_bytes?: unknown;
};

function safeBytes(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

export async function GET() {
  if (!getSupabaseConfig()) {
    return NextResponse.json(
      { error: "Les comptes DroMap sont momentanément indisponibles." },
      { status: 503 },
    );
  }

  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  try {
    const [projectsResponse, libraryResponse] = await Promise.all([
      supabaseRestFetch(
        `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&select=payload_size_bytes,deleted_at`,
        auth.accessToken,
        { method: "GET" },
      ),
      supabaseRestFetch(
        `/dromap_personal_library?owner_id=eq.${encodeURIComponent(auth.user.id)}&select=payload_size_bytes&limit=1`,
        auth.accessToken,
        { method: "GET" },
      ),
    ]);

    if (!projectsResponse.ok) {
      return NextResponse.json(
        { error: "L’utilisation du compte ne peut pas être calculée pour le moment." },
        { status: 502 },
      );
    }

    const projectRows = (await parseJsonResponse<ProjectUsageRow[]>(projectsResponse)) ?? [];
    const libraryRows = libraryResponse.ok
      ? (await parseJsonResponse<LibraryUsageRow[]>(libraryResponse)) ?? []
      : [];

    let activeProjects = 0;
    let trashedProjects = 0;
    let projectBytes = 0;
    for (const row of projectRows) {
      projectBytes += safeBytes(row.payload_size_bytes);
      if (typeof row.deleted_at === "string" && row.deleted_at) trashedProjects += 1;
      else activeProjects += 1;
    }

    const libraryBytes = safeBytes(libraryRows[0]?.payload_size_bytes);
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
