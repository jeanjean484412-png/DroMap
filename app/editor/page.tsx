"use client";

import { useEffect, useState } from "react";
import { BetaEditorLoadingOverlay } from "@/components/dromap-product/beta-editor-loading-overlay";
import { EditorSurface } from "@/editor/editor-surface";
import { SHOW_BETA_EDITOR_INTRO } from "@/lib/dromap/release-mode";

export default function StandaloneEditorPage() {
  const [mapReady, setMapReady] = useState(false);
  const [introElapsed, setIntroElapsed] = useState(false);

  useEffect(() => {
    if (!SHOW_BETA_EDITOR_INTRO) return;
    const timer = window.setTimeout(() => setIntroElapsed(true), 2800);
    return () => window.clearTimeout(timer);
  }, []);

  const showIntro = SHOW_BETA_EDITOR_INTRO && (!introElapsed || !mapReady);

  return (
    <>
      <main className="h-screen w-full overflow-hidden" aria-busy={showIntro}>
        <EditorSurface onMapPresentationReady={() => setMapReady(true)} />
      </main>
      {showIntro ? <BetaEditorLoadingOverlay /> : null}
    </>
  );
}
