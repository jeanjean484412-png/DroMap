import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { getDromapBillingAccessForSession } from "@/lib/dromap/server/billing";
import {
  getPublicationViewerAccess,
  readSafePublicationSource,
  readPublicationBySlug,
} from "@/lib/dromap/server/publications";

async function handleGET(
  _request: Request,
  context: { params: Promise<{ slug: string; chunkIndex: string }> },
) {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
  if (!billing) return NextResponse.json({ error: "Les droits ne peuvent pas être vérifiés." }, { status: 503 });

  const { slug, chunkIndex } = await context.params;
  const index = Number(chunkIndex);
  if (!slug || !Number.isInteger(index) || index < 0) {
    return NextResponse.json({ error: "Fragment invalide." }, { status: 400 });
  }

  try {
    const row = await readPublicationBySlug(slug);
    if (!row) return NextResponse.json({ error: "Cette carte n’est plus publiée." }, { status: 404 });
    const viewerAccess = await getPublicationViewerAccess(row, auth.user.id, billing.plan);
    if (!viewerAccess.canEdit) {
      return NextResponse.json({ error: "Modification non autorisée." }, { status: 403 });
    }
    const source = await readSafePublicationSource(row, slug);
    const manifest = source?.manifest;
    if (!manifest || index >= manifest.chunkCount) {
      return NextResponse.json({ error: "Fragment introuvable." }, { status: 404 });
    }
    const chunk = source?.chunks[index];
    if (typeof chunk !== "string") return NextResponse.json({ error: "Fragment introuvable." }, { status: 404 });
    return NextResponse.json({ chunk });
  } catch {
    return NextResponse.json({ error: "La version modifiable est momentanément indisponible." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
