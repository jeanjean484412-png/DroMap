export const DROMAP_LEGAL_LAST_UPDATED = "1er septembre 2026";
export const DROMAP_TERMS_VERSION = "2026-09-01";
export const DROMAP_PRIVACY_VERSION = "2026-09-10";
export const DROMAP_PRIVACY_LAST_UPDATED = "10 septembre 2026";

export const DROMAP_LEGAL_LINKS = {
  privacy: "/confidentialite",
  terms: "/conditions-generales",
  contactEmail: "contact@dromap.fr",
} as const;

export function isCurrentDromapTermsVersion(value: unknown): value is typeof DROMAP_TERMS_VERSION {
  return value === DROMAP_TERMS_VERSION;
}
