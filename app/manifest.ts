import type { MetadataRoute } from "next";

import { DROMAP_HOME_DESCRIPTION } from "@/lib/dromap/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DroMap — Créer et personnaliser des cartes en ligne",
    short_name: "DroMap",
    description: DROMAP_HOME_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9f8",
    theme_color: "#123a59",
    lang: "fr",
    icons: [
      {
        src: "/dromap-icon-192.png?v=20260915-3",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/dromap-icon-512.png?v=20260915-3",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/dromap-icon-512.png?v=20260915-3",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
