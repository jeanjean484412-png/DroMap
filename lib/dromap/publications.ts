export type DromapPublicationAccessMode = "read-only" | "export" | "edit-export";

export type DromapCreatorCreditPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type DromapPublicPublication = {
  slug: string;
  title: string;
  description: string;
  authorName: string | null;
  tags: string[];
  thumbnailDataUrl: string;
  previewDataUrl?: string;
  imageDataUrl?: string;
  imageMimeType?: "image/jpeg";
  accessMode: DromapPublicationAccessMode;
  allowCreatorCreditRemoval: boolean;
  creatorCreditName: string | null;
  publishedAt: string;
  updatedAt: string;
};

export type DromapOwnedPublication = DromapPublicPublication & {
  projectId: string;
};

export type DromapPublicationViewerAccess = {
  authenticated: boolean;
  subscriber: boolean;
  purchased: boolean;
  canExport: boolean;
  canEdit: boolean;
  canPurchase: boolean;
  effectiveAccessMode: DromapPublicationAccessMode;
  allowCreatorCreditRemoval: boolean;
  creatorCreditName: string | null;
};

export function isDromapSubscriberPlan(value: unknown) {
  return value === "plus" || value === "pro" || value === "tester";
}

export function normalizeDromapPublicationAccessMode(
  value: unknown,
): DromapPublicationAccessMode {
  return value === "export" || value === "edit-export" ? value : "read-only";
}

export function getDromapPublicationAccessLabel(mode: DromapPublicationAccessMode) {
  if (mode === "export") return "Lecture + export";
  if (mode === "edit-export") return "Lecture + modification + export";
  return "Lecture seule";
}

export function dromapPublicationModeAllowsExport(mode: DromapPublicationAccessMode) {
  return mode === "export" || mode === "edit-export";
}

export function dromapPublicationModeAllowsEdit(mode: DromapPublicationAccessMode) {
  return mode === "edit-export";
}

export function normalizeDromapCreatorCreditPosition(
  value: unknown,
): DromapCreatorCreditPosition {
  return value === "top-left" ||
    value === "top-right" ||
    value === "bottom-left" ||
    value === "bottom-right"
    ? value
    : "bottom-left";
}

export function normalizeDromapPublicationTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, 36))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 8);
}
