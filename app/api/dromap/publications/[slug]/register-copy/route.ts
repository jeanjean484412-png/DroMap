import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";
import { verifyPublicationCopyProof } from "@/lib/dromap/server/publication-copy-proof";

import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import {
  getDromapBillingAccessForSession,
  grantDromapPublicMapProjectExport,
  userOwnsDromapProject,
} from "@/lib/dromap/server/billing";
import {
  getPublicationViewerAccess,
  readPublicationBySlug,
} from "@/lib/dromap/server/publications";

async function handlePOST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
  if (!billing) return NextResponse.json({ error: "Les droits ne peuvent pas être vérifiés." }, { status: 503 });
  const { slug } = await context.params;
  const body = (await request.json().catch(() => null)) as { projectId?: unknown; copyToken?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!slug || !projectId) return NextResponse.json({ error: "Copie invalide." }, { status: 400 });
  if (!verifyPublicationCopyProof(body?.copyToken, auth.user.id, slug, projectId)) {
    return NextResponse.json({ error: "Copie invalide." }, { status: 403 });
  }

  try {
    const row = await readPublicationBySlug(slug);
    if (!row) return NextResponse.json({ error: "Cette carte n’est plus publiée." }, { status: 404 });
    const viewerAccess = await getPublicationViewerAccess(row, auth.user.id, billing.plan);
    if (!viewerAccess.canEdit) {
      return NextResponse.json({ error: "Le créateur n’autorise pas la modification pour ton accès actuel." }, { status: 403 });
    }
    const ownsProject = await userOwnsDromapProject(auth.user.id, projectId);
    if (!ownsProject) {
      return NextResponse.json({ error: "La copie doit d’abord être enregistrée en ligne." }, { status: 409 });
    }

    let exportEntitlementGranted = false;
    if (viewerAccess.purchased) {
      exportEntitlementGranted = await grantDromapPublicMapProjectExport(auth.user.id, projectId);
    }
    return NextResponse.json({ ok: true, exportEntitlementGranted });
  } catch {
    return NextResponse.json({ error: "La copie n’a pas pu être finalisée." }, { status: 503 });
  }
}

export const POST = withRequestSecurity(handlePOST);
