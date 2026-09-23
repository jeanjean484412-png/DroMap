import type { Metadata } from "next";
import { DromapProjectEditorClient } from "@/components/dromap-product/project-editor-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Éditeur cartographique",
  description: "Modifiez la carte, les objets, les calques, les imports, la légende et le rendu dans l’éditeur DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default async function ProjectEditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DromapProjectEditorClient projectId={projectId} />;
}
