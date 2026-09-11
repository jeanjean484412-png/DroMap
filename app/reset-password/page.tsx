import type { Metadata } from "next";
import { DromapResetPasswordClient } from "@/components/dromap-product/reset-password-client";
export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour sécuriser votre compte DroMap.",
};
export default function ResetPasswordPage() { return <DromapResetPasswordClient />; }
