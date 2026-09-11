"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DromapButton } from "@/components/dromap-ui/button";
import {
  createDromapPublicMapCheckout,
  confirmDromapCheckout,
} from "@/lib/dromap/billing";
import { fetchDromapPublicationSource } from "@/lib/dromap/publication-source";
import {
  getDromapPublicationAccessLabel,
  type DromapPublicationViewerAccess,
  type DromapPublicPublication,
} from "@/lib/dromap/publications";
import { useDromapProductStore } from "@/stores/dromap-product";

type CreatorCreditMapPosition = { x: number; y: number };

const DEFAULT_CREDIT_POSITION: CreatorCreditMapPosition = { x: 0.12, y: 0.9 };


function LockIcon({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M7.5 10V7.75a4.5 4.5 0 0 1 9 0V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="5" y="10" width="14" height="10" rx="2.25" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 14v2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date(value));
  } catch {
    return value;
  }
}

function readApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const error = (payload as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim()) return error.trim();
  }
  return fallback;
}

function loadBlobImage(blob: Blob) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("L’image publiée n’a pas pu être préparée."));
    };
    image.src = url;
  });
}

function getCreatorCreditMetrics(width: number, label: string) {
  const safeLabel = label.trim();
  const fontSize = Math.max(10, Math.min(20, Math.round(width / 95)));
  const paddingX = Math.max(7, Math.round(fontSize * 0.7));
  const paddingY = Math.max(5, Math.round(fontSize * 0.45));
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) {
    return { fontSize, paddingX, paddingY, boxWidth: Math.max(80, width * 0.14), boxHeight: fontSize + paddingY * 2 };
  }
  measureContext.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  const textWidth = measureContext.measureText(safeLabel).width;
  return {
    fontSize,
    paddingX,
    paddingY,
    boxWidth: textWidth + paddingX * 2,
    boxHeight: fontSize + paddingY * 2,
  };
}

function detectAutomaticCreatorCreditPosition(
  image: CanvasImageSource,
  width: number,
  height: number,
  label: string,
): CreatorCreditMapPosition {
  const safeLabel = label.trim();
  if (!safeLabel) return DEFAULT_CREDIT_POSITION;

  const metrics = getCreatorCreditMetrics(width, safeLabel);
  const padding = Math.max(12, Math.round(metrics.fontSize * 0.9));
  const centerLeft = (padding + metrics.boxWidth / 2) / width;
  const centerRight = (width - padding - metrics.boxWidth / 2) / width;
  const centerTop = (padding + metrics.boxHeight / 2) / height;
  const centerBottom = (height - padding - metrics.boxHeight / 2) / height;
  const candidates = [
    { x: centerLeft, y: centerTop },
    { x: centerRight, y: centerTop },
    { x: centerLeft, y: centerBottom },
    { x: centerRight, y: centerBottom },
  ];

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return candidates[2] ?? DEFAULT_CREDIT_POSITION;
  context.drawImage(image, 0, 0, width, height);

  let best = candidates[2] ?? DEFAULT_CREDIT_POSITION;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const left = Math.max(0, Math.round(candidate.x * width - metrics.boxWidth / 2 - 8));
    const top = Math.max(0, Math.round(candidate.y * height - metrics.boxHeight / 2 - 8));
    const sampleWidth = Math.max(1, Math.min(width - left, Math.round(metrics.boxWidth + 16)));
    const sampleHeight = Math.max(1, Math.min(height - top, Math.round(metrics.boxHeight + 16)));
    const imageData = context.getImageData(left, top, sampleWidth, sampleHeight).data;
    let score = 0;
    let darkPixels = 0;
    const stride = 4;
    for (let y = 0; y < sampleHeight; y += 3) {
      for (let x = 0; x < sampleWidth; x += 3) {
        const index = (y * sampleWidth + x) * stride;
        const r = imageData[index] ?? 255;
        const g = imageData[index + 1] ?? 255;
        const b = imageData[index + 2] ?? 255;
        const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luminance < 170) darkPixels += 1;
        if (x + 3 < sampleWidth) {
          const ni = (y * sampleWidth + (x + 3)) * stride;
          const nr = imageData[ni] ?? r;
          const ng = imageData[ni + 1] ?? g;
          const nb = imageData[ni + 2] ?? b;
          score += Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb);
        }
        if (y + 3 < sampleHeight) {
          const ni = ((y + 3) * sampleWidth + x) * stride;
          const nr = imageData[ni] ?? r;
          const ng = imageData[ni + 1] ?? g;
          const nb = imageData[ni + 2] ?? b;
          score += Math.abs(r - nr) + Math.abs(g - ng) + Math.abs(b - nb);
        }
      }
    }
    const weightedScore = score + darkPixels * 20;
    if (weightedScore < bestScore) {
      bestScore = weightedScore;
      best = candidate;
    }
  }

  return best;
}

function drawCreatorCredit(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  label: string,
  position: CreatorCreditMapPosition,
) {
  const safeLabel = label.trim();
  if (!safeLabel) return;

  const { fontSize, paddingX, paddingY } = getCreatorCreditMetrics(width, safeLabel);
  context.save();
  context.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  context.textBaseline = "middle";
  const textWidth = context.measureText(safeLabel).width;
  const boxWidth = textWidth + paddingX * 2;
  const boxHeight = fontSize + paddingY * 2;
  const centerX = Math.max(0, Math.min(1, position.x)) * width;
  const centerY = Math.max(0, Math.min(1, position.y)) * height;
  const x = Math.max(0, Math.min(width - boxWidth, centerX - boxWidth / 2));
  const y = Math.max(0, Math.min(height - boxHeight, centerY - boxHeight / 2));

  context.fillStyle = "rgba(255, 255, 255, 0.88)";
  context.fillRect(x, y, boxWidth, boxHeight);
  context.strokeStyle = "rgba(15, 23, 42, 0.18)";
  context.lineWidth = 1;
  context.strokeRect(x + 0.5, y + 0.5, Math.max(0, boxWidth - 1), Math.max(0, boxHeight - 1));
  context.fillStyle = "rgba(15, 23, 42, 0.82)";
  context.fillText(safeLabel, x + paddingX, y + boxHeight / 2);
  context.restore();
}

async function createPublicDownloadBlob(
  sourceBlob: Blob,
  creatorName: string | null,
  position: CreatorCreditMapPosition | null,
  hidden: boolean,
) {
  if (hidden || !creatorName?.trim()) return sourceBlob;
  const image = await loadBlobImage(sourceBlob);
  const width = Math.max(1, image.naturalWidth || image.width);
  const height = Math.max(1, image.naturalHeight || image.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Le navigateur ne peut pas préparer cet export.");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const finalPosition = position ?? detectAutomaticCreatorCreditPosition(image, width, height, creatorName.trim());
  drawCreatorCredit(context, width, height, creatorName.trim(), finalPosition);
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Le fichier JPEG n’a pas pu être créé."))),
      "image/jpeg",
      0.94,
    );
  });
}

function safeDownloadName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${normalized || "carte-dromap"}.jpg`;
}

function PublicCreatorCreditOverlay({
  name,
  position,
  onPositionChange,
}: {
  name: string;
  position: CreatorCreditMapPosition;
  onPositionChange: (position: CreatorCreditMapPosition) => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    parentRect: DOMRect;
    halfWidth: number;
    halfHeight: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    const element = event.currentTarget;
    const parent = element.parentElement;
    if (!parent) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = element.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      parentRect,
      halfWidth: rect.width / 2,
      halfHeight: rect.height / 2,
      offsetX: event.clientX - (rect.left + rect.width / 2),
      offsetY: event.clientY - (rect.top + rect.height / 2),
    };
    element.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const parentWidth = Math.max(1, drag.parentRect.width);
    const parentHeight = Math.max(1, drag.parentRect.height);
    const minX = drag.halfWidth / parentWidth;
    const maxX = 1 - minX;
    const minY = drag.halfHeight / parentHeight;
    const maxY = 1 - minY;
    onPositionChange({
      x: Math.max(Math.min(minX, 0.5), Math.min(Math.max(maxX, 0.5), (event.clientX - drag.offsetX - drag.parentRect.left) / parentWidth)),
      y: Math.max(Math.min(minY, 0.5), Math.min(Math.max(maxY, 0.5), (event.clientY - drag.offsetY - drag.parentRect.top) / parentHeight)),
    });
  }

  function finish(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function stopClick(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClick={stopClick}
      className="absolute z-20 cursor-grab touch-none select-none whitespace-nowrap border border-slate-900/20 bg-white/[0.88] px-2 py-1 text-xs font-bold leading-none text-slate-900/[0.82] active:cursor-grabbing hover:ring-2 hover:ring-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
      style={{
        left: `${Math.max(0, Math.min(1, position.x)) * 100}%`,
        top: `${Math.max(0, Math.min(1, position.y)) * 100}%`,
        transform: "translate(-50%, -50%)",
      }}
      title="Glisser pour déplacer le nom du créateur."
      aria-label="Déplacer le nom du créateur"
    >
      {name.trim()}
    </button>
  );
}

function PublicMapContent({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userMode = useDromapProductStore((state) => state.userMode);
  const createProject = useDromapProductStore((state) => state.createProject);
  const syncAllProjects = useDromapProductStore((state) => state.syncAllProjects);
  const refreshAccountSession = useDromapProductStore((state) => state.refreshAccountSession);

  const [publication, setPublication] = useState<DromapPublicPublication | null>(null);
  const [viewerAccess, setViewerAccess] = useState<DromapPublicationViewerAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creditPosition, setCreditPosition] = useState<CreatorCreditMapPosition>(DEFAULT_CREDIT_POSITION);
  const [creditPositionCustomized, setCreditPositionCustomized] = useState(false);
  const [hideCreatorCredit, setHideCreatorCredit] = useState(false);
  const checkoutHandledRef = useRef<string | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);

  const loadPublication = useCallback(async () => {
    const response = await fetch(`/api/dromap/publications/${encodeURIComponent(slug)}`, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          publication?: DromapPublicPublication;
          viewerAccess?: DromapPublicationViewerAccess;
          error?: string;
        }
      | null;
    if (!response.ok || !payload?.publication || !payload.viewerAccess) {
      throw new Error(readApiError(payload, "Cette carte publique n’est pas disponible."));
    }
    setPublication(payload.publication);
    setViewerAccess(payload.viewerAccess);
    if (!payload.viewerAccess.allowCreatorCreditRemoval) setHideCreatorCredit(false);
    return payload;
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPublication()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Cette carte publique n’est pas disponible.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPublication]);

  useEffect(() => {
    setCreditPosition(DEFAULT_CREDIT_POSITION);
    setCreditPositionCustomized(false);
  }, [slug, publication?.previewDataUrl, publication?.thumbnailDataUrl, viewerAccess?.creatorCreditName]);

  const previewCreatorName = viewerAccess?.creatorCreditName;
  const autoPlacePreviewCredit = useCallback(() => {
    if (creditPositionCustomized || !previewCreatorName) return;
    const image = previewImageRef.current;
    if (!image) return;
    const width = Math.max(1, image.naturalWidth || image.width);
    const height = Math.max(1, image.naturalHeight || image.height);
    setCreditPosition(detectAutomaticCreatorCreditPosition(image, width, height, previewCreatorName));
  }, [creditPositionCustomized, previewCreatorName]);

  useEffect(() => {
    autoPlacePreviewCredit();
  }, [autoPlacePreviewCredit]);

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    const sessionId = searchParams.get("session_id")?.trim() ?? "";
    const checkoutKey = checkout === "success" && sessionId ? sessionId : checkout ?? "";
    if (!checkoutKey || checkoutHandledRef.current === checkoutKey) return;
    checkoutHandledRef.current = checkoutKey;

    if (checkout === "cancelled") {
      setActionMessage("Achat annulé. Aucun droit supplémentaire n’a été débloqué.");
      router.replace(`/library/${encodeURIComponent(slug)}`);
      return;
    }
    if (checkout !== "success" || !sessionId) return;

    setActionError(null);
    setActionMessage("Vérification du paiement…");
    void (async () => {
      const result = await confirmDromapCheckout(sessionId);
      if (!result.ok) {
        if (result.data?.pending) {
          setActionMessage("Paiement reçu. Les droits sont en cours d’activation ; recharge la page dans quelques secondes.");
        } else {
          setActionMessage(null);
          setActionError(result.error ?? "Le paiement n’a pas pu être vérifié.");
        }
        return;
      }
      await refreshAccountSession().catch(() => false);
      await loadPublication();
      setActionMessage("Achat confirmé : les droits autorisés par le créateur sont débloqués sur ton compte.");
    })()
      .catch((checkoutError) => {
        setActionMessage(null);
        setActionError(checkoutError instanceof Error ? checkoutError.message : "Le paiement n’a pas pu être vérifié.");
      })
      .finally(() => {
        router.replace(`/library/${encodeURIComponent(slug)}`);
      });
  }, [loadPublication, refreshAccountSession, router, searchParams, slug]);

  const accessLabel = useMemo(
    () => (publication ? getDromapPublicationAccessLabel(publication.accessMode) : "Lecture seule"),
    [publication],
  );

  async function startPurchase() {
    if (purchaseBusy) return;
    if (userMode !== "authenticated") {
      router.push(`/signup?returnTo=${encodeURIComponent(`/library/${slug}`)}`);
      return;
    }
    setPurchaseBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const result = await createDromapPublicMapCheckout(slug);
      if (!result.ok || !result.data?.url) {
        throw new Error(result.error ?? "Le paiement ne peut pas être démarré.");
      }
      window.location.assign(result.data.url);
    } catch (purchaseError) {
      setActionError(purchaseError instanceof Error ? purchaseError.message : "Le paiement ne peut pas être démarré.");
      setPurchaseBusy(false);
    }
  }

  async function download() {
    if (downloadBusy || !publication || !viewerAccess?.canExport) return;
    setDownloadBusy(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/dromap/publications/${encodeURIComponent(slug)}/download`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(readApiError(payload, "Téléchargement impossible."));
      }
      const rawBlob = await response.blob();
      const shouldHide = viewerAccess.allowCreatorCreditRemoval && hideCreatorCredit;
      const finalBlob = await createPublicDownloadBlob(
        rawBlob,
        viewerAccess.creatorCreditName,
        shouldHide ? null : creditPositionCustomized ? creditPosition : null,
        shouldHide,
      );
      const url = URL.createObjectURL(finalBlob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeDownloadName(publication.title);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setActionMessage("Export JPEG préparé et téléchargé.");
    } catch (downloadError) {
      setActionError(downloadError instanceof Error ? downloadError.message : "Téléchargement momentanément indisponible.");
    } finally {
      setDownloadBusy(false);
    }
  }

  async function createEditableCopy() {
    if (copyBusy || !publication || !viewerAccess?.canEdit) return;
    if (userMode !== "authenticated") {
      router.push(`/signup?returnTo=${encodeURIComponent(`/library/${slug}`)}`);
      return;
    }
    setCopyBusy(true);
    setActionError(null);
    setActionMessage("Préparation de la copie modifiable…");
    let createdProjectId: string | null = null;
    try {
      const source = await fetchDromapPublicationSource(slug);
      createdProjectId = createProject({
        id: source.copyProof.projectId,
        name: `${source.sourceName} — copie`,
        setupComplete: true,
        initialBasemapId: source.basemapId,
        snapshot: source.snapshot,
        sourceAttribution: {
          kind: "public-map",
          publicationSlug: source.attribution.publicationSlug,
          creatorName: source.attribution.creatorName,
          allowRemoval: source.attribution.allowRemoval,
          position: "bottom-left",
          mapPosition: { x: 0.12, y: 0.9 },
          hidden: false,
        },
      });
      if (!createdProjectId) {
        throw new Error("La copie n’a pas pu être créée dans Mes projets.");
      }

      setActionMessage("Enregistrement de la copie dans ton compte…");
      const synced = await syncAllProjects();
      if (!synced) {
        throw new Error("La copie a été créée localement, mais elle n’a pas pu être enregistrée en ligne. Vérifie ta connexion puis réessaie depuis Mes projets.");
      }

      const registerResponse = await fetch(
        `/api/dromap/publications/${encodeURIComponent(slug)}/register-copy`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: createdProjectId, copyToken: source.copyProof.token }),
        },
      );
      const registerPayload = (await registerResponse.json().catch(() => null)) as
        | { ok?: boolean; exportEntitlementGranted?: boolean; error?: string }
        | null;
      if (!registerResponse.ok || registerPayload?.ok !== true) {
        throw new Error(readApiError(registerPayload, "Les droits de la copie n’ont pas pu être finalisés."));
      }

      if (source.purchased || registerPayload.exportEntitlementGranted) {
        await refreshAccountSession();
      }
      setActionMessage("Copie créée. Ouverture de l’éditeur…");
      router.push(`/projects/${encodeURIComponent(createdProjectId)}/editor`);
    } catch (copyError) {
      const suffix = createdProjectId
        ? " La copie locale n’a pas été supprimée afin de ne pas perdre de données."
        : "";
      setActionMessage(null);
      setActionError(
        `${copyError instanceof Error ? copyError.message : "La copie modifiable n’a pas pu être créée."}${suffix}`,
      );
    } finally {
      setCopyBusy(false);
    }
  }

  return (
    <DromapProductShell
      title={publication?.title ?? "Carte publique"}
      description={publication ? `Publiée le ${formatDate(publication.publishedAt)}` : "Bibliothèque publique DroMap"}
      actions={
        <Link href="/library" className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50">
          ← Toutes les cartes
        </Link>
      }
    >
      <div className="mx-auto max-w-7xl">
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-5" aria-hidden="true">
            <div className="dromap-skeleton aspect-[16/9] rounded-xl" />
            <div className="mt-5 space-y-3">
              <div className="dromap-skeleton h-5 w-1/3 rounded-md" />
              <div className="dromap-skeleton h-3 w-2/3 rounded-md" />
            </div>
          </div>
        ) : error || !publication || !viewerAccess ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-950">
            <div className="font-black">Carte indisponible</div>
            <p className="mt-2 text-sm leading-6">{error ?? "Cette carte n’est plus publiée."}</p>
            <Link href="/library" className="mt-4 inline-block text-sm font-black text-teal-700 hover:underline">Retour à la bibliothèque</Link>
          </div>
        ) : (
          <div className="space-y-5">
            {actionMessage ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold leading-6 text-emerald-950">{actionMessage}</div>
            ) : null}
            {actionError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold leading-6 text-rose-950">{actionError}</div>
            ) : null}

            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="relative grid min-h-[28rem] place-items-center bg-slate-100 p-3 sm:p-6">
                <div className="relative inline-block w-fit max-w-full overflow-hidden shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    ref={previewImageRef}
                    src={publication.previewDataUrl ?? publication.thumbnailDataUrl}
                    alt={publication.title}
                    draggable={false}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    onLoad={() => autoPlacePreviewCredit()}
                    onContextMenu={(event) => event.preventDefault()}
                    className="block max-h-[72vh] max-w-full select-none object-contain"
                  />
                  {viewerAccess.canExport &&
                  viewerAccess.creatorCreditName &&
                  !(viewerAccess.allowCreatorCreditRemoval && hideCreatorCredit) ? (
                    <PublicCreatorCreditOverlay
                      name={viewerAccess.creatorCreditName}
                      position={creditPosition}
                      onPositionChange={(nextPosition) => {
                        setCreditPositionCustomized(true);
                        setCreditPosition(nextPosition);
                      }}
                    />
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-black text-emerald-700">Carte publique</span>
                  <span className="rounded-full bg-teal-50 px-2.5 py-1 font-black text-teal-700">{accessLabel}</span>
                  {publication.authorName ? <span>par {publication.authorName}</span> : null}
                  <span>· {formatDate(publication.publishedAt)}</span>
                </div>
                {publication.description ? (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-700">{publication.description}</p>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Aucune description fournie.</p>
                )}
                {publication.tags.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {publication.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{tag}</span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-black text-slate-900">Droits choisis par le créateur</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {publication.accessMode === "read-only"
                      ? "Cette publication peut être consultée, mais son export et sa modification ne sont pas autorisés."
                      : publication.accessMode === "export"
                        ? "Le créateur autorise l’export de la carte, mais pas la création d’une copie modifiable."
                        : "Le créateur autorise l’export et la création d’une copie personnelle modifiable dans DroMap."}
                  </p>
                  {publication.accessMode !== "read-only" ? (
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      Crédit du créateur : {publication.allowCreatorCreditRemoval
                        ? "la mention peut être déplacée ou retirée."
                        : "la mention doit rester visible, mais elle peut être déplacée."}
                    </p>
                  ) : null}
                  {viewerAccess.purchased && viewerAccess.effectiveAccessMode !== publication.accessMode ? (
                    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold leading-5 text-amber-900">
                      Ton achat conserve les droits acquis au moment du paiement : {getDromapPublicationAccessLabel(viewerAccess.effectiveAccessMode)}.
                    </div>
                  ) : null}
                </div>
              </div>

              <aside className="space-y-4">
                {viewerAccess.canExport ? (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950 shadow-sm">
                    <div className="text-sm font-black">Exporter la carte</div>

                    {viewerAccess.creatorCreditName && viewerAccess.allowCreatorCreditRemoval ? (
                      <label className="mt-4 flex items-start gap-2 rounded-xl border border-teal-200 bg-white/80 p-3 text-xs font-semibold leading-5 text-teal-900">
                        <input
                          type="checkbox"
                          checked={hideCreatorCredit}
                          onChange={(event) => setHideCreatorCredit(event.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-teal-600"
                        />
                        Ne pas afficher « {viewerAccess.creatorCreditName} » sur cet export
                      </label>
                    ) : null}

                    <DromapButton variant="primary" fullWidth className="mt-4" onClick={() => void download()} disabled={downloadBusy}>
                      {downloadBusy ? "Préparation…" : "Télécharger le JPEG"}
                    </DromapButton>

                    {viewerAccess.canEdit ? (
                      <DromapButton fullWidth className="mt-2" onClick={() => void createEditableCopy()} disabled={copyBusy}>
                        {copyBusy ? "Création de la copie…" : "Créer une copie modifiable"}
                      </DromapButton>
                    ) : null}
                  </div>
                ) : publication.accessMode === "read-only" ? (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-900"><LockIcon />Exporter la carte</div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      La visite de la carte reste gratuite pour tous. Le créateur n’a autorisé ni l’export ni la modification.
                    </p>
                  </div>
                ) : viewerAccess.canPurchase ? (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black"><LockIcon />Exporter la carte</div>
                    <div className="mt-2 text-sm font-black">Acheter cette carte — 3 €</div>
                    <p className="mt-2 text-xs leading-5 text-teal-800">
                      L’achat à l’unité débloque les droits actuellement autorisés par le créateur : {publication.accessMode === "edit-export" ? "modification et export" : "export"}.
                    </p>
                    <p className="mt-4 rounded-xl border border-teal-200 bg-white/80 p-3 text-xs font-semibold leading-5 text-teal-900">
                      Le paiement s’ouvre sur Stripe. Tu pourras y consulter et accepter les <Link href="/conditions-generales" target="_blank" className="font-black text-teal-700 hover:underline">conditions générales</Link> juste avant de payer.
                    </p>
                    <DromapButton variant="primary" fullWidth className="mt-4" onClick={() => void startPurchase()} disabled={purchaseBusy}>
                      {purchaseBusy ? "Ouverture du paiement…" : "Acheter l’accès — 3 €"}
                    </DromapButton>
                    <Link href="/pricing" className="mt-3 block text-center text-xs font-black text-teal-700 hover:underline">Ou choisir un abonnement</Link>
                  </div>
                ) : !viewerAccess.authenticated ? (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50 p-5 text-teal-950 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black"><LockIcon />Exporter la carte</div>
                    <div className="mt-2 text-sm font-black">Export autorisé par le créateur</div>
                    <p className="mt-2 text-xs leading-5 text-teal-800">
                      Pour utiliser ce droit, connecte-toi puis utilise un abonnement Plus/Pro ou achète cette carte à l’unité.
                    </p>
                    <DromapButton
                      variant="primary"
                      fullWidth
                      className="mt-4"
                      onClick={() => router.push(`/signup?returnTo=${encodeURIComponent(`/library/${slug}`)}`)}
                    >
                      Se connecter / créer un compte
                    </DromapButton>
                    <Link href="/pricing" className="mt-3 block text-center text-xs font-black text-teal-700 hover:underline">Voir les formules</Link>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-black text-slate-900"><LockIcon />Exporter la carte</div>
                    <div className="mt-2 text-sm font-black text-slate-900">Droits non débloqués</div>
                    <p className="mt-2 text-xs leading-5 text-slate-600">
                      Recharge la page ou vérifie l’état de ton compte si tu viens de terminer un paiement.
                    </p>
                  </div>
                )}
              </aside>
            </section>
          </div>
        )}
      </div>
    </DromapProductShell>
  );
}

export function DromapPublicMapClient({ slug }: { slug: string }) {
  return (
    <DromapProductBootstrap>
      <PublicMapContent slug={slug} />
    </DromapProductBootstrap>
  );
}
