import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getAuthenticatedRequestUser, parseJsonResponse } from "@/lib/dromap/server/supabase-rest";
import {
  dromapPublicationsConfigured,
  publicationRowToPublicWithImageRoutes,
  publicationsAdminFetch,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";

async function handleGET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La publication n’est pas encore configurée." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { projectId } = await context.params;
  if (!projectId) return NextResponse.json({ error: "Projet invalide." }, { status: 400 });

  try {
    const response = await publicationsAdminFetch(
      `/dromap_publications?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&select=slug,title,description,author_name,tags,access_mode,allow_creator_credit_removal,creator_credit_name,published_at,updated_at&limit=1`,
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : [];
    const publication = publicationRowToPublicWithImageRoutes(rows?.[0]);
    return NextResponse.json({ publication });
  } catch {
    return NextResponse.json({ error: "L’état de publication ne peut pas être chargé." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
