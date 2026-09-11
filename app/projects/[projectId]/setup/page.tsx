import type { Metadata } from "next";
import { DromapProjectSetupClient } from "@/components/dromap-product/project-setup-client";
export const metadata: Metadata = {
  title: "Préparer la carte",
  description: "Configurez le fond, la zone de travail et les données d’un projet DroMap avant son édition.",
};

export default async function ProjectSetupPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DromapProjectSetupClient projectId={projectId} />;
}
