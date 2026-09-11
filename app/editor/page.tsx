"use client";

import { EditorSurface } from "@/editor/editor-surface";

export default function StandaloneEditorPage() {
  return (
    <main className="h-screen w-full overflow-hidden">
      <EditorSurface />
    </main>
  );
}
