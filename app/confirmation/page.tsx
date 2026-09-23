import type { Metadata } from "next";
import { Suspense } from "react";

import { DromapCheckoutConfirmationClient } from "@/components/dromap-product/checkout-confirmation-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";

export const metadata: Metadata = {
  title: "Confirmation du paiement",
  description: "Vérification et confirmation d’un paiement DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

function ConfirmationFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f9f8] px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white px-7 py-10 text-center shadow-sm">
        <div className="mx-auto h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#2b8e88]" aria-hidden="true" />
        <p className="mt-4 text-sm font-semibold text-slate-700">Préparation de la confirmation…</p>
      </div>
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense fallback={<ConfirmationFallback />}>
      <DromapCheckoutConfirmationClient />
    </Suspense>
  );
}
