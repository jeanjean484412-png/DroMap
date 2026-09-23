import type { Metadata } from "next";

export const DROMAP_CANONICAL_ORIGIN = "https://dromap.fr";
export const DROMAP_HOME_TITLE =
  "DroMap — Créer et personnaliser des cartes en ligne";
export const DROMAP_HOME_DESCRIPTION =
  "Créez, personnalisez et exportez vos cartes avec DroMap : marqueurs, zones, traits, légendes, données cartographiques et exports haute définition.";
export const DROMAP_SOCIAL_IMAGE = "/dromap-share.png?v=20260915-3";
export const DROMAP_SOCIAL_IMAGE_ALT =
  "DroMap — Créer et personnaliser des cartes en ligne";

export const DROMAP_PRIVATE_ROBOTS: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: false,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

export function getDromapCanonicalUrl(path = "/") {
  if (path === "/" || !path) return DROMAP_CANONICAL_ORIGIN;
  return `${DROMAP_CANONICAL_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

type PublicPageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
};

export function createDromapPublicMetadata({
  title,
  description,
  path,
  absoluteTitle = false,
}: PublicPageMetadataOptions): Metadata {
  const canonical = getDromapCanonicalUrl(path);
  const socialTitle = absoluteTitle ? title : `${title} — DroMap`;

  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "fr_FR",
      siteName: "DroMap",
      url: canonical,
      title: socialTitle,
      description,
      images: [
        {
          url: DROMAP_SOCIAL_IMAGE,
          width: 1200,
          height: 630,
          alt: DROMAP_SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: [DROMAP_SOCIAL_IMAGE],
    },
  };
}

export function getDromapSiteVerification(): Metadata["verification"] {
  const google = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  const bing = process.env.BING_SITE_VERIFICATION?.trim();

  if (!google && !bing) return undefined;

  return {
    ...(google ? { google } : {}),
    ...(bing ? { other: { "msvalidate.01": bing } } : {}),
  };
}
