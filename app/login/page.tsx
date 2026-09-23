import type { Metadata } from "next";
import { Suspense } from "react";
import { DromapPageSkeleton } from "@/components/dromap-ui/page-skeleton";
import { DromapLoginClient } from "@/components/dromap-product/login-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à DroMap pour retrouver les projets enregistrés avec votre compte.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function LoginPage() {
  return (
    <Suspense fallback={<DromapPageSkeleton compact />}>
      <DromapLoginClient />
    </Suspense>
  );
}
