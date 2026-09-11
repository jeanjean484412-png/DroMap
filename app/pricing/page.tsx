import type { Metadata } from "next";
import { Suspense } from "react";
import { DromapPageSkeleton } from "@/components/dromap-ui/page-skeleton";
import { DromapPricingClient } from "@/components/dromap-product/pricing-client";
export const metadata: Metadata = {
  title: "Formules",
  description: "Comparez l’accès gratuit, les abonnements Plus et Pro et l’achat ponctuel Export Max de DroMap.",
};

export default function PricingPage() {
  return (
    <Suspense
      fallback={<DromapPageSkeleton />}
    >
      <DromapPricingClient />
    </Suspense>
  );
}
