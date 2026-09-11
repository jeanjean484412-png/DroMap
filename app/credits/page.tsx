import type { Metadata } from "next";
import { DromapCreditsClient } from "@/components/dromap-product/credits-client";
export const metadata: Metadata = {
  title: "Crédits et licences",
  description: "Consultez les sources cartographiques, données, services, bibliothèques et licences utilisés par DroMap.",
};

export default function CreditsPage() {
  return <DromapCreditsClient />;
}
