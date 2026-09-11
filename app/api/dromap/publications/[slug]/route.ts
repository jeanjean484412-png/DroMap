import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getAuthenticatedRequestUser, parseJsonResponse } from "@/lib/dromap/server/supabase-rest";
import { getDromapBillingAccessForSession } from "@/lib/dromap/server/billing";
import {
  dromapPublicationsConfigured,
  getPublicationViewerAccess,
  publicationRowToPublicWithImageRoutes,
  publicationsAdminFetch,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";

async function handleGET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La bibliothèque publique n’est pas encore configurée." }, { status: 503 });
  }
  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ error: "Carte publique invalide." }, { status: 400 });

  try {
    const response = await publicationsAdminFetch(
      `/dromap_publications?slug=eq.${encodeURIComponent(slug)}&select=owner_id,project_id,slug,title,description,author_name,tags,access_mode,allow_creator_credit_removal,creator_credit_name,published_at,updated_at&limit=1`,
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : [];
    const row = rows?.[0] ?? null;
    const publication = publicationRowToPublicWithImageRoutes(row, { includePreview: true });
    if (!row || !publication) {
      return NextResponse.json({ error: "Cette carte n’est plus publiée." }, { status: 404 });
    }

    const auth = await getAuthenticatedRequestUser();
    const billing = auth
      ? await getDromapBillingAccessForSession(auth.accessToken, auth.user.id)
      : null;
    const viewerAccess = await getPublicationViewerAccess(
      row,
      auth?.user.id ?? null,
      billing?.plan ?? null,
    );

    return NextResponse.json({ publication, viewerAccess });
  } catch {
    return NextResponse.json({ error: "Cette carte publique est momentanément indisponible." }, { status: 503 });
  }
}

async function handleDELETE(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La publication n’est pas encore configurée." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ error: "Carte publique invalide." }, { status: 400 });

  try {
    const response = await publicationsAdminFetch(
      `/dromap_publications?owner_id=eq.${encodeURIComponent(auth.user.id)}&slug=eq.${encodeURIComponent(slug)}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    );
    if (!response.ok) {
      return NextResponse.json({ error: "La carte n’a pas pu être retirée de la publication." }, { status: 502 });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "La publication est momentanément indisponible." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
export const DELETE = withRequestSecurity(handleDELETE);
