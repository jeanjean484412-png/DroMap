import type { Metadata } from "next";
import { DromapSettingsClient } from "@/components/dromap-product/settings-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Paramètres",
  description: "Configurez le démarrage, l’affichage des projets et les préférences générales de DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function SettingsPage() {
  return <DromapSettingsClient />;
}
