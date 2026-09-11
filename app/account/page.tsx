import type { Metadata } from "next";
import { DromapAccountClient } from "@/components/dromap-product/account-client";
export const metadata: Metadata = {
  title: "Compte",
  description: "Gérez le profil, la formule, les données et la sécurité du compte DroMap.",
};

export default function AccountPage() {
  return <DromapAccountClient />;
}
