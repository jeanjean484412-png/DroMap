import "server-only";
import { securityRpc } from "./security-rpc";

export async function saveBetaProject(owner: string, project: string, expectedRevision: string | null, expectedUpdatedAt: string | null | undefined, patch: Record<string, unknown>): Promise<Response> {
  const result = await securityRpc("dromap_beta_save_project", {
    p_owner: owner, p_project: project, p_expected_revision: expectedRevision,
    p_expected_updated_at: expectedUpdatedAt ?? null, p_patch: patch,
  }) as { row?: Record<string, unknown>; error?: string };
  if (result.row) return Response.json([result.row]);
  if (result.error === "LIMIT") return Response.json({ error: "La version de test permet de conserver trois cartes. Place une carte dans la corbeille avant d’en créer ou d’en restaurer une autre." }, { status: 403 });
  if (result.error === "EXPIRED") return Response.json({ error: "Le délai de restauration de cette carte est expiré." }, { status: 410 });
  return Response.json({ error: "Ce projet a été modifié sur un autre appareil." }, { status: 409 });
}
