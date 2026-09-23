import type { Metadata } from "next";
import { DromapHelpClient } from "@/components/dromap-product/help-client";
import { createDromapPublicMetadata } from "@/lib/dromap/seo";

export const metadata: Metadata = createDromapPublicMetadata({
  title: "Centre d’aide",
  description: "Retrouvez les guides DroMap pour créer, modifier, importer, publier et exporter une carte et utiliser les principales fonctions.",
  path: "/help",
});

export default function HelpPage() {
  return <DromapHelpClient />;
}
