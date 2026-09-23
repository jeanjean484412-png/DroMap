import type { Metadata } from "next";
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
  return (
    <Suspense
      fallback={<DromapPageSkeleton />}
    >
      <DromapPricingClient />
    </Suspense>
  );
}
