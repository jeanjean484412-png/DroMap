import type { Metadata } from "next";
import { DromapForgotPasswordClient } from "@/components/dromap-product/forgot-password-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Demandez un lien de réinitialisation pour récupérer l’accès à votre compte DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};
export default function ForgotPasswordPage() { return <DromapForgotPasswordClient />; }
