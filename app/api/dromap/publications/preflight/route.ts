import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";
import { getDromapBillingAccessForSession, userOwnsDromapProject } from "@/lib/dromap/server/billing";
import { publicationsAdminFetch, dromapPublicationsConfigured } from "@/lib/dromap/server/publications";
import {
  dromapPublicationModeAllowsEdit,
  isDromapSubscriberPlan,
  normalizeDromapPublicationAccessMode,
} from "@/lib/dromap/publications";

type RestErrorPayload = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

async function readRestError(response: Response) {
  const payload = (await response.clone().json().catch(() => null)) as RestErrorPayload | null;
  const code = typeof payload?.code === "string" ? payload.code : "";
  const message = typeof payload?.message === "string" ? payload.message : "";
  const details = typeof payload?.details === "string" ? payload.details : "";
  return { code, message, details, text: `${code} ${message} ${details}`.toLowerCase() };
}

function migrationErrorMessage(errorText: string) {
  if (
    errorText.includes("dromap_publications") &&
    (errorText.includes("does not exist") || errorText.includes("42p01"))
  ) {
    return "La base Supabase des publications n’est pas installée. Exécute la migration consolidée V18.12 dans Supabase puis réessaie.";
  }
  if (
    errorText.includes("pgrst204") ||
    errorText.includes("42703") ||
    errorText.includes("access_mode") ||
    errorText.includes("creator_credit_name") ||
    errorText.includes("source_revision") ||
    errorText.includes("schema cache")
  ) {
    return "La migration Supabase des droits de publication n’est pas à jour. Exécute la migration consolidée V18.12 dans Supabase puis réessaie.";
  }
  return "La configuration Supabase des publications ne peut pas être vérifiée pour le moment.";
}

async function handleGET(request: Request) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La publication n’est pas encore configurée côté serveur." }, { status: 503 });
  }

  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
  if (!billing) {
    return NextResponse.json({ error: "Les droits de publication ne peuvent pas être vérifiés pour le moment." }, { status: 503 });
  }
  if (!isDromapSubscriberPlan(billing.plan)) {
    return NextResponse.json({ error: "La publication de cartes est réservée aux abonnements Plus et Pro." }, { status: 403 });
  }

  const url = new URL(request.url);
  const projectId = (url.searchParams.get("projectId") ?? "").trim();
  const accessMode = normalizeDromapPublicationAccessMode(url.searchParams.get("accessMode"));
  if (!projectId) return NextResponse.json({ error: "Projet introuvable." }, { status: 400 });

  const ownsProject = await userOwnsDromapProject(auth.user.id, projectId);
  if (!ownsProject) {
    return NextResponse.json(
      { error: "Le projet doit être sauvegardé en ligne et ne pas être dans la corbeille avant publication." },
      { status: 404 },
    );
  }

  const schemaResponse = await publicationsAdminFetch(
    "/dromap_publications?select=slug,access_mode,allow_creator_credit_removal,creator_credit_name,source_revision,source_chunk_count,source_encoding,source_payload_size_bytes&limit=1",
    { method: "GET" },
  );
  if (!schemaResponse.ok) {
    const restError = await readRestError(schemaResponse);
    console.error("DroMap publication preflight schema:", schemaResponse.status, restError);
    return NextResponse.json({ error: migrationErrorMessage(restError.text) }, { status: 503 });
  }

  if (dromapPublicationModeAllowsEdit(accessMode)) {
    const sourceResponse = await publicationsAdminFetch(
      "/dromap_publication_source_chunks?select=publication_slug&limit=1",
      { method: "GET" },
    );
    if (!sourceResponse.ok) {
      const restError = await readRestError(sourceResponse);
      console.error("DroMap publication preflight source:", sourceResponse.status, restError);
      return NextResponse.json(
        { error: "La partie Supabase qui permet les copies modifiables n’est pas installée. Exécute la migration consolidée V18.12 puis réessaie." },
        { status: 503 },
      );
    }

    const manifestResponse = await publicationsAdminFetch(
      `/dromap_projects?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&deleted_at=is.null&select=current_revision,chunk_count,encoding&limit=1`,
      { method: "GET" },
    );
    const manifests = manifestResponse.ok
      ? ((await manifestResponse.clone().json().catch(() => null)) as Array<{ current_revision?: unknown; chunk_count?: unknown; encoding?: unknown }> | null)
      : null;
    const manifest = manifests?.[0];
    const revision = typeof manifest?.current_revision === "string" ? manifest.current_revision.trim() : "";
    const chunkCount = typeof manifest?.chunk_count === "number" ? manifest.chunk_count : 0;
    const encoding = manifest?.encoding;
    if (!manifestResponse.ok || !revision || !Number.isInteger(chunkCount) || chunkCount < 1 || (encoding !== "gzip-base64" && encoding !== "base64")) {
      return NextResponse.json(
        { error: "Le projet n’est pas encore complètement sauvegardé en ligne. Enregistre-le, attends la fin de la synchronisation puis réessaie." },
        { status: 409 },
      );
    }

    const firstChunkResponse = await publicationsAdminFetch(
      `/dromap_project_chunks?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}&revision=eq.${encodeURIComponent(revision)}&select=chunk_index,chunk_data&order=chunk_index.asc&limit=1`,
      { method: "GET" },
    );
    const firstChunks = firstChunkResponse.ok
      ? ((await firstChunkResponse.clone().json().catch(() => null)) as Array<{ chunk_index?: unknown; chunk_data?: unknown }> | null)
      : null;
    const firstChunk = firstChunks?.[0];
    if (!firstChunkResponse.ok || firstChunk?.chunk_index !== 0 || typeof firstChunk?.chunk_data !== "string") {
      return NextResponse.json(
        { error: "La sauvegarde en ligne du projet est incomplète. Enregistre le projet, attends quelques secondes puis réessaie la publication modifiable." },
        { status: 409 },
      );
    }
  }

  return NextResponse.json({ ok: true });
}

export const GET = withRequestSecurity(handleGET);
