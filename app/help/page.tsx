import type { Metadata } from "next";
import { DromapHelpClient } from "@/components/dromap-product/help-client";
export const metadata: Metadata = {
  title: "Centre d’aide",
  description: "Retrouvez les guides DroMap pour créer, modifier, importer, publier et exporter une carte et utiliser les principales fonctions.",
};

export default function HelpPage() {
  return <DromapHelpClient />;
}
