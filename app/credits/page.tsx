import type { Metadata } from "next";
import { DromapCreditsClient } from "@/components/dromap-product/credits-client";
import { createDromapPublicMetadata } from "@/lib/dromap/seo";

export const metadata: Metadata = createDromapPublicMetadata({
  title: "Crédits et licences",
  description: "Consultez les sources cartographiques, données, services, bibliothèques et licences utilisés par DroMap.",
  path: "/credits",
});

export default function CreditsPage() {
  return <DromapCreditsClient />;
}
