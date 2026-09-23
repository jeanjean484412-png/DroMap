import type { Metadata } from "next";
import { DromapDashboardClient } from "@/components/dromap-product/dashboard-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Mes projets",
  description: "Créez, ouvrez, organisez et gérez les projets cartographiques enregistrés dans DroMap.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function DashboardPage() {
  return <DromapDashboardClient />;
}
