"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { DromapProductBootstrap } from "@/components/dromap-product/product-bootstrap";
import { useDromapProductStore } from "@/stores/dromap-product";

function NewProjectRedirect() {
  const router = useRouter();
  const createProject = useDromapProductStore((state) => state.createProject);
  const hasCreatedRef = useRef(false);

  useEffect(() => {
    if (hasCreatedRef.current) return;
    hasCreatedRef.current = true;
    const id = createProject();
    if (!id) {
      router.replace("/dashboard");
      return;
    }
    const createdProject = useDromapProductStore.getState().projects.find((project) => project.id === id);
    router.replace(createdProject?.setupComplete ? `/projects/${id}/editor` : `/projects/${id}/setup`);
  }, [createProject, router]);

  return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">Création du projet…</div>;
}

export default function NewProjectPage() {
  return (
    <DromapProductBootstrap>
      <NewProjectRedirect />
    </DromapProductBootstrap>
  );
}
