"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { useDromapProductStore } from "@/stores/dromap-product";
import { DromapContactDialog } from "./contact-dialog";

export function DromapLegalContactLink({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const bootstrap = useDromapProductStore((state) => state.bootstrap);
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    // Le même formulaire Contact que dans la navigation DroMap est utilisé ici.
    // On hydrate le compte en parallèle pour préremplir l'identité et proposer
    // les projets lorsque l'utilisateur est déjà connecté, sans bloquer l'ouverture.
    void bootstrap();
  };

  return (
    <>
      <button type="button" onClick={handleOpen} className={className}>
        {children}
      </button>
      <DromapContactDialog open={open} pathname={pathname} onClose={() => setOpen(false)} />
    </>
  );
}
