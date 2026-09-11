import "server-only";
import { randomUUID } from "node:crypto";
import { sanitizePublicationChunks } from "./publication-content";

import type Stripe from "stripe";

import {
  getSupabaseAdminKey,
  getSupabaseConfig,
  parseJsonResponse,
} from "@/lib/dromap/server/supabase-rest";
import type { DromapAccountPlan } from "@/lib/dromap/plans";
import {
  dromapPublicationModeAllowsEdit,
  dromapPublicationModeAllowsExport,
  isDromapSubscriberPlan,
  normalizeDromapPublicationAccessMode,
  type DromapPublicationAccessMode,
  type DromapPublicationViewerAccess,
  type DromapPublicPublication,
} from "@/lib/dromap/publications";

export type DromapPublicationRow = {
  owner_id?: unknown;
  project_id?: unknown;
  slug?: unknown;
  title?: unknown;
  description?: unknown;
  author_name?: unknown;
  tags?: unknown;
  thumbnail_data_url?: unknown;
  preview_data_url?: unknown;
  image_data_url?: unknown;
  image_mime_type?: unknown;
  access_mode?: unknown;
  allow_creator_credit_removal?: unknown;
  creator_credit_name?: unknown;
  source_revision?: unknown;
  source_chunk_count?: unknown;
  source_encoding?: unknown;
  source_payload_size_bytes?: unknown;
  published_at?: unknown;
  updated_at?: unknown;
};

type PublicationEntitlementRow = {
  buyer_id?: unknown;
  publication_slug?: unknown;
  access_mode?: unknown;
  allow_creator_credit_removal?: unknown;
  creator_credit_name?: unknown;
  stripe_checkout_session_id?: unknown;
  purchased_at?: unknown;
};

type ProjectManifestRow = {
  current_revision?: unknown;
  chunk_count?: unknown;
  encoding?: unknown;
  payload_size_bytes?: unknown;
};

type ProjectChunkRow = {
  chunk_index?: unknown;
  chunk_data?: unknown;
};

type PublicationSourceChunkRow = {
  chunk_index?: unknown;
  chunk?: unknown;
};

export type DromapPublicationSourceManifest = {
  revision: string;
  chunkCount: number;
  encoding: "gzip-base64" | "base64";
  payloadSizeBytes: number;
};

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeTags(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
        .map((item) => item.trim())
        .slice(0, 8)
    : [];
}

export function publicationRowToPublic(
  row: DromapPublicationRow | null | undefined,
  options: { includePreview?: boolean; includeImage?: boolean } = {},
): DromapPublicPublication | null {
  const slug = cleanString(row?.slug);
  const title = cleanString(row?.title);
  const thumbnailDataUrl = cleanString(row?.thumbnail_data_url);
  const publishedAt = cleanString(row?.published_at);
  const updatedAt = cleanString(row?.updated_at);
  if (!slug || !title || !thumbnailDataUrl || !publishedAt || !updatedAt) return null;

  const publication: DromapPublicPublication = {
    slug,
    title,
    description: cleanString(row?.description) ?? "",
    authorName: cleanString(row?.author_name),
    tags: normalizeTags(row?.tags),
    thumbnailDataUrl,
    accessMode: normalizeDromapPublicationAccessMode(row?.access_mode),
    allowCreatorCreditRemoval: row?.allow_creator_credit_removal === true,
    creatorCreditName: cleanString(row?.creator_credit_name),
    publishedAt,
    updatedAt,
  };
  if (options.includePreview) {
    const previewDataUrl = cleanString(row?.preview_data_url);
    if (!previewDataUrl) return null;
    publication.previewDataUrl = previewDataUrl;
  }
  if (options.includeImage) {
    const imageDataUrl = cleanString(row?.image_data_url);
    if (!imageDataUrl) return null;
    publication.imageDataUrl = imageDataUrl;
    publication.imageMimeType = "image/jpeg";
  }
  return publication;
}


export function publicationRowToPublicWithImageRoutes(
  row: DromapPublicationRow | null | undefined,
  options: { includePreview?: boolean } = {},
): DromapPublicPublication | null {
  const slug = cleanString(row?.slug);
  const title = cleanString(row?.title);
  const publishedAt = cleanString(row?.published_at);
  const updatedAt = cleanString(row?.updated_at);
  if (!slug || !title || !publishedAt || !updatedAt) return null;

  const encodedSlug = encodeURIComponent(slug);
  const version = encodeURIComponent(updatedAt);
  const publication: DromapPublicPublication = {
    slug,
    title,
    description: cleanString(row?.description) ?? "",
    authorName: cleanString(row?.author_name),
    tags: normalizeTags(row?.tags),
    // Le nom historique thumbnailDataUrl est conservé pour compatibilité,
    // mais les pages publiques reçoivent maintenant une URL binaire cacheable
    // au lieu d'un gros data: URL inclus dans le JSON/HTML.
    thumbnailDataUrl: `/library/${encodedSlug}/share-image?v=${version}`,
    accessMode: normalizeDromapPublicationAccessMode(row?.access_mode),
    allowCreatorCreditRemoval: row?.allow_creator_credit_removal === true,
    creatorCreditName: cleanString(row?.creator_credit_name),
    publishedAt,
    updatedAt,
  };

  if (options.includePreview) {
    publication.previewDataUrl = `/library/${encodedSlug}/preview-image?v=${version}`;
  }
  return publication;
}

function adminHeaders(body = false) {
  const config = getSupabaseConfig();
  const adminKey = getSupabaseAdminKey();
  if (!config || !adminKey) return null;
  const headers = new Headers();
  headers.set("apikey", adminKey);
  if (!adminKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${adminKey}`);
  }
  if (body) headers.set("Content-Type", "application/json");
  return { config, headers };
}

export function dromapPublicationsConfigured() {
  return Boolean(getSupabaseConfig() && getSupabaseAdminKey());
}

export async function publicationsAdminFetch(path: string, init: RequestInit = {}) {
  const setup = adminHeaders(Boolean(init.body));
  if (!setup) throw new Error("PUBLICATIONS_NOT_CONFIGURED");
  const headers = new Headers(setup.headers);
  for (const [key, value] of new Headers(init.headers).entries()) headers.set(key, value);
  return fetch(`${setup.config.url}/rest/v1${path}`, {
    ...init,
    headers,
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(25_000),
  });
}

const PUBLICATION_BASE_FIELDS = [
  "owner_id",
  "project_id",
  "slug",
  "title",
  "description",
  "author_name",
  "tags",
  "thumbnail_data_url",
  "image_mime_type",
  "access_mode",
  "allow_creator_credit_removal",
  "creator_credit_name",
  "source_revision",
  "source_chunk_count",
  "source_encoding",
  "source_payload_size_bytes",
  "published_at",
  "updated_at",
] as const;

export async function readPublicationBySlug(
  slug: string,
  options: { includePreview?: boolean; includeImage?: boolean } = {},
) {
  const fields = [...PUBLICATION_BASE_FIELDS];
  if (options.includePreview) fields.push("preview_data_url" as (typeof fields)[number]);
  if (options.includeImage) fields.push("image_data_url" as (typeof fields)[number]);
  const response = await publicationsAdminFetch(
    `/dromap_publications?slug=eq.${encodeURIComponent(slug)}&select=${fields.join(",")}&limit=1`,
    { method: "GET" },
  );
  const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : [];
  return rows?.[0] ?? null;
}

export async function readOwnedPublication(
  userId: string,
  projectId: string,
  options: { includePreview?: boolean; includeImage?: boolean } = {},
) {
  const fields = [...PUBLICATION_BASE_FIELDS];
  if (options.includePreview) fields.push("preview_data_url" as (typeof fields)[number]);
  if (options.includeImage) fields.push("image_data_url" as (typeof fields)[number]);
  const response = await publicationsAdminFetch(
    `/dromap_publications?owner_id=eq.${encodeURIComponent(userId)}&project_id=eq.${encodeURIComponent(projectId)}&select=${fields.join(",")}&limit=1`,
    { method: "GET" },
  );
  const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : [];
  return rows?.[0] ?? null;
}

export async function createUniquePublicationSlug(title: string) {
  const base = title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "carte";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = Math.random().toString(36).slice(2, 8);
    const slug = `${base}-${suffix}`;
    const existing = await readPublicationBySlug(slug);
    if (!existing) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function readPublicationEntitlement(userId: string, slug: string) {
  const response = await publicationsAdminFetch(
    `/dromap_publication_entitlements?buyer_id=eq.${encodeURIComponent(userId)}&publication_slug=eq.${encodeURIComponent(slug)}&select=buyer_id,publication_slug,access_mode,allow_creator_credit_removal,creator_credit_name,stripe_checkout_session_id,purchased_at&limit=1`,
    { method: "GET" },
  );
  if (!response.ok) return null;
  const rows = await parseJsonResponse<PublicationEntitlementRow[]>(response);
  return rows?.[0] ?? null;
}

export async function getPublicationViewerAccess(
  row: DromapPublicationRow,
  userId: string | null,
  plan: DromapAccountPlan | null,
): Promise<DromapPublicationViewerAccess> {
  const currentMode = normalizeDromapPublicationAccessMode(row.access_mode);
  const authenticated = Boolean(userId);
  const subscriber = authenticated && isDromapSubscriberPlan(plan);
  const slug = cleanString(row.slug) ?? "";
  const entitlement = userId && slug ? await readPublicationEntitlement(userId, slug) : null;
  const purchased = Boolean(entitlement);
  const purchasedMode = entitlement
    ? normalizeDromapPublicationAccessMode(entitlement.access_mode)
    : "read-only";
  const effectiveMode = purchased ? purchasedMode : currentMode;
  const canExport = purchased
    ? dromapPublicationModeAllowsExport(purchasedMode)
    : Boolean(subscriber && dromapPublicationModeAllowsExport(currentMode));
  const canEdit = purchased
    ? dromapPublicationModeAllowsEdit(purchasedMode)
    : Boolean(subscriber && dromapPublicationModeAllowsEdit(currentMode));
  const allowCreatorCreditRemoval = purchased
    ? entitlement?.allow_creator_credit_removal === true
    : row.allow_creator_credit_removal === true;
  const creatorCreditName = purchased
    ? cleanString(entitlement?.creator_credit_name) ?? cleanString(row.creator_credit_name)
    : cleanString(row.creator_credit_name);

  return {
    authenticated,
    subscriber: Boolean(subscriber),
    purchased,
    canExport,
    canEdit,
    canPurchase:
      authenticated &&
      !subscriber &&
      !purchased &&
      dromapPublicationModeAllowsExport(currentMode),
    effectiveAccessMode: effectiveMode,
    allowCreatorCreditRemoval,
    creatorCreditName,
  };
}

export async function grantDromapPublicationEntitlementFromCheckout(
  session: Stripe.Checkout.Session,
) {
  const buyerId = cleanString(session.metadata?.dromap_user_id);
  const slug = cleanString(session.metadata?.dromap_publication_slug);
  if (!buyerId || !slug || session.payment_status !== "paid") return false;

  const row = await readPublicationBySlug(slug);
  if (!row) return false;
  const accessMode = normalizeDromapPublicationAccessMode(row.access_mode);
  if (!dromapPublicationModeAllowsExport(accessMode)) return false;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const response = await publicationsAdminFetch(
    "/dromap_publication_entitlements?on_conflict=buyer_id,publication_slug",
    {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        buyer_id: buyerId,
        publication_slug: slug,
        access_mode: accessMode,
        allow_creator_credit_removal: row.allow_creator_credit_removal === true,
        creator_credit_name: cleanString(row.creator_credit_name),
        stripe_checkout_session_id: session.id,
        stripe_payment_intent_id: paymentIntentId,
        amount_total: session.amount_total ?? null,
        currency: session.currency ?? null,
        purchased_at: new Date().toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("PUBLICATION_ENTITLEMENT_SAVE_FAILED");
  return true;
}

export async function freezePublicationSourceFromProject(
  ownerId: string,
  projectId: string,
  slug: string,
) {
  const manifestResponse = await publicationsAdminFetch(
    `/dromap_projects?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&deleted_at=is.null&select=current_revision,chunk_count,encoding,payload_size_bytes&limit=1`,
    { method: "GET" },
  );
  const manifests = manifestResponse.ok
    ? await parseJsonResponse<ProjectManifestRow[]>(manifestResponse)
    : [];
  const manifest = manifests?.[0];
  const revision = cleanString(manifest?.current_revision);
  const chunkCount = typeof manifest?.chunk_count === "number" ? manifest.chunk_count : 0;
  const encoding = manifest?.encoding;
  if (
    !revision ||
    !Number.isInteger(chunkCount) ||
    chunkCount < 1 ||
    (encoding !== "gzip-base64" && encoding !== "base64")
  ) {
    throw new Error("PUBLICATION_SOURCE_MANIFEST_INVALID");
  }

  const chunksResponse = await publicationsAdminFetch(
    `/dromap_project_chunks?owner_id=eq.${encodeURIComponent(ownerId)}&project_id=eq.${encodeURIComponent(projectId)}&revision=eq.${encodeURIComponent(revision)}&select=chunk_index,chunk_data&order=chunk_index.asc`,
    { method: "GET" },
  );
  const chunks = chunksResponse.ok
    ? await parseJsonResponse<ProjectChunkRow[]>(chunksResponse)
    : [];
  const complete =
    Array.isArray(chunks) &&
    chunks.length === chunkCount &&
    chunks.every(
      (item, index) => item.chunk_index === index && typeof item.chunk_data === "string",
    );
  if (!complete) throw new Error("PUBLICATION_SOURCE_CHUNKS_INCOMPLETE");
  const safe = await sanitizePublicationChunks(chunks.map(item => item.chunk_data as string), encoding);
  const publicRevision = `public-safe-v1-${randomUUID()}`;

  // Écrire d’abord la nouvelle révision sans toucher à celle actuellement
  // publiée. Si un fragment échoue, les acheteurs conservent ainsi la dernière
  // version modifiable complète au lieu de se retrouver avec une source cassée.
  for (let index = 0; index < safe.chunks.length; index += 1) {
    const chunk = safe.chunks[index];
    if (typeof chunk !== "string") throw new Error("PUBLICATION_SOURCE_CHUNK_INVALID");
    const insertResponse = await publicationsAdminFetch(
      "/dromap_publication_source_chunks?on_conflict=publication_slug,revision,chunk_index",
      {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          publication_slug: slug,
          revision: publicRevision,
          chunk_index: index,
          chunk,
        }),
      },
    );
    if (!insertResponse.ok) throw new Error("PUBLICATION_SOURCE_CHUNK_SAVE_FAILED");
  }

  const updateResponse = await publicationsAdminFetch(
    `/dromap_publications?slug=eq.${encodeURIComponent(slug)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        source_revision: publicRevision,
        source_chunk_count: safe.chunks.length,
        source_encoding: safe.encoding,
        source_payload_size_bytes: safe.payloadSizeBytes,
      }),
    },
  );
  if (!updateResponse.ok) throw new Error("PUBLICATION_SOURCE_MANIFEST_SAVE_FAILED");

  // Le manifeste pointe maintenant vers la nouvelle révision. Les anciennes
  // révisions ne sont plus nécessaires ; leur nettoyage est best-effort et ne
  // doit jamais invalider la publication si Supabase refuse ce DELETE.
  await publicationsAdminFetch(
    `/dromap_publication_source_chunks?publication_slug=eq.${encodeURIComponent(slug)}&revision=neq.${encodeURIComponent(publicRevision)}`,
    { method: "DELETE", headers: { Prefer: "return=minimal" } },
  ).catch(() => null);

  return {
    revision: publicRevision,
    chunkCount: safe.chunks.length,
    encoding: safe.encoding,
    payloadSizeBytes: safe.payloadSizeBytes,
  } satisfies DromapPublicationSourceManifest;
}

export function publicationRowToSourceManifest(
  row: DromapPublicationRow | null | undefined,
): DromapPublicationSourceManifest | null {
  const revision = cleanString(row?.source_revision);
  const chunkCount = typeof row?.source_chunk_count === "number" ? row.source_chunk_count : 0;
  const encoding = row?.source_encoding;
  const payloadSizeBytes =
    typeof row?.source_payload_size_bytes === "number" && Number.isFinite(row.source_payload_size_bytes)
      ? Math.max(0, Math.floor(row.source_payload_size_bytes))
      : 0;
  if (
    !revision ||
    !Number.isInteger(chunkCount) ||
    chunkCount < 1 ||
    (encoding !== "gzip-base64" && encoding !== "base64")
  ) {
    return null;
  }
  return { revision, chunkCount, encoding, payloadSizeBytes };
}

export async function readPublicationSourceChunk(
  slug: string,
  revision: string,
  chunkIndex: number,
) {
  const response = await publicationsAdminFetch(
    `/dromap_publication_source_chunks?publication_slug=eq.${encodeURIComponent(slug)}&revision=eq.${encodeURIComponent(revision)}&chunk_index=eq.${chunkIndex}&select=chunk_index,chunk&limit=1`,
    { method: "GET" },
  );
  if (!response.ok) return null;
  const rows = await parseJsonResponse<PublicationSourceChunkRow[]>(response);
  const chunk = rows?.[0]?.chunk;
  return typeof chunk === "string" ? chunk : null;
}

const sanitizedSources = new Map<string, { expires: number; value: Awaited<ReturnType<typeof sanitizePublicationChunks>> }>();

// Les publications antérieures au correctif sont filtrées à la lecture aussi.
// Le contrôle des droits reste effectué par chaque route avant cet appel.
export async function readSafePublicationSource(row: DromapPublicationRow, slug: string) {
  const manifest = publicationRowToSourceManifest(row);
  if (!manifest || manifest.chunkCount > 128) return null;
  const key = `${slug}:${manifest.revision}`;
  let safe = sanitizedSources.get(key);
  if (!safe || safe.expires <= Date.now()) {
    const response = await publicationsAdminFetch(
      `/dromap_publication_source_chunks?publication_slug=eq.${encodeURIComponent(slug)}&revision=eq.${encodeURIComponent(manifest.revision)}&select=chunk_index,chunk&order=chunk_index.asc`,
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<PublicationSourceChunkRow[]>(response) : null;
    if (!rows || rows.length !== manifest.chunkCount || rows.some((item, index) => item.chunk_index !== index || typeof item.chunk !== "string")) return null;
    const value = await sanitizePublicationChunks(rows.map(item => item.chunk as string), manifest.encoding);
    safe = { expires: Date.now() + 60_000, value };
    // Cache borné à quatre sources de 8 Mo au plus.
    if (value.chunks.reduce((total, chunk) => total + chunk.length, 0) <= 8_000_000) {
      sanitizedSources.delete(key);
      if (sanitizedSources.size >= 4) sanitizedSources.delete(sanitizedSources.keys().next().value!);
      sanitizedSources.set(key, safe);
    }
  }
  return {
    manifest: { revision: manifest.revision, chunkCount: safe.value.chunks.length, encoding: safe.value.encoding, payloadSizeBytes: safe.value.payloadSizeBytes },
    chunks: safe.value.chunks,
  };
}
