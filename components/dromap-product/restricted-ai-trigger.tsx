"use client";

import { useDromapProductRuntime } from "./product-runtime";
import { DROMAP_BETA } from "@/lib/dromap/release-mode";
import { MapDockButton } from "@/editor/map-dock-button";

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
      <MapDockButton
        icon={<span className="text-lg font-black leading-none">IA</span>}
        disabled={DROMAP_BETA}
        onClick={() => {
          window.dispatchEvent(new Event("dromap:open-ai-assistant"));
          requestRestriction({
            title: "Assistant IA réservé aux utilisateurs connectés",
            description:
              "Crée un compte pour utiliser l’assistant IA. Le projet actuel sera conservé.",
          });
        }}
        className="border-teal-200 text-teal-800 hover:border-teal-400"
        title={DROMAP_BETA ? "Assistant IA — à venir" : "Assistant IA — compte requis"}
        aria-label={DROMAP_BETA ? "Assistant IA à venir" : "Assistant IA, compte requis"}
      >
        {DROMAP_BETA ? "Assistant IA · À venir" : "Assistant IA"}
      </MapDockButton>
    </div>
  );
}
