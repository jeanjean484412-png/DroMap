import type { Metadata } from "next";
import { Suspense } from "react";
import { DromapPageSkeleton } from "@/components/dromap-ui/page-skeleton";
import { DromapSignupClient } from "@/components/dromap-product/signup-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Créer un compte",
  description: "Créez un compte DroMap pour enregistrer vos projets en ligne et les retrouver sur plusieurs appareils.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function SignupPage() {
  return (
    <Suspense fallback={<DromapPageSkeleton compact />}>
      <DromapSignupClient />
    </Suspense>
  );
}
