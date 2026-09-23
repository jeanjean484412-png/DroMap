import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { DromapHomePage } from "@/components/dromap-product/home-page";
import {
  createDromapPublicMetadata,
  DROMAP_HOME_DESCRIPTION,
  DROMAP_HOME_TITLE,
} from "@/lib/dromap/seo";
import { readAuthCookies } from "@/lib/dromap/server/supabase-rest";

export const metadata: Metadata = createDromapPublicMetadata({
  title: DROMAP_HOME_TITLE,
  description: DROMAP_HOME_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

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
