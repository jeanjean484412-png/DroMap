import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { DromapWebAnalytics } from "@/components/dromap-product/web-analytics";
import { getDromapSiteUrl } from "@/lib/dromap/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const DROMAP_SITE_URL = getDromapSiteUrl();
const DROMAP_DEFAULT_TITLE = "DroMap — Éditeur cartographique en ligne";
const DROMAP_DEFAULT_DESCRIPTION =
  "Créez des cartes claires, modifiables et exportables avec DroMap : calques, imports, légende, rendu fidèle et Assistant IA contrôlable.";

export const metadata: Metadata = {
  metadataBase: new URL(DROMAP_SITE_URL),
  title: {
    default: DROMAP_DEFAULT_TITLE,
    template: "%s — DroMap",
  },
  description: DROMAP_DEFAULT_DESCRIPTION,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      {
        url: "/favicon.ico?v=20260910",
        type: "image/x-icon",
        sizes: "16x16 32x32 48x48 256x256",
      },
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/apple-icon.png", type: "image/png", sizes: "180x180" }],
  },
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "DroMap",
    title: DROMAP_DEFAULT_TITLE,
    description: DROMAP_DEFAULT_DESCRIPTION,
    images: [
      {
        url: "/dromap-share.png",
        width: 1200,
        height: 630,
        alt: "DroMap — Éditeur cartographique en ligne",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DROMAP_DEFAULT_TITLE,
    description: DROMAP_DEFAULT_DESCRIPTION,
    images: ["/dromap-share.png"],
  },
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
