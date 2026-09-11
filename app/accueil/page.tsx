import type { Metadata } from "next";
import { DromapHomePage } from "@/components/dromap-product/home-page";
export const metadata: Metadata = {
  title: { absolute: "DroMap — Éditeur cartographique en ligne" },
  description: "Créez des cartes claires, modifiables et exportables avec DroMap : calques, imports, légende, rendu fidèle et Assistant IA contrôlable.",
};

export default function AccueilPage() {
  // Cette route reste volontairement accessible même lorsqu’un compte est connecté.
  // Le bandeau public remplace alors « Connexion » par l’accès au compte.
  return <DromapHomePage />;
}
