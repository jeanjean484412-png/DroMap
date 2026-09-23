import type { MetadataRoute } from "next";

import { DROMAP_CANONICAL_ORIGIN } from "@/lib/dromap/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/dashboard",
        "/account",
        "/settings",
        "/trash",
        "/projects",
        "/editor",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
        "/confirmation",
      ],
    },
    sitemap: `${DROMAP_CANONICAL_ORIGIN}/sitemap.xml`,
    host: DROMAP_CANONICAL_ORIGIN,
  };
}
