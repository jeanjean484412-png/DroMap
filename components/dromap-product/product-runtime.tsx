"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  getDromapCapabilities,
  type DromapCapabilities,
} from "@/lib/dromap/product";
import { useDromapProductStore } from "@/stores/dromap-product";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { DromapButton } from "@/components/dromap-ui/button";

type RestrictedFeatureRequest = {
  title: string;
  description: string;
};

type DromapProductRuntimeValue = {
  enabled: boolean;
  projectId: string | null;
  capabilities: DromapCapabilities;
  requestRestriction: (request: RestrictedFeatureRequest) => void;
};

const UNRESTRICTED_CAPABILITIES: DromapCapabilities = {
  canUseAi: true,
  canImportBuildings: true,
  canUseAdvancedLegend: true,
  canExportHighQuality: true,
  canExportOtherVisualFormats: true,
  canExportProjectData: true,
  canSaveLayersToLibrary: true,
  canSaveCustomMarkersToLibrary: true,
  canSaveOnline: true,
};

const DromapProductRuntimeContext = createContext<DromapProductRuntimeValue>({
  enabled: false,
  projectId: null,
  capabilities: UNRESTRICTED_CAPABILITIES,
  requestRestriction: () => undefined,
});

export function DromapProductRuntimeProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const userMode = useDromapProductStore((state) => state.userMode);
  const [restriction, setRestriction] = useState<RestrictedFeatureRequest | null>(null);

  const requestRestriction = useCallback(
    (request: RestrictedFeatureRequest) => setRestriction(request),
    [],
  );

  const value = useMemo<DromapProductRuntimeValue>(
    () => ({
      enabled: true,
      projectId,
      capabilities: getDromapCapabilities(userMode),
      requestRestriction,
    }),
    [projectId, requestRestriction, userMode],
  );

  return (
    <DromapProductRuntimeContext.Provider value={value}>
      {children}
      <DromapDialog
        open={restriction !== null}
        title={restriction?.title ?? "Fonction réservée"}
        description={restriction?.description}
        onClose={() => setRestriction(null)}
        footer={
          <>
            <DromapButton onClick={() => setRestriction(null)}>
              Continuer sans compte
            </DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                setRestriction(null);
                const returnTo = pathname || `/projects/${projectId}/editor`;
                router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
              }}
            >
              Créer un compte
            </DromapButton>
          </>
        }
      >
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm leading-6 text-indigo-950">
          Ton projet actuel reste conservé sur cet appareil. Après la création du compte,
          il sera transféré automatiquement et la fonction deviendra disponible.
        </div>
      </DromapDialog>
    </DromapProductRuntimeContext.Provider>
  );
}

export function useDromapProductRuntime() {
  return useContext(DromapProductRuntimeContext);
}
