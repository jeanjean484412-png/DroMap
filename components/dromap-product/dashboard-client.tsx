"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { DromapEmptyState } from "@/components/dromap-ui/empty-state";
import { DromapStatusBadge } from "@/components/dromap-ui/status-badge";
import { DashboardProjectExportDialog } from "./dashboard-project-export-dialog";
import {
  getProjectStatusLabel,
  type DromapProject,
} from "@/lib/dromap/product";
import {
  createDromapEditorSnapshotFromImportedProject,
  type DromapEditorProjectSnapshot,
} from "@/lib/dromap/editor-project-persistence";
import { parseDromapProjectJson } from "@/app/editor/test/export-download";
import { useDromapProductStore } from "@/stores/dromap-product";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";

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

function ProjectCard({ project }: { project: DromapProject }) {
  const router = useRouter();
  const userMode = useDromapProductStore((state) => state.userMode);
  const duplicateProject = useDromapProductStore(
    (state) => state.duplicateProject,
  );
  const trashProject = useDromapProductStore((state) => state.trashProject);
  const renameProject = useDromapProductStore((state) => state.renameProject);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.name);

  const basemap = getDromapBasemapConfig(
    project.editorSnapshot?.basemapId ?? project.setup.basemapId,
  );

  const targetHref = project.setupComplete
    ? `/projects/${project.id}/editor`
    : `/projects/${project.id}/setup`;

  return (
    <article className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-lg">
      <button
        type="button"
        onClick={() => router.push(targetHref)}
        className="block w-full text-left"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-gradient-to-br from-slate-100 via-indigo-50 to-sky-100">
          {project.thumbnailDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.thumbnailDataUrl}
              alt={`Aperçu du projet ${project.name}`}
              className="h-full w-full bg-slate-100 object-contain"
            />
          ) : (
            <div
              className="absolute inset-0 grid place-items-center px-5 text-center"
              style={{
                background:
                  basemap.kind === "solid"
                    ? basemap.background
                    : `linear-gradient(135deg, ${basemap.exportBackground}, #dbeafe)`,
              }}
            >
              <div className="rounded-xl border border-white/80 bg-white/90 px-4 py-3 shadow-sm backdrop-blur">
                <div className="text-xs font-bold uppercase tracking-wide text-indigo-600">
                  Fond sélectionné
                </div>
                <div className="mt-1 font-black text-slate-950">{basemap.label}</div>
                <div className="mt-1 text-xs text-slate-500">
                  Le rendu réel apparaîtra après l’ouverture ou l’enregistrement du projet.
                </div>
              </div>
            </div>
          )}
          {project.thumbnailDataUrl ? (
            <div className="absolute bottom-3 right-3 rounded-full border border-white/70 bg-slate-950/75 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur">
              Rendu enregistré
            </div>
          ) : null}
          <div className="absolute left-3 top-3">
            <DromapStatusBadge
              status={project.status}
              label={getProjectStatusLabel(project, userMode)}
            />
          </div>
        </div>
        <div className="p-4">
          <h2 className="truncate font-black text-slate-950">{project.name}</h2>
          <div className="mt-1 text-xs text-slate-500">
            {project.creatorName} · modifié le {formatDate(project.updatedAt)}
          </div>
        </div>
      </button>

      <div className="relative flex items-center justify-between border-t border-slate-100 px-4 py-3">
        <span className="text-xs text-slate-500">
          {project.setupComplete ? "Prêt à éditer" : `Étape ${project.setup.currentStep} sur 4`}
        </span>
        <button
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white font-black text-slate-700 transition hover:bg-slate-100"
          aria-label={`Actions pour ${project.name}`}
          aria-expanded={menuOpen}
        >
          …
        </button>

        {menuOpen ? (
          <div className="absolute bottom-12 right-3 z-20 w-48 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-xl">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setNameDraft(project.name);
                setRenameOpen(true);
              }}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100"
            >
              Renommer
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void (async () => {
                  const copyId = await duplicateProject(project.id);
                  if (copyId) {
                    router.push(
                      project.setupComplete
                        ? `/projects/${copyId}/editor`
                        : `/projects/${copyId}/setup`,
                    );
                  }
                })();
              }}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100 disabled:text-slate-400"
              disabled={userMode === "guest"}
              title={userMode === "guest" ? "Un compte est nécessaire pour dupliquer un projet." : undefined}
            >
              Dupliquer {userMode === "guest" ? "🔒" : ""}
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setInfoOpen(true);
              }}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100"
            >
              Informations
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setExportOpen(true);
              }}
              className="w-full rounded-lg px-3 py-2 text-left hover:bg-slate-100"
              title="Choisir directement un format de téléchargement ou d’export, sans ouvrir le projet."
            >
              Télécharger / exporter
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                trashProject(project.id);
              }}
              className="w-full rounded-lg px-3 py-2 text-left text-red-700 hover:bg-red-50"
            >
              Déplacer vers la corbeille
            </button>
          </div>
        ) : null}
      </div>

      <DashboardProjectExportDialog
        open={exportOpen}
        projectId={project.id}
        projectName={project.name}
        userMode={userMode}
        onClose={() => setExportOpen(false)}
      />

      <DromapDialog
        open={infoOpen}
        title="Informations du projet"
        description="Détails du projet et contenu principal enregistré."
        onClose={() => setInfoOpen(false)}
        footer={
          <DromapButton variant="primary" onClick={() => setInfoOpen(false)}>
            Fermer
          </DromapButton>
        }
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Créateur</dt>
            <dd className="mt-1 font-semibold text-slate-900">{project.creatorName}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">État</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {getProjectStatusLabel(project, userMode)}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Création</dt>
            <dd className="mt-1 font-semibold text-slate-900">{formatDate(project.createdAt)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Dernière modification</dt>
            <dd className="mt-1 font-semibold text-slate-900">{formatDate(project.updatedAt)}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Fond</dt>
            <dd className="mt-1 break-words font-semibold text-slate-900">
              {project.editorSnapshot?.basemapId ?? project.setup.basemapId}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Zone de travail</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {(project.editorSnapshot?.workspaceBounds ??
                project.setup.workspaceBounds)
                ? "Définie"
                : "Non définie"}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Calques DroMap</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {project.contentLoaded === false ? "Chargé à l’ouverture" : project.editorSnapshot?.layers?.length ?? 0}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Objets / GeoJSON</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {project.contentLoaded === false ? "Chargé à l’ouverture" : `${project.editorSnapshot?.features.length ?? 0} objet(s) · ${project.editorSnapshot?.geoJsonLayers?.length ?? 0} calque(s) GeoJSON`}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Accès</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {userMode === "guest" ? "Privé · enregistré sur cet appareil" : "Privé · enregistré en ligne"}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Format de rendu</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {project.contentLoaded === false ? "Chargé à l’ouverture" : project.editorSnapshot?.exportSettings?.exportFormat ?? "Automatique"}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Marqueurs personnalisés</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              {project.contentLoaded === false ? "Chargé à l’ouverture" : project.editorSnapshot?.customMarkers?.length ?? 0}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <dt className="text-xs font-semibold text-slate-500">Fichier de projet importé</dt>
            <dd className="mt-1 break-words font-semibold text-slate-900">
              {project.importedFileName ?? "Aucun"}
            </dd>
          </div>
        </dl>
      </DromapDialog>

      <DromapDialog
        open={renameOpen}
        title="Renommer le projet"
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <DromapButton onClick={() => setRenameOpen(false)}>Annuler</DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                renameProject(project.id, nameDraft);
                setRenameOpen(false);
              }}
            >
              Enregistrer
            </DromapButton>
          </>
        }
      >
        <label className="block text-sm font-semibold text-slate-800" htmlFor={`rename-${project.id}`}>
          Nom du projet
        </label>
        <input
          id={`rename-${project.id}`}
          value={nameDraft}
          onChange={(event) => setNameDraft(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-base font-semibold text-slate-950 caret-indigo-600 shadow-inner outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
          autoFocus
        />
      </DromapDialog>
    </article>
  );
}

function DashboardContent() {
  const router = useRouter();
  const allProjects = useDromapProductStore((state) => state.projects);
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const projects = useMemo(() => {
    const sortPreference = accountPreferences.projectSort;
    const visibleProjects = allProjects.filter((project) => project.status !== "trashed");

    if (sortPreference === "name-asc") {
      return visibleProjects.sort((a, b) =>
        a.name.localeCompare(b.name, "fr", { sensitivity: "base" }),
      );
    }

    if (sortPreference === "created-desc") {
      return visibleProjects.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }

    return visibleProjects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [accountPreferences.projectSort, allProjects]);
  const userMode = useDromapProductStore((state) => state.userMode);
  const createProject = useDromapProductStore((state) => state.createProject);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"new" | "import" | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    projectName: string;
    snapshot: DromapEditorProjectSnapshot;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function startNewProject(replaceGuestProject = false) {
    const id = createProject({ replaceGuestProject });
    if (!id && userMode === "guest") {
      setPendingAction("new");
      setReplaceDialogOpen(true);
      return;
    }
    if (id) router.push(`/projects/${id}/setup`);
  }

  function requestImport() {
    if (userMode === "guest" && projects.length > 0) {
      setPendingAction("import");
      setReplaceDialogOpen(true);
      return;
    }
    fileInputRef.current?.click();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;

    try {
      setImportError(null);
      const imported = parseDromapProjectJson(await file.text());
      const snapshot = createDromapEditorSnapshotFromImportedProject(imported);
      const baseName = file.name.replace(/\.(json|dromap)$/i, "").trim();
      setPendingImport({
        fileName: file.name,
        projectName: baseName || "Projet DroMap importé",
        snapshot,
      });
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "Import du projet impossible.",
      );
    }
  }

  function confirmPendingImport() {
    if (!pendingImport) return;

    const id = createProject({
      name: pendingImport.projectName,
      replaceGuestProject: userMode === "guest",
      setupComplete: true,
      snapshot: pendingImport.snapshot,
      importedFileName: pendingImport.fileName,
    });

    if (!id) {
      setImportError("Le projet n’a pas pu être créé.");
      setPendingImport(null);
      return;
    }

    setPendingImport(null);
    router.push(`/projects/${id}/editor`);
  }

  return (
    <DromapProductShell
      title="Mes projets"
      description={
        userMode === "guest"
          ? "Un projet temporaire est conservé sur cet appareil."
          : "Tes projets sauvegardés en ligne."
      }
      actions={
        <>
          <DromapButton onClick={requestImport}>Importer un Projet DroMap</DromapButton>
          <DromapButton variant="primary" onClick={() => startNewProject(false)}>
            Nouveau projet
          </DromapButton>
        </>
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.dromap,application/json"
        onChange={handleImport}
        className="hidden"
      />

      {importError ? (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {importError}
        </div>
      ) : null}

      {projects.length === 0 ? (
        <DromapEmptyState
          title="Crée ta première carte"
          description="Le parcours guidé te fera choisir le nom, le fond, la zone de travail puis les calques avant d’ouvrir l’éditeur complet."
          action={
            <DromapButton variant="primary" onClick={() => startNewProject(false)}>
              Nouveau projet
            </DromapButton>
          }
          icon="⌖"
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}

      <DromapDialog
        open={pendingImport !== null}
        title="Importer ce Projet DroMap ?"
        description="Vérifie le contenu détecté avant de créer le projet et d’ouvrir l’éditeur."
        onClose={() => setPendingImport(null)}
        maxWidthClassName="max-w-2xl"
        footer={
          <>
            <DromapButton onClick={() => setPendingImport(null)}>
              Annuler
            </DromapButton>
            <DromapButton variant="primary" onClick={confirmPendingImport}>
              Ouvrir le projet
            </DromapButton>
          </>
        }
      >
        {pendingImport ? (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="imported-project-name"
                className="text-sm font-semibold text-slate-800"
              >
                Nom du projet
              </label>
              <input
                id="imported-project-name"
                value={pendingImport.projectName}
                onChange={(event) =>
                  setPendingImport((current) =>
                    current
                      ? { ...current, projectName: event.target.value }
                      : current,
                  )
                }
                className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Fichier</dt>
                <dd className="mt-1 break-all font-semibold text-slate-900">
                  {pendingImport.fileName}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Fond</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {pendingImport.snapshot.basemapId ?? "Fond par défaut"}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Zone</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {pendingImport.snapshot.workspaceBounds ? "Définie" : "Absente"}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Objets</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {pendingImport.snapshot.features.length.toLocaleString("fr-FR")}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Calques DroMap</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {pendingImport.snapshot.layers?.length ?? 0}
                </dd>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <dt className="text-xs font-semibold text-slate-500">Calques GeoJSON</dt>
                <dd className="mt-1 font-semibold text-slate-900">
                  {pendingImport.snapshot.geoJsonLayers?.length ?? 0}
                </dd>
              </div>
            </dl>

            {!pendingImport.snapshot.workspaceBounds ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-900">
                Le fichier ne contient pas de zone exploitable. L’éditeur pourra
                s’ouvrir, mais une zone devra être définie avant l’export visuel.
              </div>
            ) : null}
          </div>
        ) : null}
      </DromapDialog>

      <DromapDialog
        open={replaceDialogOpen}
        title="Remplacer le projet temporaire ?"
        description="Le mode invité ne conserve qu’un seul projet actif sur cet appareil."
        onClose={() => {
          setReplaceDialogOpen(false);
          setPendingAction(null);
        }}
        footer={
          <>
            <DromapButton
              onClick={() => {
                setReplaceDialogOpen(false);
                setPendingAction(null);
              }}
            >
              Annuler
            </DromapButton>
            <DromapButton
              variant="danger"
              onClick={() => {
                const action = pendingAction;
                setReplaceDialogOpen(false);
                setPendingAction(null);
                if (action === "new") startNewProject(true);
                if (action === "import") fileInputRef.current?.click();
              }}
            >
              Remplacer le projet
            </DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                setReplaceDialogOpen(false);
                setPendingAction(null);
                router.push("/signup?returnTo=%2Fdashboard");
              }}
            >
              Créer un compte
            </DromapButton>
          </>
        }
      >
        <p className="text-sm leading-6 text-slate-700">
          Remplacer supprimera le projet temporaire actif après confirmation.
          Créer un compte permet de conserver le projet actuel et d’en créer plusieurs,
          avec sauvegarde en ligne.
        </p>
      </DromapDialog>
    </DromapProductShell>
  );
}

export function DromapDashboardClient() {
  return (
    <DromapProductBootstrap>
      <DashboardContent />
    </DromapProductBootstrap>
  );
}
