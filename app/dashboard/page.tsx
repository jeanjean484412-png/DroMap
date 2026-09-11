import type { Metadata } from "next";
import { DromapDashboardClient } from "@/components/dromap-product/dashboard-client";
export const metadata: Metadata = {
  title: "Mes projets",
  description: "Créez, ouvrez, organisez et gérez les projets cartographiques enregistrés dans DroMap.",
};

export default function DashboardPage() {
  return <DromapDashboardClient />;
}
