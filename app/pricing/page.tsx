import type { Metadata } from "next";
import Link from "next/link";
import { DROMAP_BETA } from "@/lib/dromap/release-mode";
import { DromapProductShell } from "@/components/dromap-product/product-shell";
import { DromapProductBootstrap } from "@/components/dromap-product/product-bootstrap";
import { Suspense } from "react";
import { DromapPageSkeleton } from "@/components/dromap-ui/page-skeleton";
import { DromapPricingClient } from "@/components/dromap-product/pricing-client";
import { createDromapPublicMetadata } from "@/lib/dromap/seo";

export const metadata: Metadata = createDromapPublicMetadata({
  title: "Formules",
  description: "Comparez l’accès gratuit, les abonnements Plus et Pro et l’achat ponctuel Export Max de DroMap.",
  path: "/pricing",
});

export default function PricingPage() {
  if (DROMAP_BETA) return <DromapProductBootstrap><DromapProductShell title="Formules">
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-100 p-8 text-slate-600">
      <h2 className="text-2xl font-bold">Abonnements payants à venir</h2>
      <p className="mt-4">DroMap est actuellement en version de test. Une offre gratuite avec utilisation limitée et des abonnements payants seront disponibles prochainement.</p>
      <Link href="/dashboard" className="mt-4 inline-block underline">Revenir à mes cartes</Link>
    </section>
  </DromapProductShell></DromapProductBootstrap>;
  return (
    <Suspense
      fallback={<DromapPageSkeleton />}
    >
      <DromapPricingClient />
    </Suspense>
  );
}
