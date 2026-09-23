import type { Metadata } from "next";
import { DromapPublicLibraryClient } from "@/components/dromap-product/public-library-client";
import { createDromapPublicMetadata } from "@/lib/dromap/seo";

export const metadata: Metadata = createDromapPublicMetadata({
  title: "Cartes publiques",
  description: "Découvrez les cartes publiées dans la bibliothèque DroMap et consultez les droits proposés par leurs créateurs.",
  path: "/library",
});

export default function PublicLibraryPage() {
  return <DromapPublicLibraryClient />;
}
