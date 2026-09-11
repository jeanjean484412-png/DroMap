import type { Metadata } from "next";
import { DromapSettingsClient } from "@/components/dromap-product/settings-client";
export const metadata: Metadata = {
  title: "Paramètres",
  description: "Configurez le démarrage, l’affichage des projets et les préférences générales de DroMap.",
};

export default function SettingsPage() {
  return <DromapSettingsClient />;
}
