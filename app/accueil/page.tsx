import type { Metadata } from "next";
import { DromapHomePage } from "@/components/dromap-product/home-page";
import {
  createDromapPublicMetadata,
  DROMAP_HOME_DESCRIPTION,
  DROMAP_HOME_TITLE,
} from "@/lib/dromap/seo";

export const metadata: Metadata = createDromapPublicMetadata({
  title: DROMAP_HOME_TITLE,
  description: DROMAP_HOME_DESCRIPTION,
  path: "/",
  absoluteTitle: true,
});

export default function AccueilPage() {
  // Cette route reste volontairement accessible même lorsqu’un compte est connecté.
  // Le bandeau public remplace alors « Connexion » par l’accès au compte.
  return <DromapHomePage />;
}
