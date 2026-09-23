import type { Metadata } from "next";
import { DromapResetPasswordClient } from "@/components/dromap-product/reset-password-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Nouveau mot de passe",
  description: "Choisissez un nouveau mot de passe pour sécuriser votre compte DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};
export default function ResetPasswordPage() { return <DromapResetPasswordClient />; }
