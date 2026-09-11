"use client";

import { useDromapProductRuntime } from "./product-runtime";
import { DromapAiAssistantIcon } from "./ai-assistant-icon";

type RestrictedAiTriggerProps = {
  docked?: boolean;
};

export function RestrictedAiTrigger({
  docked = false,
}: RestrictedAiTriggerProps = {}) {
  const { requestRestriction } = useDromapProductRuntime();

  return (
    <div
      className={
        docked
          ? "pointer-events-none relative z-[1300]"
          : "pointer-events-none fixed left-4 top-[4.5rem] z-[1300] md:left-[32rem] lg:left-[44rem]"
      }
    >
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(new Event("dromap:open-ai-assistant"));
          requestRestriction({
            title: "Assistant IA réservé aux utilisateurs connectés",
            description:
              "Crée un compte pour utiliser l’assistant IA. Le projet actuel sera conservé.",
          });
        }}
        className="pointer-events-auto flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-3 py-2 text-sm font-bold text-teal-800 shadow-lg transition hover:border-teal-400 hover:bg-white"
        title="Assistant IA — compte requis"
      >
        <DromapAiAssistantIcon className="h-4 w-4" />
        Assistant IA
        <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px]">🔒</span>
      </button>
    </div>
  );
}
