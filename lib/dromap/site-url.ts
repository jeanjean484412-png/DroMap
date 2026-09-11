const DEFAULT_DROMAP_SITE_URL = "https://dromap.fr";

function normalizeSiteUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    return url.origin;
  } catch {
    return null;
  }
}

export function getDromapSiteUrl() {
  return (
    normalizeSiteUrl(process.env.NEXT_PUBLIC_DROMAP_SITE_URL) ??
    normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    DEFAULT_DROMAP_SITE_URL
  );
}
