import type { MetadataRoute } from "next";

const DROMAP_DESCRIPTION =
  "Créez des cartes claires, modifiables et exportables avec DroMap : calques, imports, légende, rendu fidèle et Assistant IA contrôlable.";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DroMap — Éditeur cartographique",
    short_name: "DroMap",
    description: DROMAP_DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#f7f9f8",
    theme_color: "#123a59",
    lang: "fr",
    icons: [
      {
        src: "/dromap-icon-192.png?v=20260915-2",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/dromap-icon-512.png?v=20260915-2",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/dromap-icon-512.png?v=20260915-2",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
