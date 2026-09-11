import type { Metadata } from "next";
import { DromapPublicLibraryClient } from "@/components/dromap-product/public-library-client";
export const metadata: Metadata = {
  title: "Cartes publiques",
  description: "Découvrez les cartes publiées dans la bibliothèque DroMap et consultez les droits proposés par leurs créateurs.",
};

export default function PublicLibraryPage() {
  return <DromapPublicLibraryClient />;
}
