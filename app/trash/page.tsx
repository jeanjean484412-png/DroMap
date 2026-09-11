import type { Metadata } from "next";
import { DromapTrashClient } from "@/components/dromap-product/trash-client";
export const metadata: Metadata = {
  title: "Corbeille",
  description: "Restaurez ou supprimez définitivement les projets DroMap placés dans la corbeille.",
};

export default function TrashPage() {
  return <DromapTrashClient />;
}
