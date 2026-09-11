import type { Metadata } from "next";
import { DromapForgotPasswordClient } from "@/components/dromap-product/forgot-password-client";
export const metadata: Metadata = {
  title: "Mot de passe oublié",
  description: "Demandez un lien de réinitialisation pour récupérer l’accès à votre compte DroMap.",
};
export default function ForgotPasswordPage() { return <DromapForgotPasswordClient />; }
