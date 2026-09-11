import type { MetadataRoute } from "next";

import { getDromapSiteUrl } from "@/lib/dromap/site-url";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getDromapSiteUrl();

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
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
