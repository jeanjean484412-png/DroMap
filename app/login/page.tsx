import type { Metadata } from "next";
import { Suspense } from "react";
import { DromapPageSkeleton } from "@/components/dromap-ui/page-skeleton";
import { DromapLoginClient } from "@/components/dromap-product/login-client";
export const metadata: Metadata = {
  title: "Connexion",
  description: "Connectez-vous à DroMap pour retrouver les projets enregistrés avec votre compte.",
};

export default function LoginPage() {
  return (
    <Suspense fallback={<DromapPageSkeleton compact />}>
      <DromapLoginClient />
    </Suspense>
  );
}
