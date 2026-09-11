import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { NextResponse } from "next/server";

import { decodeSupportedImageDataUrl } from "@/lib/dromap/server/image-data-url";

import {
  getAuthenticatedRequestUser,
  parseJsonResponse,
} from "@/lib/dromap/server/supabase-rest";
import {
  createUniquePublicationSlug,
  dromapPublicationsConfigured,
  freezePublicationSourceFromProject,
  publicationRowToPublic,
  publicationRowToPublicWithImageRoutes,
  publicationsAdminFetch,
  readOwnedPublication,
  readPublicationBySlug,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";
import {
  getDromapBillingAccessForSession,
  userOwnsDromapProject,
} from "@/lib/dromap/server/billing";
import {
  dromapPublicationModeAllowsEdit,
  dromapPublicationModeAllowsExport,
  isDromapSubscriberPlan,
  normalizeDromapPublicationAccessMode,
  normalizeDromapPublicationTags,
} from "@/lib/dromap/publications";

const MAX_TITLE = 120;
const MAX_DESCRIPTION = 800;
const MAX_AUTHOR = 100;
const MAX_THUMBNAIL_DATA_URL = 500_000;
const MAX_PREVIEW_DATA_URL = 1_200_000;
const MAX_IMAGE_DATA_URL = 2_100_000;

type SupabaseWriteError = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

async function readPublicationWriteError(response: Response, fallback: string) {
  const payload = (await response.clone().json().catch(() => null)) as SupabaseWriteError | null;
  const code = typeof payload?.code === "string" ? payload.code : "";
  const message = typeof payload?.message === "string" ? payload.message : "";
  const details = typeof payload?.details === "string" ? payload.details : "";
  const combined = `${code} ${message} ${details}`.toLowerCase();

  console.error("DroMap publication Supabase write:", response.status, { code, message, details });

  if (combined.includes("42p01") || (combined.includes("dromap_publications") && combined.includes("does not exist"))) {
    return "La table Supabase des publications n’est pas installée. Exécute la migration consolidée V18.12 puis réessaie.";
  }
  if (
    combined.includes("pgrst204") ||
    combined.includes("42703") ||
    combined.includes("schema cache") ||
    combined.includes("access_mode") ||
    combined.includes("creator_credit_name") ||
    combined.includes("source_revision")
  ) {
    return "La base Supabase n’est pas à jour pour les droits de publication. Exécute la migration consolidée V18.12 puis réessaie.";
  }
  if (combined.includes("23503")) {
    return "Le projet n’est pas encore correctement enregistré dans Supabase. Enregistre-le, attends la synchronisation puis réessaie.";
  }
  if (combined.includes("23514")) {
    return "Supabase a refusé une donnée de publication. La migration V18.12 doit être appliquée avant de réessayer.";
  }
  return fallback;
}

function unexpectedPublicationErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "PUBLICATION_SOURCE_MANIFEST_INVALID") {
    return "La copie modifiable ne peut pas encore être créée : la sauvegarde en ligne du projet n’est pas complète. Enregistre le projet, attends quelques secondes puis réessaie.";
  }
  if (code === "PUBLICATION_SOURCE_CHUNKS_INCOMPLETE") {
    return "La copie modifiable ne peut pas encore être créée : certains morceaux du projet manquent dans Supabase. Enregistre le projet, attends la fin de la synchronisation puis réessaie.";
  }
  if (code === "PUBLICATION_SOURCE_CHUNK_INVALID") {
    return "La copie modifiable ne peut pas être créée car une partie du projet sauvegardé est invalide.";
  }
  if (code === "PUBLICATION_SOURCE_CHUNK_SAVE_FAILED") {
    return "Supabase a refusé l’enregistrement d’une partie de la copie modifiable. Réessaie ; si le problème persiste, vérifie la migration V18.12.";
  }
  if (code === "PUBLICATION_SOURCE_MANIFEST_SAVE_FAILED") {
    return "Supabase a refusé de finaliser la copie modifiable de la publication.";
  }
  if (code === "PUBLICATIONS_NOT_CONFIGURED") {
    return "La publication n’est pas configurée côté serveur.";
  }
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "Supabase a mis trop de temps à répondre pendant la publication. Réessaie dans quelques instants.";
  }
  return "La publication est momentanément indisponible.";
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().replace(/\r\n/g, "\n").slice(0, maxLength) : "";
}

async function validImageDataUrl(
  value: string,
  maxLength: number,
  allowedTypes: readonly ("jpeg" | "webp")[],
) {
  if (value.length <= 32 || value.length > maxLength) return false;
  return Boolean(await decodeSupportedImageDataUrl(value, { maxLength, allowedTypes }));
}

async function handleGET() {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La bibliothèque publique n’est pas encore configurée." }, { status: 503 });
  }

  try {
    const response = await publicationsAdminFetch(
      "/dromap_publications?select=slug,title,description,author_name,tags,access_mode,allow_creator_credit_removal,creator_credit_name,published_at,updated_at&order=published_at.desc&limit=120",
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : null;
    if (!response.ok || !rows) {
      return NextResponse.json({ error: "La bibliothèque publique ne peut pas être chargée." }, { status: 502 });
    }
    const publications = rows
      .map((row) => publicationRowToPublicWithImageRoutes(row))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    return NextResponse.json({ publications });
  } catch {
    return NextResponse.json({ error: "La bibliothèque publique est momentanément indisponible." }, { status: 503 });
  }
}

async function handlePOST(request: Request) {
  if (!dromapPublicationsConfigured()) {
    return NextResponse.json({ error: "La publication n’est pas encore configurée." }, { status: 503 });
  }
  const auth = await getAuthenticatedRequestUser();
  if (!auth) return NextResponse.json({ error: "Connexion requise." }, { status: 401 });

  const billing = await getDromapBillingAccessForSession(auth.accessToken, auth.user.id);
  if (!billing) {
    return NextResponse.json({ error: "Les droits de publication ne peuvent pas être vérifiés pour le moment." }, { status: 503 });
  }
  if (!isDromapSubscriberPlan(billing.plan)) {
    return NextResponse.json(
      { error: "La publication de cartes est réservée aux abonnements Plus et Pro." },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | {
        projectId?: unknown;
        title?: unknown;
        description?: unknown;
        authorName?: unknown;
        creatorCreditName?: unknown;
        accessMode?: unknown;
        allowCreatorCreditRemoval?: unknown;
        tags?: unknown;
        thumbnailDataUrl?: unknown;
        previewDataUrl?: unknown;
        imageDataUrl?: unknown;
      }
    | null;

  const projectId = cleanText(body?.projectId, 220);
  const title = cleanText(body?.title, MAX_TITLE);
  const description = cleanText(body?.description, MAX_DESCRIPTION);
  const authorName = cleanText(body?.authorName, MAX_AUTHOR) || null;
  const creatorCreditName = cleanText(body?.creatorCreditName, MAX_AUTHOR) || null;
  const accessMode = normalizeDromapPublicationAccessMode(body?.accessMode);
  const allowCreatorCreditRemoval =
    dromapPublicationModeAllowsExport(accessMode) && body?.allowCreatorCreditRemoval === true;
  const tags = normalizeDromapPublicationTags(body?.tags);
  const thumbnailDataUrl = cleanText(body?.thumbnailDataUrl, MAX_THUMBNAIL_DATA_URL + 1);
  const previewDataUrl = cleanText(body?.previewDataUrl, MAX_PREVIEW_DATA_URL + 1);
  const imageDataUrl = cleanText(body?.imageDataUrl, MAX_IMAGE_DATA_URL + 1);

  if (!projectId || title.length < 1) {
    return NextResponse.json({ error: "Le projet et le titre sont obligatoires." }, { status: 400 });
  }
  if (dromapPublicationModeAllowsExport(accessMode) && !creatorCreditName) {
    return NextResponse.json({ error: "Un nom de créateur est nécessaire pour autoriser l’export." }, { status: 400 });
  }
  if (!await validImageDataUrl(thumbnailDataUrl, MAX_THUMBNAIL_DATA_URL, ["jpeg", "webp"])) {
    return NextResponse.json({ error: "La miniature publique est invalide ou trop volumineuse." }, { status: 413 });
  }
  if (!await validImageDataUrl(previewDataUrl, MAX_PREVIEW_DATA_URL, ["jpeg", "webp"])) {
    return NextResponse.json({ error: "L’aperçu public est invalide ou trop volumineux." }, { status: 413 });
  }
  if (!await validImageDataUrl(imageDataUrl, MAX_IMAGE_DATA_URL, ["jpeg"])) {
    return NextResponse.json({ error: "Le rendu public est invalide ou trop volumineux." }, { status: 413 });
  }

  const ownsProject = await userOwnsDromapProject(auth.user.id, projectId);
  if (!ownsProject) {
    return NextResponse.json(
      { error: "Le projet doit être sauvegardé en ligne et ne pas être dans la corbeille avant publication." },
      { status: 404 },
    );
  }

  try {
    const existing = await readOwnedPublication(auth.user.id, projectId);
    const now = new Date().toISOString();

    if (existing && typeof existing.slug === "string") {
      const slug = existing.slug;
      // Pour une carte modifiable, figer d’abord la version exacte du projet.
      // Si cette étape échoue, les droits publics existants ne sont pas modifiés.
      if (dromapPublicationModeAllowsEdit(accessMode)) {
        await freezePublicationSourceFromProject(auth.user.id, projectId, slug);
      }
      const response = await publicationsAdminFetch(
        `/dromap_publications?owner_id=eq.${encodeURIComponent(auth.user.id)}&project_id=eq.${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            title,
            description,
            author_name: authorName,
            tags,
            thumbnail_data_url: thumbnailDataUrl,
            preview_data_url: previewDataUrl,
            image_data_url: imageDataUrl,
            image_mime_type: "image/jpeg",
            access_mode: accessMode,
            allow_creator_credit_removal: allowCreatorCreditRemoval,
            creator_credit_name: dromapPublicationModeAllowsExport(accessMode) ? creatorCreditName : null,
            updated_at: now,
          }),
        },
      );
      if (!response.ok) {
        return NextResponse.json(
          { error: await readPublicationWriteError(response, "La publication n’a pas pu être mise à jour.") },
          { status: 502 },
        );
      }
      const publication = publicationRowToPublic(await readPublicationBySlug(slug));
      if (!publication) {
        return NextResponse.json({ error: "La publication n’a pas pu être relue." }, { status: 502 });
      }
      return NextResponse.json({ ok: true, publication, updated: true });
    }

    const slug = await createUniquePublicationSlug(title);
    const response = await publicationsAdminFetch("/dromap_publications", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        owner_id: auth.user.id,
        project_id: projectId,
        slug,
        title,
        description,
        author_name: authorName,
        tags,
        thumbnail_data_url: thumbnailDataUrl,
        preview_data_url: previewDataUrl,
        image_data_url: imageDataUrl,
        image_mime_type: "image/jpeg",
        access_mode: accessMode,
        allow_creator_credit_removal: allowCreatorCreditRemoval,
        creator_credit_name: dromapPublicationModeAllowsExport(accessMode) ? creatorCreditName : null,
        published_at: now,
        updated_at: now,
      }),
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: await readPublicationWriteError(response, "La carte n’a pas pu être publiée.") },
        { status: 502 },
      );
    }

    try {
      if (dromapPublicationModeAllowsEdit(accessMode)) {
        await freezePublicationSourceFromProject(auth.user.id, projectId, slug);
      }
    } catch (sourceError) {
      await publicationsAdminFetch(`/dromap_publications?slug=eq.${encodeURIComponent(slug)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      }).catch(() => null);
      throw sourceError;
    }

    const publication = publicationRowToPublic(await readPublicationBySlug(slug));
    if (!publication) {
      return NextResponse.json({ error: "La carte n’a pas pu être publiée." }, { status: 502 });
    }
    return NextResponse.json({ ok: true, publication, updated: false });
  } catch (error) {
    console.error("DroMap publication:", error);
    return NextResponse.json({ error: unexpectedPublicationErrorMessage(error) }, { status: 503 });
  }
}

export const GET = withRequestSecurity(handleGET);
export const POST = withRequestSecurity(handlePOST);
