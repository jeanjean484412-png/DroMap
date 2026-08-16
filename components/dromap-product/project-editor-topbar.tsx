"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { UndoRedoControls } from "@/app/editor/test/undo-redo-controls";
import { getProjectStatusLabel } from "@/lib/dromap/product";
import { useDromapProductStore } from "@/stores/dromap-product";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useDromapProjectSave } from "./project-autosave";
import { DromapCloudStatusIndicator } from "./cloud-status-indicator";

type DromapProjectEditorTopbarProps = {
  projectId: string;
  renderMode?: boolean;
};

export function DromapProjectEditorTopbar({
  projectId,
  renderMode = false,
}: DromapProjectEditorTopbarProps) {
  const router = useRouter();
  const project = useDromapProductStore((state) =>
    state.projects.find((item) => item.id === projectId),
  );
  const userMode = useDromapProductStore((state) => state.userMode);
  const renameProject = useDromapProductStore((state) => state.renameProject);
  const { saveNow } = useDromapProjectSave();
  const [nameDraft, setNameDraft] = useState(project?.name ?? "Projet sans titre");

  useEffect(() => {
    if (project) setNameDraft(project.name);
  }, [project]);

  if (!project) return null;
  const activeProject = project;

  async function leaveEditor() {
    await saveNow("navigation");
    router.push("/dashboard");
  }

  function openRenderPage() {
    // La préparation du rendu est un écran plein écran au-dessus de l'éditeur,
    // pas une nouvelle page de travail. Garder l'éditeur monté évite de
    // reconstruire Leaflet/MapLibre, de restaurer la zone et de recharger les
    // tuiles à chaque aller-retour. Les réglages de rendu lisent directement
    // les stores courants, donc aucune sauvegarde préalable n'est nécessaire.
    useEditorTestExportStore.getState().openExportPanel();
  }

  async function returnToEditor() {
    await saveNow("navigation");
    router.push(`/projects/${activeProject.id}/editor`);
  }

  function openProjectInformation() {
    window.dispatchEvent(new CustomEvent("dromap:p1-open-project-info"));
  }

  function startGuidedTour() {
    window.dispatchEvent(new CustomEvent("dromap:p1-start-tour"));
  }

  return (
    <header
      data-dromap-tour="topbar"
      className="relative z-[1200] flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 shadow-sm"
    >
      <button
        type="button"
        onClick={() => void leaveEditor()}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
        title="Enregistrer puis revenir au tableau de bord"
        aria-label="Enregistrer puis revenir au tableau de bord"
      >
        <span aria-hidden="true">←</span>
        <span className="hidden xl:inline">Tableau de bord</span>
      </button>

      <div className="h-7 w-px shrink-0 bg-slate-200" />

      <div className="min-w-0 flex-1">
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => renameProject(activeProject.id, nameDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="Nom du projet"
          className="w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-black text-slate-950 caret-indigo-600 shadow-inner outline-none transition hover:border-slate-300 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />
        <div className="truncate px-2 text-[11px] text-slate-500">
          {getProjectStatusLabel(activeProject, userMode)}
          {activeProject.lastSavedAt
            ? ` · ${new Date(activeProject.lastSavedAt).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            : ""}
        </div>
      </div>

      <div className="hidden items-center gap-1 border-r border-slate-200 pr-2 lg:flex">
        <UndoRedoControls />
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => useEditorTestExportStore.getState().openImportPanel()}
          data-dromap-tour="import"
          className="h-9 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
          title="Ajouter un Projet DroMap, un GeoJSON ou un calque enregistré"
          aria-label="Ajouter ou importer des données"
        >
          Ajouter / Importer
        </button>

        <button
          type="button"
          onClick={openProjectInformation}
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-100"
          title="Informations du projet"
          aria-label="Informations du projet"
        >
          i
        </button>

        <button
          type="button"
          onClick={() => window.open("/help", "_blank", "noopener,noreferrer")}
          className="hidden h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 xl:inline-flex"
          title="Ouvrir le centre d’aide"
        >
          Aide
        </button>

        <button
          type="button"
          onClick={startGuidedTour}
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-100"
          title="Relancer la visite guidée"
          aria-label="Relancer la visite guidée"
        >
          ?
        </button>

        <span className="inline-flex">
          <DromapCloudStatusIndicator compact />
        </span>

        <button
          type="button"
          onClick={() => void saveNow("manual")}
          disabled={activeProject.status === "saving"}
          className="h-9 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-wait disabled:text-slate-400"
          title="Enregistrer maintenant sur cet appareil et synchroniser si possible"
          aria-label="Enregistrer le projet maintenant"
        >
          {activeProject.status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>

        {renderMode ? (
          <button
            type="button"
            onClick={() => void returnToEditor()}
            className="h-9 rounded-xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
          >
            Retour à l’éditeur
          </button>
        ) : (
          <button
            type="button"
            data-dromap-tour="render"
            onClick={openRenderPage}
            className="h-9 rounded-xl bg-indigo-600 px-4 text-sm font-black text-white shadow-sm transition hover:bg-indigo-500"
            title="Préparer la légende et vérifier le rendu final"
            aria-label="Ouvrir Légende et Rendu final"
          >
            Légende & Rendu final
          </button>
        )}
      </div>
    </header>
  );
}
