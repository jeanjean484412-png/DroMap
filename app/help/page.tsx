import type { Metadata } from "next";
import { DromapHelpClient } from "@/components/dromap-product/help-client";
import { createDromapPublicMetadata } from "@/lib/dromap/seo";

export const metadata: Metadata = createDromapPublicMetadata({
  title: "Aide pour créer une carte en ligne",
  description: "Guides DroMap : créer une carte avec légende et marqueurs, dessiner des zones, importer un fichier GeoJSON et exporter une carte pour un cours ou une présentation.",
  path: "/help",
});

export default function HelpPage() {
  return <DromapHelpClient />;
}
