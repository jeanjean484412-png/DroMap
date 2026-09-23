import type { MetadataRoute } from "next";

import {
  dromapPublicationsConfigured,
  publicationsAdminFetch,
} from "@/lib/dromap/server/publications";
import { parseJsonResponse } from "@/lib/dromap/server/supabase-rest";
import { DROMAP_CANONICAL_ORIGIN } from "@/lib/dromap/seo";

export const revalidate = 3600;

type SitemapPublicationRow = {
  slug?: unknown;
  published_at?: unknown;
  updated_at?: unknown;
};

const STATIC_PUBLIC_ROUTES: Array<{
  path: string;
  changeFrequency: "daily" | "weekly" | "monthly" | "yearly";
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/library", changeFrequency: "daily", priority: 0.9 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.8 },
  { path: "/help", changeFrequency: "monthly", priority: 0.7 },
  { path: "/credits", changeFrequency: "yearly", priority: 0.4 },
  { path: "/confidentialite", changeFrequency: "yearly", priority: 0.4 },
  { path: "/conditions-generales", changeFrequency: "yearly", priority: 0.4 },
];

function cleanString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readAllPublicationSitemapRows() {
  if (!dromapPublicationsConfigured()) return [];

  const rows: SitemapPublicationRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const response = await publicationsAdminFetch(
      `/dromap_publications?published_at=not.is.null&select=slug,published_at,updated_at&order=updated_at.desc&limit=${pageSize}&offset=${offset}`,
      { method: "GET" },
    );
    if (!response.ok) break;

    const page = await parseJsonResponse<SitemapPublicationRow[]>(response);
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PUBLIC_ROUTES.map((route) => ({
    url: `${DROMAP_CANONICAL_ORIGIN}${route.path === "/" ? "" : route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  try {
    const publicationRows = await readAllPublicationSitemapRows();
    const seenSlugs = new Set<string>();
    const publicationEntries: MetadataRoute.Sitemap = publicationRows.flatMap((row) => {
      const slug = cleanString(row.slug);
      const publishedAt = cleanString(row.published_at);
      if (!slug || !publishedAt || seenSlugs.has(slug)) return [];
      seenSlugs.add(slug);

      const updatedAt = cleanString(row.updated_at);
      const lastModified = updatedAt ? new Date(updatedAt) : undefined;

      return [
        {
          url: `${DROMAP_CANONICAL_ORIGIN}/library/${encodeURIComponent(slug)}`,
          lastModified:
            lastModified && !Number.isNaN(lastModified.getTime()) ? lastModified : undefined,
          changeFrequency: "weekly" as const,
          priority: 0.7,
        },
      ];
    });

    return [...staticEntries, ...publicationEntries];
  } catch {
    // Le sitemap statique reste disponible même si Supabase est momentanément indisponible.
    return staticEntries;
  }
}
