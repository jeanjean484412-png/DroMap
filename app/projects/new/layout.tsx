import type { Metadata } from "next";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";

export const metadata: Metadata = {
  title: "Nouveau projet",
  description: "Créez un nouveau projet DroMap et préparez sa carte avant de commencer l’édition.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function NewProjectLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
