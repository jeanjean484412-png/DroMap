import type { Metadata } from "next";
import { DromapTrashClient } from "@/components/dromap-product/trash-client";
import { DROMAP_PRIVATE_ROBOTS } from "@/lib/dromap/seo";
export const metadata: Metadata = {
  title: "Corbeille",
  description: "Restaurez ou supprimez définitivement les projets DroMap placés dans la corbeille.",
  robots: DROMAP_PRIVATE_ROBOTS,
};

export default function TrashPage() {
  return <DromapTrashClient />;
}
