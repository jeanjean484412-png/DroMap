"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DromapButton } from "@/components/dromap-ui/button";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { createCanvasExportPreviewDataUrl } from "@/editor/export-download";
import { setTransientCustomMarkers } from "@/stores/editor-custom-markers";
import { createDashboardExportInput } from "./dashboard-project-export-dialog";
import { useDromapProductStore } from "@/stores/dromap-product";
import { resolveDromapPreferences } from "@/lib/dromap/preferences";
import {
  getDromapPublicationAccessLabel,
  isDromapSubscriberPlan,
  type DromapPublicationAccessMode,
  type DromapPublicPublication,
} from "@/lib/dromap/publications";

const MAX_PUBLIC_IMAGE_DATA_URL = 2_000_000;
const PUBLIC_MAX_WIDTH = 1800;
const PUBLIC_MAX_HEIGHT = 1350;
const PUBLIC_PREVIEW_MAX_WIDTH = 1100;
const PUBLIC_PREVIEW_MAX_HEIGHT = 825;
const THUMBNAIL_WIDTH = 720;
const THUMBNAIL_HEIGHT = 405;

function readApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}

function loadImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Le rendu de la carte n’a pas pu être préparé."));
    image.src = dataUrl;
  });
}

function encodeBestCompressedImage(
  canvas: HTMLCanvasElement,
  jpegQuality: number,
  webpQuality = jpegQuality,
) {
  const jpeg = canvas.toDataURL("image/jpeg", jpegQuality);
  const webp = canvas.toDataURL("image/webp", webpQuality);
  return webp.startsWith("data:image/webp;") && webp.length < jpeg.length ? webp : jpeg;
}

function renderJpeg(
  image: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number,
  scaleMultiplier = 1,
) {
  const naturalWidth = Math.max(1, image.naturalWidth);
  const naturalHeight = Math.max(1, image.naturalHeight);
  const fit = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight) * scaleMultiplier;
  const width = Math.max(1, Math.round(naturalWidth * fit));
  const height = Math.max(1, Math.round(naturalHeight * fit));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne peut pas préparer la publication.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function renderCompressedImage(
  image: HTMLImageElement,
  maxWidth: number,
  maxHeight: number,
  quality: number,
) {
  const naturalWidth = Math.max(1, image.naturalWidth);
  const naturalHeight = Math.max(1, image.naturalHeight);
  const fit = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * fit));
  const height = Math.max(1, Math.round(naturalHeight * fit));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne peut pas préparer la publication.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return encodeBestCompressedImage(canvas, quality, quality);
}

function renderThumbnail(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = THUMBNAIL_WIDTH;
  canvas.height = THUMBNAIL_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne peut pas préparer la miniature publique.");
  context.fillStyle = "#f8fafc";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(
    canvas.width / Math.max(1, image.naturalWidth),
    canvas.height / Math.max(1, image.naturalHeight),
  );
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  // Conserver la miniature publique en JPEG : elle sert aussi d’image Open Graph
  // et reste ainsi compatible avec les robots de partage les plus conservateurs.
  return canvas.toDataURL("image/jpeg", 0.82);
}

async function createPublicationImages(sourcePreviewDataUrl: string) {
  const image = await loadImage(sourcePreviewDataUrl);
  const thumbnailDataUrl = renderThumbnail(image);
  const previewDataUrl = renderCompressedImage(
    image,
    PUBLIC_PREVIEW_MAX_WIDTH,
    PUBLIC_PREVIEW_MAX_HEIGHT,
    0.84,
  );
  const attempts = [
    { quality: 0.9, scale: 1 },
    { quality: 0.84, scale: 0.9 },
    { quality: 0.78, scale: 0.8 },
    { quality: 0.72, scale: 0.7 },
  ];
  for (const attempt of attempts) {
    const imageDataUrl = renderJpeg(
      image,
      PUBLIC_MAX_WIDTH,
      PUBLIC_MAX_HEIGHT,
      attempt.quality,
      attempt.scale,
    );
    if (imageDataUrl.length <= MAX_PUBLIC_IMAGE_DATA_URL) {
      return { imageDataUrl, previewDataUrl, thumbnailDataUrl };
    }
  }
  throw new Error("Cette carte est trop volumineuse pour être publiée. Essaie de réduire les éléments très lourds puis recommence.");
}

export function DashboardProjectPublicationDialog({
  open,
  projectId,
  projectName,
  onClose,
  onPublicationChanged,
}: {
  open: boolean;
  projectId: string;
  projectName: string;
  onClose: () => void;
  onPublicationChanged?: (publication: DromapPublicPublication | null) => void;
}) {
  const router = useRouter();
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const accountName = useDromapProductStore((state) => state.accountName);
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const loadProject = useDromapProductStore((state) => state.loadProject);
  const syncProjectNow = useDromapProductStore((state) => state.syncProjectNow);
  const flushPersistence = useDromapProductStore((state) => state.flushPersistence);
  const resolvedPreferences = useMemo(
    () => resolveDromapPreferences(accountPreferences),
    [accountPreferences],
  );
  const subscriber = userMode === "authenticated" && isDromapSubscriberPlan(accountPlan);

  const [existing, setExisting] = useState<DromapPublicPublication | null>(null);
  const [checking, setChecking] = useState(false);
  const [working, setWorking] = useState(false);
  const [title, setTitle] = useState(projectName);
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [showAuthor, setShowAuthor] = useState(true);
  const [accessMode, setAccessMode] = useState<DromapPublicationAccessMode>("read-only");
  const [allowCreatorCreditRemoval, setAllowCreatorCreditRemoval] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTitle(projectName);
    setDescription("");
    setTagsText("");
    setShowAuthor(true);
    setAccessMode("read-only");
    setAllowCreatorCreditRemoval(false);
    setMessage(null);
    setError(null);
    setExisting(null);

    if (userMode !== "authenticated") return () => { cancelled = true; };
    setChecking(true);
    void fetch(`/api/dromap/publications/project/${encodeURIComponent(projectId)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { publication?: DromapPublicPublication | null; error?: string }
          | null;
        if (cancelled) return;
        if (!response.ok) {
          setError(readApiError(payload, "L’état de publication ne peut pas être chargé."));
          return;
        }
        const publication = payload?.publication ?? null;
        setExisting(publication);
        if (publication) {
          setTitle(publication.title);
          setDescription(publication.description);
          setTagsText(publication.tags.join(", "));
          setShowAuthor(Boolean(publication.authorName));
          setAccessMode(publication.accessMode);
          setAllowCreatorCreditRemoval(publication.allowCreatorCreditRemoval);
        }
      })
      .catch(() => {
        if (!cancelled) setError("L’état de publication ne peut pas être chargé.");
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });

    return () => { cancelled = true; };
  }, [open, projectId, projectName, userMode]);

  async function publish() {
    if (working) return;
    if (!subscriber) {
      setError("La publication de cartes est réservée aux abonnements Plus et Pro.");
      return;
    }
    if (!title.trim()) {
      setError("Donne un titre à la carte publique.");
      return;
    }

    setWorking(true);
    setError(null);
    setMessage("Vérification de la publication…");
    try {
      const preflightResponse = await fetch(
        `/api/dromap/publications/preflight?projectId=${encodeURIComponent(projectId)}&accessMode=${encodeURIComponent(accessMode)}`,
        { method: "GET", credentials: "same-origin", cache: "no-store" },
      );
      const preflightPayload = (await preflightResponse.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!preflightResponse.ok || preflightPayload?.ok !== true) {
        throw new Error(
          readApiError(
            preflightPayload,
            "La configuration de publication n’est pas prête. Vérifie Supabase puis réessaie.",
          ),
        );
      }

      setMessage("Synchronisation de ce projet…");
      await flushPersistence();
      const synced = await syncProjectNow(projectId);
      if (!synced && typeof navigator !== "undefined" && navigator.onLine) {
        throw new Error("Ce projet n’a pas pu être synchronisé en ligne. Réessaie avant de le publier.");
      }

      const loadResult = await loadProject(projectId);
      if (!loadResult.ok) throw new Error(loadResult.error);
      const project = useDromapProductStore.getState().projects.find((item) => item.id === projectId);
      if (!project?.editorSnapshot || project.contentLoaded === false) {
        throw new Error("Le contenu du projet n’est pas disponible.");
      }
      const input = createDashboardExportInput(project, {
        scaleUnits: resolvedPreferences.scaleUnits,
      });
      if (!input) throw new Error("Une zone de travail validée est nécessaire pour publier la carte.");

      setMessage("Création du rendu public…");
      const clearTransientMarkers = setTransientCustomMarkers(project.editorSnapshot.customMarkers ?? []);
      let previewDataUrl: string;
      try {
        previewDataUrl = await createCanvasExportPreviewDataUrl(input, 1);
      } finally {
        clearTransientMarkers();
      }
      const images = await createPublicationImages(previewDataUrl);
      const tags = tagsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 8);

      setMessage(existing ? "Mise à jour de la publication…" : "Publication de la carte…");
      const response = await fetch("/api/dromap/publications", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim(),
          authorName: showAuthor ? accountName : null,
          creatorCreditName: accessMode === "read-only" ? null : accountName,
          accessMode,
          allowCreatorCreditRemoval: accessMode === "read-only" ? false : allowCreatorCreditRemoval,
          tags,
          ...images,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { publication?: DromapPublicPublication; error?: string }
        | null;
      if (!response.ok || !payload?.publication) {
        throw new Error(readApiError(payload, "La carte n’a pas pu être publiée."));
      }
      setExisting(payload.publication);
      onPublicationChanged?.(payload.publication);
      setMessage(existing ? "Publication mise à jour." : "Carte publiée.");
    } catch (publishError) {
      setMessage(null);
      setError(publishError instanceof Error ? publishError.message : "La publication a échoué.");
    } finally {
      setWorking(false);
    }
  }

  async function unpublish() {
    if (!existing || working) return;
    setWorking(true);
    setError(null);
    setMessage("Retrait de la publication…");
    try {
      const response = await fetch(`/api/dromap/publications/${encodeURIComponent(existing.slug)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(readApiError(payload, "La carte n’a pas pu être retirée de la publication."));
      setExisting(null);
      onPublicationChanged?.(null);
      setMessage("La carte est de nouveau privée.");
    } catch (unpublishError) {
      setMessage(null);
      setError(unpublishError instanceof Error ? unpublishError.message : "Le retrait de la publication a échoué.");
    } finally {
      setWorking(false);
    }
  }

  const publicHref = existing ? `/library/${existing.slug}` : null;

  return (
    <DromapDialog
      open={open}
      title={existing ? "Publication de la carte" : "Publier la carte"}
      description="Choisis précisément ce que les visiteurs auront le droit de faire avec cette carte."
      onClose={() => { if (!working) onClose(); }}
      maxWidthClassName="max-w-2xl"
      scrollable
      footer={
        <>
          <DromapButton onClick={onClose} disabled={working}>Fermer</DromapButton>
          {existing ? (
            <DromapButton variant="danger" onClick={() => void unpublish()} disabled={working}>
              Retirer de la publication
            </DromapButton>
          ) : null}
          <DromapButton variant="primary" onClick={() => void publish()} disabled={working || checking || !subscriber}>
            {working ? "Traitement…" : existing ? "Mettre à jour" : "Publier"}
          </DromapButton>
        </>
      }
    >
      <div className="space-y-5">
        {userMode !== "authenticated" ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            <strong className="block font-black">Connexion nécessaire</strong>
            La bibliothèque publique est librement consultable, mais publier une carte nécessite un compte avec abonnement Plus ou Pro.
            <div className="mt-3 flex flex-wrap gap-2">
              <DromapButton variant="primary" onClick={() => router.push(`/signup?returnTo=${encodeURIComponent("/dashboard")}`)}>
                Créer un compte / se connecter
              </DromapButton>
              <DromapButton onClick={() => router.push("/library")}>Voir les cartes publiques</DromapButton>
            </div>
          </div>
        ) : !subscriber ? (
          <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-950">
            <strong className="block font-black">Fonction réservée aux abonnés</strong>
            Tu peux consulter toutes les cartes publiques gratuitement. Publier une carte reste réservé à Plus et Pro ; lorsqu’un créateur autorise l’export, une carte publique peut aussi être achetée à l’unité.
            <div className="mt-3 flex flex-wrap gap-2">
              <DromapButton variant="primary" onClick={() => router.push("/pricing")}>Voir les formules</DromapButton>
              <DromapButton onClick={() => router.push("/library")}>Voir les cartes publiques</DromapButton>
            </div>
          </div>
        ) : null}

        {existing && publicHref ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-black">Carte publique</div>
                <div className="mt-1 text-xs leading-5 text-emerald-800">{getDromapPublicationAccessLabel(existing.accessMode)}.</div>
              </div>
              <Link href={publicHref} target="_blank" className="rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-black text-emerald-800 hover:bg-emerald-100">
                Ouvrir la page publique ↗
              </Link>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4">
          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Titre public
            <input
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              disabled={working || !subscriber}
              className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Description <span className="font-normal text-slate-500">(facultatif)</span>
            <textarea
              value={description}
              maxLength={800}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
              disabled={working || !subscriber}
              placeholder="Explique brièvement ce que montre la carte."
              className="resize-y rounded-xl border border-slate-300 px-3 py-2.5 font-normal leading-6 outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
            />
          </label>

          <label className="grid gap-2 text-sm font-semibold text-slate-800">
            Mots-clés <span className="font-normal text-slate-500">(jusqu’à 8, séparés par des virgules)</span>
            <input
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
              disabled={working || !subscriber}
              placeholder="France, population, transports…"
              className="rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100 disabled:bg-slate-100"
            />
          </label>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showAuthor}
              onChange={(event) => setShowAuthor(event.target.checked)}
              disabled={working || !subscriber}
              className="mt-0.5 h-4 w-4 accent-teal-600"
            />
            <span>
              <strong className="block text-slate-900">Afficher mon nom de créateur</strong>
              {showAuthor ? `La bibliothèque affichera « ${accountName} ».` : "La carte sera affichée sans nom de créateur."}
            </span>
          </label>

          <fieldset className="rounded-2xl border border-slate-200 bg-white p-4">
            <legend className="px-1 text-sm font-black text-slate-950">Droits accordés sur la carte</legend>
            <p className="mb-3 text-xs leading-5 text-slate-600">La consultation de la bibliothèque reste gratuite pour tout le monde. Ces droits concernent l’export et la création d’une copie modifiable.</p>
            <div className="grid gap-2">
              {([
                ["read-only", "Lecture seule", "Les visiteurs peuvent uniquement consulter la carte."],
                ["export", "Lecture + export", "Un abonné ou un acheteur peut exporter le rendu, mais pas modifier la carte."],
                ["edit-export", "Lecture + modification + export", "Un abonné ou un acheteur peut créer sa propre copie modifiable puis l’exporter."],
              ] as const).map(([value, label, help]) => (
                <label key={value} className={["flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition", accessMode === value ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-slate-50 hover:border-slate-300"].join(" ")}>
                  <input
                    type="radio"
                    name="publication-access-mode"
                    value={value}
                    checked={accessMode === value}
                    onChange={() => {
                      setAccessMode(value);
                      if (value === "read-only") setAllowCreatorCreditRemoval(false);
                    }}
                    disabled={working || !subscriber}
                    className="mt-1 h-4 w-4 accent-teal-600"
                  />
                  <span>
                    <strong className="block text-sm text-slate-950">{label}</strong>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">{help}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {accessMode !== "read-only" ? (
            <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
              <div className="font-black">Mention du créateur dans les exports</div>
              <p className="mt-1 text-xs leading-5 text-teal-800">Les exports porteront uniquement « {accountName} ». Si tu n’autorises pas sa suppression, l’utilisateur pourra déplacer cette mention sur la carte, mais pas la retirer.</p>
              <label className="mt-3 flex items-start gap-3 rounded-xl border border-teal-200 bg-white/80 p-3">
                <input
                  type="checkbox"
                  checked={allowCreatorCreditRemoval}
                  onChange={(event) => setAllowCreatorCreditRemoval(event.target.checked)}
                  disabled={working || !subscriber}
                  className="mt-0.5 h-4 w-4 accent-teal-600"
                />
                <span>
                  <strong className="block text-sm">Autoriser la suppression de mon nom sur l’export</strong>
                  <span className="mt-0.5 block text-xs leading-5 text-teal-800">{allowCreatorCreditRemoval ? "L’utilisateur pourra masquer ou déplacer la mention." : "La mention restera obligatoire, mais pourra être déplacée."}</span>
                </span>
              </label>
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
          La publication enregistre un rendu figé de la carte au moment où tu cliques sur Publier ou Mettre à jour. Les modifications futures du projet privé ne changent pas automatiquement la version publique.
        </div>

        {checking ? <div className="text-sm text-slate-500">Vérification de la publication…</div> : null}
        {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">{message}</div> : null}
        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">{error}</div> : null}
      </div>
    </DromapDialog>
  );
}
