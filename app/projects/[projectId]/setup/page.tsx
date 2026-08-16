import { DromapProjectSetupClient } from "@/components/dromap-product/project-setup-client";

export default async function ProjectSetupPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <DromapProjectSetupClient projectId={projectId} />;
}
