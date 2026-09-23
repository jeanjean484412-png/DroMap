import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { DromapWebAnalytics } from "@/components/dromap-product/web-analytics";
import {
  DROMAP_CANONICAL_ORIGIN,
  DROMAP_HOME_DESCRIPTION,
  DROMAP_HOME_TITLE,
  DROMAP_SOCIAL_IMAGE,
  DROMAP_SOCIAL_IMAGE_ALT,
  getDromapSiteVerification,
} from "@/lib/dromap/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(DROMAP_CANONICAL_ORIGIN),
  title: {
    default: DROMAP_HOME_TITLE,
    template: "%s — DroMap",
  },
  description: DROMAP_HOME_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/dromap-logo.svg?v=20260915-3", type: "image/svg+xml" },
      {
        url: "/favicon.ico?v=20260915-3",
        type: "image/x-icon",
        sizes: "16x16 32x32 48x48 256x256",
      },
      { url: "/icon.png?v=20260915-3", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png?v=20260915-3", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "DroMap",
    url: DROMAP_CANONICAL_ORIGIN,
    title: DROMAP_HOME_TITLE,
    description: DROMAP_HOME_DESCRIPTION,
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
    title: DROMAP_HOME_TITLE,
    description: DROMAP_HOME_DESCRIPTION,
    images: [DROMAP_SOCIAL_IMAGE],
  },
  robots: {
    index: true,
    follow: true,
  },
  verification: getDromapSiteVerification(),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <DromapWebAnalytics />
      </body>
    </html>
  );
}
