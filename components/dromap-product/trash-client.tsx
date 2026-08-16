"use client";

import { useMemo, useState } from "react";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { DromapEmptyState } from "@/components/dromap-ui/empty-state";
import {
  DROMAP_TRASH_RETENTION_DAYS,
  getDromapTrashDeletionAt,
  getDromapTrashRemainingDays,
} from "@/lib/dromap/product";
import { useDromapProductStore } from "@/stores/dromap-product";

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}


function TrashContent() {
  const allProjects = useDromapProductStore((state) => state.projects);
  const userMode = useDromapProductStore((state) => state.userMode);
  const trashedProjects = useMemo(
    () => allProjects.filter((project) => project.status === "trashed"),
    [allProjects],
  );
  const activeProjects = useMemo(
    () => allProjects.filter((project) => project.status !== "trashed"),
    [allProjects],
  );
  const restoreProject = useDromapProductStore((state) => state.restoreProject);
  const trashProject = useDromapProductStore((state) => state.trashProject);
  const permanentlyDeleteProject = useDromapProductStore(
    (state) => state.permanentlyDeleteProject,
  );
  const emptyTrash = useDromapProductStore((state) => state.emptyTrash);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const [projectToRestore, setProjectToRestore] = useState<string | null>(null);
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false);

  const sortedProjects = useMemo(
    () =>
      [...trashedProjects].sort((a, b) =>
        (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
      ),
    [trashedProjects],
  );

  const selectedProject = sortedProjects.find(
    (project) => project.id === projectToDelete,
  );
  const selectedRestoreProject = sortedProjects.find(
    (project) => project.id === projectToRestore,
  );

  function requestRestore(projectId: string) {
    if (userMode === "guest" && activeProjects.length > 0) {
      setProjectToRestore(projectId);
      return;
    }
    restoreProject(projectId);
  }

  return (
    <DromapProductShell
      title="Corbeille"
      description={`Les projets restent restaurables pendant ${DROMAP_TRASH_RETENTION_DAYS} jours.`}
      actions={
        sortedProjects.length > 0 ? (
          <DromapButton variant="danger" onClick={() => setEmptyDialogOpen(true)}>
            Vider la corbeille
          </DromapButton>
        ) : null
      }
    >
      {sortedProjects.length === 0 ? (
        <DromapEmptyState
          title="La corbeille est vide"
          description="Les projets supprimés apparaîtront ici pendant dix jours avant leur suppression définitive."
        />
      ) : (
        <div className="space-y-3">
          {sortedProjects.map((project) => {
            const remainingDays = getDromapTrashRemainingDays(project);
            const deletionAt = getDromapTrashDeletionAt(project);
            return (
              <article
                key={project.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <h2 className="truncate font-black text-slate-950">
                    {project.name}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Supprimé le {formatDate(project.deletedAt ?? project.updatedAt)}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    Suppression définitive dans {remainingDays} jour
                    {remainingDays > 1 ? "s" : ""}
                    {deletionAt ? ` · le ${formatDate(deletionAt)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DromapButton onClick={() => requestRestore(project.id)}>
                    Restaurer
                  </DromapButton>
                  <DromapButton
                    variant="danger"
                    onClick={() => setProjectToDelete(project.id)}
                  >
                    Supprimer définitivement
                  </DromapButton>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <DromapDialog
        open={selectedRestoreProject !== undefined}
        title="Un projet invité est déjà actif"
        description="Le mode invité ne peut conserver qu’un seul projet actif à la fois."
        onClose={() => setProjectToRestore(null)}
        footer={
          <>
            <DromapButton onClick={() => setProjectToRestore(null)}>
              Annuler
            </DromapButton>
            <DromapButton
              variant="danger"
              onClick={() => {
                for (const activeProject of activeProjects) {
                  trashProject(activeProject.id);
                }
                if (projectToRestore) restoreProject(projectToRestore);
                setProjectToRestore(null);
              }}
            >
              Remplacer le projet actif
            </DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                setProjectToRestore(null);
                window.location.href = "/signup?returnTo=%2Ftrash";
              }}
            >
              Créer un compte
            </DromapButton>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-700">
          Restaurer <strong>{selectedRestoreProject?.name}</strong> peut soit
          déplacer le projet actif vers la corbeille, soit créer un compte pour
          conserver les deux projets avec sauvegarde en ligne.
        </p>
      </DromapDialog>

      <DromapDialog
        open={selectedProject !== undefined}
        title="Supprimer définitivement ce projet ?"
        description="Cette action est irréversible. Le projet et toutes ses données seront supprimés."
        onClose={() => setProjectToDelete(null)}
        footer={
          <>
            <DromapButton onClick={() => setProjectToDelete(null)}>
              Annuler
            </DromapButton>
            <DromapButton
              variant="danger"
              onClick={() => {
                if (projectToDelete) permanentlyDeleteProject(projectToDelete);
                setProjectToDelete(null);
              }}
            >
              Supprimer définitivement
            </DromapButton>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          Projet concerné : <strong>{selectedProject?.name}</strong>
        </p>
      </DromapDialog>

      <DromapDialog
        open={emptyDialogOpen}
        title="Vider toute la corbeille ?"
        description="Tous les projets présents dans la corbeille seront supprimés définitivement."
        onClose={() => setEmptyDialogOpen(false)}
        footer={
          <>
            <DromapButton onClick={() => setEmptyDialogOpen(false)}>
              Annuler
            </DromapButton>
            <DromapButton
              variant="danger"
              onClick={() => {
                emptyTrash();
                setEmptyDialogOpen(false);
              }}
            >
              Vider définitivement
            </DromapButton>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {sortedProjects.length} projet{sortedProjects.length > 1 ? "s" : ""} sera
          {sortedProjects.length > 1 ? "ont" : ""} supprimé
          {sortedProjects.length > 1 ? "s" : ""}.
        </p>
      </DromapDialog>
    </DromapProductShell>
  );
}

export function DromapTrashClient() {
  return (
    <DromapProductBootstrap>
      <TrashContent />
    </DromapProductBootstrap>
  );
}
