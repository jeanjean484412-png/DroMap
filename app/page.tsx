import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DromapHomePage } from "@/components/dromap-product/home-page";
import { readAuthCookies } from "@/lib/dromap/server/supabase-rest";

export const metadata: Metadata = {
  title: { absolute: "DroMap — Éditeur cartographique en ligne" },
  description:
    "Créez des cartes claires, modifiables et exportables avec DroMap : calques, imports, légende, rendu fidèle et Assistant IA contrôlable.",
};

export default async function HomePage() {
  // La racine reste l’entrée naturelle : une session existante ouvre directement
  // Mes projets. Le logo DroMap de l’espace connecté pointe vers /accueil pour
  // permettre de revenir volontairement à la présentation publique du produit.
  const { accessToken, refreshToken } = await readAuthCookies();
  if (accessToken || refreshToken) {
    redirect("/dashboard");
  }

  return <DromapHomePage />;
}
