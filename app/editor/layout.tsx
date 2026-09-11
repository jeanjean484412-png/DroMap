import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Éditeur cartographique",
  description:
    "Éditez une carte DroMap avec les outils cartographiques, calques, imports, légende et fonctions de rendu.",
};

export default function EditorLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
