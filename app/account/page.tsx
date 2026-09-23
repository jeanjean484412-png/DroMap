import type { Metadata } from "next";
import { DromapAccountClient } from "@/components/dromap-product/account-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Compte",
  description: "Gérez le profil, la formule, les données et la sécurité du compte DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function AccountPage() {
  return <DromapAccountClient />;
}
