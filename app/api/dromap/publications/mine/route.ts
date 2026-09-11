import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import {
  getAuthenticatedRequestUser,
  parseJsonResponse,
} from "@/lib/dromap/server/supabase-rest";
import {
  dromapPublicationsConfigured,
  publicationsAdminFetch,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";

async function handleGET() {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La publication n’est pas encore configurée." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ publications: [] });

  try {
    const response = await publicationsAdminFetch(
      `/dromap_publications?owner_id=eq.${encodeURIComponent(auth.user.id)}&select=project_id,slug,title,published_at,updated_at&order=published_at.desc`,
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : null;
    if (!response.ok || !rows) {
      return NextResponse.json({ error: "Les publications du compte ne peuvent pas être chargées." }, { status: 502 });
    }
    const publications = rows.flatMap((row) => {
      const projectId = typeof row.project_id === "string" ? row.project_id : "";
      const slug = typeof row.slug === "string" ? row.slug : "";
      if (!projectId || !slug) return [];
      return [{
        projectId,
        slug,
        title: typeof row.title === "string" ? row.title : "Carte publique",
        publishedAt: typeof row.published_at === "string" ? row.published_at : "",
        updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
      }];
    });
    return NextResponse.json({ publications });
  } catch {
    return NextResponse.json({ error: "Les publications du compte sont momentanément indisponibles." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
