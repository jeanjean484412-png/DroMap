import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { markDromapSingleMapFirstDownload } from "@/lib/dromap/server/billing";
import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";

export const runtime = "nodejs";

async function handlePOST(request: Request) {
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { projectId?: unknown } | null;
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  if (!projectId || projectId.length > 180) {
    return NextResponse.json({ error: "Projet invalide." }, { status: 400 });
  }

  try {
    const ok = await markDromapSingleMapFirstDownload(auth.user.id, projectId);
    if (!ok) {
      return NextResponse.json(
        { error: "Aucun Export Max acheté n’est associé à cette carte." },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DroMap single-map first download:", error);
    return NextResponse.json(
      { error: "Le verrouillage de la zone n’a pas pu être enregistré." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
