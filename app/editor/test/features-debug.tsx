"use client";

import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";

export default function FeaturesDebug() {
  const features = useEditorTestFeaturesStore((s) => s.features);
  const clearFeatures = useEditorTestFeaturesStore((s) => s.clearFeatures);

  return (
    <aside className="pointer-events-auto absolute right-3 top-3 z-[1000] max-h-[40vh] w-72 overflow-hidden rounded-md border border-neutral-200 bg-white/95 p-3 text-xs shadow-md backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-2">
        <strong className="text-neutral-800">Features ({features.length})</strong>
        <button
          type="button"
          onClick={clearFeatures}
          className="rounded border border-neutral-300 px-2 py-0.5 text-[10px] text-neutral-600 hover:bg-neutral-50"
        >
          Vider
        </button>
      </div>
      <pre className="max-h-[32vh] overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-neutral-700">
        {features.length === 0
          ? "Aucune feature"
          : JSON.stringify(features, null, 2)}
      </pre>
    </aside>
  );
}
