import type { Metadata } from "next";
import { DromapProjectEditorClient } from "@/components/dromap-product/project-editor-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Légende & Rendu final",
  description: "Prévisualisez et ajustez le rendu final, la légende et les éléments cartographiques avant l’export.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default async function ProjectRenderPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DromapProjectEditorClient projectId={projectId} initialView="render" />;
}
