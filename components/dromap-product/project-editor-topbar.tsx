"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { UndoRedoControls } from "@/editor/undo-redo-controls";
import { getProjectStatusLabel } from "@/lib/dromap/product";
import { useDromapProductStore } from "@/stores/dromap-product";
import { useEditorExportStore } from "@/stores/editor-export";
import { useDromapProjectSave } from "./project-autosave";

type DromapProjectEditorTopbarProps = {
  projectId: string;
  renderMode?: boolean;
};

export function DromapProjectEditorTopbar({
  projectId,
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
    useEditorExportStore.getState().openExportPanel();
  }


  function openProjectInformation() {
    window.dispatchEvent(new CustomEvent("dromap:open-project-info"));
  }

  function startGuidedTour() {
    window.dispatchEvent(new CustomEvent("dromap:start-editor-tour"));
  }

  return (
    <header
      data-dromap-tour="topbar"
      className="relative z-[1200] flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-2 py-2 shadow-sm sm:h-14 sm:flex-nowrap sm:px-3 sm:py-0"
    >
      <button
        type="button"
        onClick={() => void leaveEditor()}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
      >
        <span aria-hidden="true">←</span>
        <span className="hidden xl:inline">Menu principal</span>
      </button>

      <div className="h-7 w-px shrink-0 bg-slate-200" />

      <div className="min-w-0 flex-1 basis-40">
        <input
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          onBlur={() => renameProject(activeProject.id, nameDraft)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="Nom du projet"
          className="w-full max-w-md rounded-lg border border-transparent px-2 py-1 text-sm font-black text-slate-950 outline-none transition hover:border-slate-200 focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
        />
        <div className="hidden truncate px-2 text-[11px] text-slate-500 sm:block">
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

      <div className="order-3 flex w-full shrink-0 items-center gap-1.5 overflow-x-auto border-t border-slate-100 pt-2 sm:order-none sm:w-auto sm:overflow-visible sm:border-0 sm:pt-0">
        <button
          type="button"
          onClick={() => useEditorExportStore.getState().openImportPanel()}
          data-dromap-tour="import"
          className="h-9 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
        >
          Ajouter / Importer
        </button>

        <div
          data-dromap-tour="help-controls"
          className="flex shrink-0 items-center gap-1.5"
        >
          <button
            type="button"
            onClick={openProjectInformation}
            data-dromap-tour="project-info"
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-100"
            title="Informations du projet"
            aria-label="Informations du projet"
          >
            !
          </button>

          <button
            type="button"
            onClick={() => window.open("/help", "_blank", "noopener,noreferrer")}
            data-dromap-tour="help"
            className="hidden h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 md:inline-flex"
            title="Ouvrir le centre d’aide"
            aria-label="Ouvrir le centre d’aide"
          >
            Aide
          </button>

          <button
            type="button"
            onClick={startGuidedTour}
            data-dromap-tour="tour"
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-700 transition hover:bg-slate-100"
            title="Relancer la visite guidée"
            aria-label="Relancer la visite guidée"
          >
            ?
          </button>
        </div>

        <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 2xl:inline-flex">
          {userMode === "guest" ? "Invité" : "Compte de test"}
        </span>

        <button
          type="button"
          onClick={() => void saveNow("manual")}
          disabled={activeProject.status === "saving"}
          className="h-9 shrink-0 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-800 transition hover:bg-slate-100 disabled:cursor-wait disabled:text-slate-400"
        >
          {activeProject.status === "saving" ? "Enregistrement…" : "Enregistrer"}
        </button>

        <button
          type="button"
          data-dromap-tour="render"
          onClick={openRenderPage}
          className="h-9 shrink-0 rounded-xl bg-teal-600 px-3 text-xs font-black text-white shadow-sm transition hover:bg-teal-500 sm:px-4 sm:text-sm"
        >
          Légende & Rendu final
        </button>
      </div>
    </header>
  );
}
