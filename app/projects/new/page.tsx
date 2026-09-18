"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DromapProductBootstrap } from "@/components/dromap-product/product-bootstrap";
import { useDromapProductStore } from "@/stores/dromap-product";

function NewProjectRedirect() {
  const router = useRouter();
  const createProject = useDromapProductStore((state) => state.createProject);
  const hasCreatedRef = useRef(false);
  const [existingGuestId, setExistingGuestId] = useState<string | null>(null);

  useEffect(() => {
    if (hasCreatedRef.current) return;
    hasCreatedRef.current = true;
    async function openSetup() {
      const state = useDromapProductStore.getState();
      const existingGuest = state.userMode === "guest"
        ? state.projects.find((project) => project.status !== "trashed")
        : null;
      if (existingGuest) {
        if (!existingGuest.setupComplete) {
          router.replace(`/projects/${existingGuest.id}/setup`);
        } else {
          setExistingGuestId(existingGuest.id);
        }
        return;
      }
      // Le parcours de création explicite ouvre toujours les quatre étapes.
      const id = createProject({ setupComplete: false });
      if (!id) { router.replace("/dashboard"); return; }
      await useDromapProductStore.getState().flushPersistence();
      router.replace(`/projects/${id}/setup`);
    }
    void openSetup();
  }, [createProject, router]);

  if (existingGuestId) return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6">
      <div className="max-w-lg rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-bold">Votre carte invitée est déjà commencée</h1>
        <p className="mt-3 text-slate-600">Le mode invité permet de travailler sur une carte. Retrouvez-la, ou créez un compte pour la conserver et commencer un nouveau projet.</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Link href={`/projects/${existingGuestId}/editor`} className="rounded-lg bg-teal-700 px-4 py-3 text-white">Reprendre ma carte</Link>
          <Link href="/signup" className="rounded-lg border px-4 py-3">Créer un compte</Link>
        </div>
      </div>
    </main>
  );
  return <div className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-600">Ouverture des étapes de création…</div>;
}

export default function NewProjectPage() {
  return (
    <DromapProductBootstrap>
      <NewProjectRedirect />
    </DromapProductBootstrap>
  );
}
