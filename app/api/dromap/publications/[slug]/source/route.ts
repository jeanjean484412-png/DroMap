import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { getDromapBillingAccessForSession } from "@/lib/dromap/server/billing";
import {
  dromapPublicationsConfigured,
  getPublicationViewerAccess,
  readSafePublicationSource,
  readPublicationBySlug,
} from "@/lib/dromap/server/publications";
import { createPublicationCopyProof } from "@/lib/dromap/server/publication-copy-proof";

async function handleGET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La bibliothèque publique n’est pas configurée." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });
  const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
  if (!billing) return NextResponse.json({ error: "Les droits ne peuvent pas être vérifiés." }, { status: 503 });

  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ error: "Carte publique invalide." }, { status: 400 });

  try {
    const row = await readPublicationBySlug(slug);
    if (!row) return NextResponse.json({ error: "Cette carte n’est plus publiée." }, { status: 404 });
    const viewerAccess = await getPublicationViewerAccess(row, auth.user.id, billing.plan);
    if (!viewerAccess.canEdit) {
      return NextResponse.json({ error: "Le créateur n’autorise pas la modification pour ton accès actuel." }, { status: 403 });
    }
    const source = await readSafePublicationSource(row, slug);
    const manifest = source?.manifest;
    if (!manifest) {
      return NextResponse.json({ error: "La version modifiable de cette publication n’est pas disponible. Le créateur doit mettre la publication à jour." }, { status: 409 });
    }
    return NextResponse.json({
      manifest,
      copyProof: createPublicationCopyProof(auth.user.id, slug),
      sourceName: typeof row.title === "string" ? row.title : "Carte publique",
      attribution: {
        publicationSlug: slug,
        creatorName: viewerAccess.creatorCreditName ?? "Utilisateur DroMap",
        allowRemoval: viewerAccess.allowCreatorCreditRemoval,
      },
      purchased: viewerAccess.purchased,
    });
  } catch {
    return NextResponse.json({ error: "La version modifiable est momentanément indisponible." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
