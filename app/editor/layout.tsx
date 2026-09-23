import type { Metadata } from "next";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";

export const metadata: Metadata = {
  title: "Éditeur cartographique",
  description:
    "Éditez une carte DroMap avec les outils cartographiques, calques, imports, légende et fonctions de rendu.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
