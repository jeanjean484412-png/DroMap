import type { Metadata } from "next";

import { DromapPublicMapClient } from "@/components/dromap-product/public-map-client";
import { parseJsonResponse } from "@/lib/dromap/server/supabase-rest";
import {
  dromapPublicationsConfigured,
  publicationRowToPublicWithImageRoutes,
  publicationsAdminFetch,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";

const PUBLIC_MAP_FALLBACK_DESCRIPTION = "Consultez une carte publiée avec DroMap.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  if (!slug || !dromapPublicationsConfigured()) {
    return {
      title: "Carte publique",
      description: PUBLIC_MAP_FALLBACK_DESCRIPTION,
    };
  }

  try {
    const response = await publicationsAdminFetch(
      `/dromap_publications?slug=eq.${encodeURIComponent(slug)}&select=slug,title,description,author_name,tags,access_mode,allow_creator_credit_removal,creator_credit_name,published_at,updated_at&limit=1`,
      { method: "GET" },
    );
    const rows = response.ok ? await parseJsonResponse<DromapPublicationRow[]>(response) : [];
    const publication = publicationRowToPublicWithImageRoutes(rows?.[0]);
    if (!publication) {
      return {
        title: "Carte publique",
        description: PUBLIC_MAP_FALLBACK_DESCRIPTION,
      };
    }

    const description = publication.description.trim() || PUBLIC_MAP_FALLBACK_DESCRIPTION;
    const shareImageUrl = publication.thumbnailDataUrl;

    return {
      title: publication.title,
      description,
      openGraph: {
        type: "article",
        locale: "fr_FR",
        siteName: "DroMap",
        url: `/library/${encodeURIComponent(publication.slug)}`,
        title: publication.title,
        description,
        publishedTime: publication.publishedAt,
        modifiedTime: publication.updatedAt,
        images: [
          {
            url: shareImageUrl,
            width: 720,
            height: 405,
            alt: `${publication.title} — carte publiée avec DroMap`,
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: publication.title,
        description,
        images: [shareImageUrl],
      },
    };
  } catch {
    return {
      title: "Carte publique",
      description: PUBLIC_MAP_FALLBACK_DESCRIPTION,
    };
  }
}

export default async function PublicMapPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <DromapPublicMapClient slug={slug} />;
}
