"use client";

import { useMemo, useState } from "react";

import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { useDromapProductStore } from "@/stores/dromap-product";

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function DromapProjectSyncConflictDialog() {
  const conflicts = useDromapProductStore((state) => state.projectConflicts);
  const projects = useDromapProductStore((state) => state.projects);
  const resolve = useDromapProductStore((state) => state.resolveProjectConflict);
  const [working, setWorking] = useState<"local" | "remote" | null>(null);

  const conflict = useMemo(() => {
    const projectId = Object.keys(conflicts)[0];
    if (!projectId) return null;
    const details = conflicts[projectId];
    if (!details) return null;
    return {
      projectId,
      details,
      project: projects.find((project) => project.id === projectId) ?? null,
    };
  }, [conflicts, projects]);

  if (!conflict) return null;

  async function choose(choice: "local" | "remote") {
    const projectId = conflict!.projectId;
    setWorking(choice);
    const resolved = await resolve(projectId, choice);
    setWorking(null);
    if (resolved && choice === "remote" && window.location.pathname.includes(`/projects/${projectId}/`)) {
      // Le moteur de l'éditeur possède ses propres stores. Un rechargement ciblé
      // garantit que le choix explicite « version en ligne » remonte immédiatement
      // dans la carte au lieu de laisser l'ancienne scène locale affichée.
      window.location.reload();
    }
  }

  return (
    <DromapDialog
      open
      title="Deux versions de ce projet existent"
      description="Ce projet a été modifié sur un autre appareil. DroMap ne remplace aucune version sans ton choix."
      onClose={() => undefined}
      footer={
        <>
          <DromapButton disabled={working !== null} onClick={() => void choose("remote")}>
            {working === "remote" ? "Chargement…" : "Utiliser la version en ligne"}
          </DromapButton>
          <DromapButton
            variant="primary"
            disabled={working !== null}
            onClick={() => void choose("local")}
          >
            {working === "local" ? "Enregistrement…" : "Conserver ma version"}
          </DromapButton>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="font-bold text-slate-950">{conflict.project?.name ?? "Projet DroMap"}</div>
          <div className="mt-1 text-xs text-slate-600">
            Ma copie : {formatDate(conflict.details.localUpdatedAt)}
          </div>
          <div className="text-xs text-slate-600">
            Version en ligne : {formatDate(conflict.details.remote.updatedAt)}
          </div>
        </div>
        <p>
          « Utiliser la version en ligne » remplace la copie de cet appareil. « Conserver ma version » publie
          explicitement ta copie locale par-dessus la version actuellement en ligne.
        </p>
      </div>
    </DromapDialog>
  );
}
