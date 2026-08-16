import { DromapProjectEditorClient } from "@/components/dromap-product/project-editor-client";

export default async function ProjectRenderPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DromapProjectEditorClient projectId={projectId} initialView="render" />;
}
