"use client";

import { useDromapProductRuntime } from "./product-runtime";

export function RestrictedAiTrigger() {
  const { requestRestriction } = useDromapProductRuntime();

  return (
    <div className="pointer-events-none fixed left-4 top-[4.5rem] z-[1300] md:left-[32rem] lg:left-[44rem]">
      <button
        type="button"
        onClick={() =>
          requestRestriction({
            title: "Assistant IA réservé aux utilisateurs connectés",
            description:
              "Crée un compte pour utiliser l’assistant IA. Le projet actuel sera conservé.",
          })
        }
        className="pointer-events-auto flex items-center gap-2 rounded-xl border border-violet-200 bg-white/95 px-3 py-2 text-sm font-bold text-violet-800 shadow-xl backdrop-blur transition hover:-translate-y-0.5 hover:border-violet-400 hover:bg-white hover:shadow-2xl"
        title="Assistant IA — compte requis"
      >
        <span aria-hidden="true">✦</span>
        Assistant IA
        <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px]">🔒</span>
      </button>
    </div>
  );
}
