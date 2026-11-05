import type { Metadata } from "next";
import { DromapResendConfirmationClient } from "@/components/dromap-product/resend-confirmation-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";

export const metadata: Metadata = {
  title: "Renvoyer la confirmation d’e-mail",
  description: "Demandez un nouveau lien pour confirmer l’adresse e-mail de votre compte DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function ResendConfirmationPage() {
  return <DromapResendConfirmationClient />;
}
