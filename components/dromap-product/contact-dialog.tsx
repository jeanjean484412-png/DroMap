"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import { useDromapProductStore } from "@/stores/dromap-product";
import { getProjectStatusLabel, type DromapProject } from "@/lib/dromap/product";
import { getDromapBasemapConfig } from "@/lib/dromap/basemap";
import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";

const CONTACT_CATEGORIES = [
  {
    value: "technical",
    label: "Problème technique / bug",
    hint: "Indique ce que tu faisais, ce qui s’est passé et, si possible, comment reproduire le problème.",
  },
  {
    value: "suggestion",
    label: "Suggestion / idée",
    hint: "Décris le besoin, l’amélioration souhaitée et dans quel cas elle te serait utile.",
  },
  {
    value: "billing",
    label: "Abonnement / paiement",
    hint: "Précise la formule concernée et la date approximative. N’envoie jamais de numéro complet de carte bancaire.",
  },
  {
    value: "account",
    label: "Compte / connexion",
    hint: "Explique ce que tu essaies de faire et le message affiché. N’envoie jamais ton mot de passe.",
  },
  {
    value: "data",
    label: "Import / export / données",
    hint: "Précise le format concerné et joins un petit fichier d’exemple si cela aide à comprendre le problème.",
  },
  {
    value: "usage",
    label: "Question sur l’utilisation",
    hint: "Explique ce que tu veux obtenir dans DroMap et l’étape qui te pose question.",
  },
  {
    value: "legal",
    label: "Licences / crédits / confidentialité",
    hint: "Utilise cette catégorie pour les sources, attributions, droits d’utilisation ou données personnelles.",
  },
  {
    value: "other",
    label: "Autre demande",
    hint: "Pour toute demande qui ne correspond pas aux catégories ci-dessus.",
  },
] as const;

const MAX_ATTACHMENT_COUNT = 3;
const MAX_ATTACHMENT_TOTAL_BYTES = 3 * 1024 * 1024;
const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
  ".txt",
  ".log",
  ".json",
  ".csv",
];

function readableBytes(value: number) {
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} Ko`;
  return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
}

function isAcceptedFile(file: File) {
  const lowerName = file.name.toLowerCase();
  return ACCEPTED_ATTACHMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
}

function formatProjectDate(value: string | null | undefined) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildProjectContext(project: DromapProject, userMode: "guest" | "authenticated") {
  const snapshot = project.editorSnapshot;
  const basemapId = snapshot?.basemapId ?? project.setup.basemapId;
  const basemap = getDromapBasemapConfig(basemapId);

  return {
    id: project.id,
    name: project.name,
    status: getProjectStatusLabel(project, userMode),
    setupComplete: project.setupComplete,
    setupStep: project.setup.currentStep,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    lastSavedAt: project.lastSavedAt,
    deletedAt: project.deletedAt,
    pendingChanges: project.pendingChanges,
    contentLoaded: project.contentLoaded ?? Boolean(snapshot),
    basemapId,
    basemapLabel: basemap.label,
    hasWorkspace: Boolean(snapshot?.workspaceBounds ?? project.setup.workspaceBounds),
    featureCount: snapshot?.features.length ?? null,
    drawingLayerCount: snapshot?.layers?.length ?? null,
    geoJsonLayerCount: snapshot?.geoJsonLayers?.length ?? null,
    customMarkerCount: snapshot?.customMarkers?.length ?? null,
    importedFileName: project.importedFileName,
    remoteRevision: project.remoteRevision ?? null,
    remoteUpdatedAt: project.remoteUpdatedAt ?? null,
  };
}

export function DromapContactDialog({
  open,
  pathname,
  onClose,
}: {
  open: boolean;
  pathname: string;
  onClose: () => void;
}) {
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountName = useDromapProductStore((state) => state.accountName);
  const accountEmail = useDromapProductStore((state) => state.accountEmail);
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const activeProjectId = useDromapProductStore((state) => state.activeProjectId);
  const projects = useDromapProductStore((state) => state.projects);

  const selectableProjects = useMemo(
    () =>
      [...projects].sort(
        (left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [projects],
  );

  const suggestedProjectId = useMemo(() => {
    if (activeProjectId && selectableProjects.some((project) => project.id === activeProjectId)) {
      return activeProjectId;
    }
    return selectableProjects.find((project) => project.status !== "trashed")?.id ?? selectableProjects[0]?.id ?? "";
  }, [activeProjectId, selectableProjects]);

  const [name, setName] = useState(accountName || "");
  const [email, setEmail] = useState(accountEmail || "");
  const [category, setCategory] = useState<(typeof CONTACT_CATEGORIES)[number]["value"]>("technical");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [includeTechnicalContext, setIncludeTechnicalContext] = useState(true);
  const [includeProjectContext, setIncludeProjectContext] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedProject = useMemo(
    () => selectableProjects.find((project) => project.id === selectedProjectId) ?? null,
    [selectableProjects, selectedProjectId],
  );

  const attachmentTotal = useMemo(
    () => files.reduce((total, file) => total + file.size, 0),
    [files],
  );

  useEffect(() => {
    if (!open) return;
    setName(accountName || "");
    setEmail(accountEmail || "");
    setSelectedProjectId((current) =>
      current && selectableProjects.some((project) => project.id === current)
        ? current
        : suggestedProjectId,
    );
  }, [accountEmail, accountName, open, selectableProjects, suggestedProjectId]);

  const closeAndReset = () => {
    if (sending) return;
    setCategory("technical");
    setSubject("");
    setMessage("");
    setIncludeTechnicalContext(true);
    setIncludeProjectContext(false);
    setSelectedProjectId(suggestedProjectId);
    setFiles([]);
    setError(null);
    setSent(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    onClose();
  };

  const handleFileChange = (nextFiles: File[]) => {
    setError(null);

    if (nextFiles.length > MAX_ATTACHMENT_COUNT) {
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(`Tu peux joindre au maximum ${MAX_ATTACHMENT_COUNT} fichiers.`);
      return;
    }

    const unsupported = nextFiles.find((file) => !isAcceptedFile(file));
    if (unsupported) {
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError(`Le fichier « ${unsupported.name} » n’est pas dans un format autorisé.`);
      return;
    }

    const total = nextFiles.reduce((sum, file) => sum + file.size, 0);
    if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setError("Les pièces jointes ne doivent pas dépasser 3 Mo au total.");
      return;
    }

    setFiles(nextFiles);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending) return;

    setError(null);

    if (includeProjectContext && !selectedProject) {
      setError("Choisis le projet dont tu veux joindre les informations.");
      return;
    }

    setSending(true);

    try {
      const formData = new FormData(event.currentTarget);
      formData.set("name", name.trim());
      formData.set("email", email.trim());
      formData.set("category", category);
      formData.set("subject", subject.trim());
      formData.set("message", message.trim());
      formData.delete("attachments");
      for (const file of files) formData.append("attachments", file, file.name);

      if (includeTechnicalContext) {
        const technicalContext = {
          page: pathname,
          accountPlan,
          userMode,
          browser: typeof navigator !== "undefined" ? navigator.userAgent : null,
          language: typeof navigator !== "undefined" ? navigator.language : null,
          viewport:
            typeof window !== "undefined"
              ? `${window.innerWidth}x${window.innerHeight}`
              : null,
          timeZone:
            typeof Intl !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone || null
              : null,
        };
        formData.set("technicalContext", JSON.stringify(technicalContext));
      } else {
        formData.delete("technicalContext");
      }

      if (includeProjectContext && selectedProject) {
        formData.set("projectContext", JSON.stringify(buildProjectContext(selectedProject, userMode)));
      } else {
        formData.delete("projectContext");
      }

      const response = await fetch("/api/dromap/contact", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Le message n’a pas pu être envoyé.");
      }

      setSent(true);
      setSubject("");
      setMessage("");
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Le message n’a pas pu être envoyé.",
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <DromapDialog
      open={open}
      title="Contacter DroMap"
      description="Pose une question, signale un problème ou envoie une suggestion directement à contact@dromap.fr."
      onClose={closeAndReset}
      maxWidthClassName="max-w-2xl"
      footer={
        sent ? (
          <DromapButton variant="primary" onClick={closeAndReset}>
            Fermer
          </DromapButton>
        ) : (
          <>
            <DromapButton variant="secondary" onClick={closeAndReset} disabled={sending}>
              Annuler
            </DromapButton>
            <DromapButton
              variant="primary"
              type="submit"
              form="dromap-contact-form"
              disabled={sending}
            >
              {sending ? "Envoi en cours…" : "Envoyer à DroMap"}
            </DromapButton>
          </>
        )
      }
    >
      {sent ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-sm text-emerald-950">
          <div className="font-black">Message envoyé.</div>
          <p className="mt-2 leading-6">
            Ta demande a bien été transmise à contact@dromap.fr. Une réponse pourra être envoyée à l’adresse indiquée dans le formulaire.
          </p>
        </div>
      ) : (
        <form id="dromap-contact-form" onSubmit={handleSubmit} className="max-h-[68vh] space-y-5 overflow-y-auto pr-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-800">
              Nom
              <input
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                autoComplete="name"
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                placeholder="Ton nom"
              />
            </label>

            <label className="block text-sm font-semibold text-slate-800">
              Adresse e-mail <span className="text-red-600">*</span>
              <input
                name="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                maxLength={254}
                autoComplete="email"
                required
                readOnly={userMode === "authenticated" && Boolean(accountEmail)}
                className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition read-only:bg-slate-50 read-only:text-slate-600 focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                placeholder="nom@exemple.fr"
              />
            </label>
          </div>

          <fieldset>
            <legend className="text-sm font-black text-slate-900">Nature de la demande</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {CONTACT_CATEGORIES.map((item) => (
                <label
                  key={item.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-sm transition ${
                    category === item.value
                      ? "border-teal-500 bg-teal-50 text-teal-950"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="category"
                    value={item.value}
                    checked={category === item.value}
                    onChange={() => setCategory(item.value)}
                    className="h-4 w-4 accent-teal-600"
                  />
                  <span className="font-semibold">{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2.5 text-xs leading-5 text-teal-900">
            {CONTACT_CATEGORIES.find((item) => item.value === category)?.hint}
          </p>

          <label className="block text-sm font-semibold text-slate-800">
            Sujet <span className="text-red-600">*</span>
            <input
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              minLength={3}
              maxLength={140}
              required
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              placeholder="Résume ta demande en quelques mots"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-800">
            Message <span className="text-red-600">*</span>
            <textarea
              name="message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              minLength={10}
              maxLength={10000}
              required
              rows={7}
              className="mt-2 w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
              placeholder="Décris le problème, ta question ou ton idée. Pour un bug, indique si possible ce que tu faisais juste avant qu’il apparaisse."
            />
          </label>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <label className={`flex items-start gap-3 text-sm text-slate-700 ${selectableProjects.length ? "cursor-pointer" : "opacity-60"}`}>
              <input
                type="checkbox"
                checked={includeProjectContext}
                disabled={!selectableProjects.length}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setIncludeProjectContext(checked);
                  if (checked && !selectedProjectId) setSelectedProjectId(suggestedProjectId);
                }}
                className="mt-0.5 h-4 w-4 accent-teal-600"
              />
              <span>
                <span className="block font-black text-slate-900">Joindre les informations d’un projet</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Utile pour un bug, un problème d’export, de sauvegarde ou de données. Tu choisis toi-même le projet concerné.
                </span>
              </span>
            </label>

            {!selectableProjects.length ? (
              <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-600">
                Aucun projet n’est disponible sur ce compte ou cet appareil.
              </p>
            ) : includeProjectContext ? (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <label className="block text-sm font-semibold text-slate-800">
                  Projet concerné <span className="text-red-600">*</span>
                  <select
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    required={includeProjectContext}
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  >
                    {selectableProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}{project.status === "trashed" ? " — Corbeille" : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {selectedProject ? (
                  <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50 px-3 py-3 text-xs leading-5 text-teal-950">
                    <div className="font-black">Informations qui seront jointes</div>
                    <div className="mt-1">
                      {getProjectStatusLabel(selectedProject, userMode)} · modifié le {formatProjectDate(selectedProject.updatedAt) ?? "date inconnue"}
                    </div>
                    <div>
                      Fond : {getDromapBasemapConfig(selectedProject.editorSnapshot?.basemapId ?? selectedProject.setup.basemapId).label}
                      {selectedProject.editorSnapshot
                        ? ` · ${selectedProject.editorSnapshot.features.length} objet(s) · ${selectedProject.editorSnapshot.geoJsonLayers?.length ?? 0} calque(s) GeoJSON`
                        : " · contenu détaillé non chargé sur cet écran"}
                    </div>
                    <div className="mt-1 text-teal-800">
                      Sont envoyés : nom/identifiant du projet, état, dates, fond, présence d’une zone et compteurs techniques disponibles. Le contenu des objets, les coordonnées et la carte elle-même ne sont pas envoyés automatiquement.
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={includeTechnicalContext}
              onChange={(event) => setIncludeTechnicalContext(event.target.checked)}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <span>
              <span className="block font-black text-slate-900">Inclure les informations techniques générales</span>
              <span className="mt-1 block text-xs leading-5 text-slate-600">
                Page du menu actuellement ouverte, formule, navigateur, langue, taille de fenêtre et fuseau horaire. Ces informations sont distinctes du projet éventuellement choisi ci-dessus.
              </span>
            </span>
          </label>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-sm font-black text-slate-900">Pièces jointes facultatives</div>
            <p className="mt-1 text-xs leading-5 text-slate-600">
              Capture d’écran, PDF, fichier texte, log, JSON ou CSV. Maximum 3 fichiers et 3 Mo au total.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              name="attachments"
              multiple
              accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.log,.json,.csv,image/png,image/jpeg,image/webp,application/pdf,text/plain,application/json,text/csv"
              onChange={(event) => handleFileChange(Array.from(event.target.files ?? []))}
              className="mt-3 block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white hover:file:bg-slate-700"
            />
            {files.length ? (
              <div className="mt-3 space-y-1 text-xs text-slate-600">
                {files.map((file) => (
                  <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3">
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0">{readableBytes(file.size)}</span>
                  </div>
                ))}
                <div className="pt-1 font-bold text-slate-800">Total : {readableBytes(attachmentTotal)}</div>
              </div>
            ) : null}
          </div>

          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />

          <p className="text-xs leading-5 text-slate-500">
            N’envoie jamais de mot de passe, clé API, numéro complet de carte bancaire ou autre secret dans ce formulaire.
          </p>

          {error ? (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
              {error}
            </div>
          ) : null}
        </form>
      )}
    </DromapDialog>
  );
}
