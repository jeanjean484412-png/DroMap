import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { decodeSupportedImageDataUrl } from "@/lib/dromap/server/image-data-url";
import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { getDromapBillingAccessForSession } from "@/lib/dromap/server/billing";
import {
  dromapPublicationsConfigured,
  getPublicationViewerAccess,
  readPublicationBySlug,
} from "@/lib/dromap/server/publications";

function safeFileName(value: unknown) {
  const title = typeof value === "string" ? value : "carte-dromap";
  const normalized = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized || "carte-dromap";
}

async function handleGET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La bibliothèque publique n’est pas encore configurée." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) {
    return NextResponse.json(
      { error: "Connecte-toi ou achète l’accès à cette carte pour l’exporter." },
      { status: 401 },
    );
  }
  const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
  if (!billing) {
    return NextResponse.json({ error: "Les droits d’export ne peuvent pas être vérifiés." }, { status: 503 });
  }

  const { slug } = await context.params;
  if (!slug) return NextResponse.json({ error: "Carte publique invalide." }, { status: 400 });

  try {
    const row = await readPublicationBySlug(slug, { includeImage: true });
    if (!row) return NextResponse.json({ error: "Cette carte n’est plus disponible." }, { status: 404 });
    const viewerAccess = await getPublicationViewerAccess(row, auth.user.id, billing.plan);
    if (!viewerAccess.canExport) {
      return NextResponse.json(
        { error: "Le créateur n’autorise pas l’export pour ton accès actuel." },
        { status: 403 },
      );
    }

    const image = await decodeSupportedImageDataUrl(row.image_data_url, { allowedTypes: ["jpeg"] });
    if (!image) return NextResponse.json({ error: "Cette carte n’est plus disponible." }, { status: 404 });
    const { bytes } = image;
    const title = safeFileName(row.title);
    return new Response(Uint8Array.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `attachment; filename="${title}.jpg"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "L’export est momentanément indisponible." }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
