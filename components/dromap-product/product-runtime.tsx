"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
import { useEditorWorkspaceStore } from "@/stores/editor-workspace";
import { getDromapBillingStatus } from "@/lib/dromap/billing";
import { DromapDialog } from "@/components/dromap-ui/dialog";
import { DromapButton } from "@/components/dromap-ui/button";

type RestrictedFeatureRequest = {
  title: string;
  description: string;
  pricingPath?: string;
};

type DromapProductRuntimeValue = {
  enabled: boolean;
  projectId: string | null;
  capabilities: DromapCapabilities;
  singleMapMaxExportPurchased: boolean;
  singleMapPurchaseRequiresZoneLock: boolean;
  singleMapZoneLocked: boolean;
  markSingleMapZoneLockedLocally: () => void;
  requestRestriction: (request: RestrictedFeatureRequest) => void;
};

const UNRESTRICTED_CAPABILITIES: DromapCapabilities = {
  canUseAi: true,
  canImportBuildings: true,
  canUseGeoJsonLibrary: true,
  canUseAdvancedLegend: true,
  canExportHighQuality: true,
  canExportOtherVisualFormats: true,
  canCustomizeBasemapRender: true,
  canExportProjectData: true,
  canSaveLayersToLibrary: true,
  canCreateCustomMarkers: true,
  canSaveCustomMarkersToLibrary: true,
  canSaveOnline: true,
  canPublishPublicMaps: true,
  canDownloadPublicMaps: true,
};

const DromapProductRuntimeContext = createContext<DromapProductRuntimeValue>({
  enabled: false,
  projectId: null,
  capabilities: UNRESTRICTED_CAPABILITIES,
  singleMapMaxExportPurchased: false,
  singleMapPurchaseRequiresZoneLock: false,
  singleMapZoneLocked: false,
  markSingleMapZoneLockedLocally: () => undefined,
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
  const accountPlan = useDromapProductStore((state) => state.accountPlan);
  const singleMapMaxExportProjectIds = useDromapProductStore(
    (state) => state.singleMapMaxExportProjectIds,
  );
  const publicMapExportProjectIds = useDromapProductStore(
    (state) => state.publicMapExportProjectIds,
  );
  const [restriction, setRestriction] = useState<RestrictedFeatureRequest | null>(null);
  const [singleMapZoneLocked, setSingleMapZoneLocked] = useState(false);
  const singleMapMaxExportPurchased = singleMapMaxExportProjectIds.includes(projectId);
  const publicMapExportPurchased = publicMapExportProjectIds.includes(projectId);
  const premiumPlan =
    accountPlan === "plus" || accountPlan === "pro" || accountPlan === "tester";
  const singleMapPurchaseRequiresZoneLock =
    userMode === "authenticated" && singleMapMaxExportPurchased && !premiumPlan;

  const requestRestriction = useCallback(
    (request: RestrictedFeatureRequest) => setRestriction(request),
    [],
  );

  const markSingleMapZoneLockedLocally = useCallback(() => {
    setSingleMapZoneLocked(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!singleMapPurchaseRequiresZoneLock) {
      setSingleMapZoneLocked(false);
      return;
    }

    void getDromapBillingStatus().then((result) => {
      if (cancelled || !result.ok || !result.data) return;
      setSingleMapZoneLocked(
        (result.data.singleMapZoneLockedProjectIds ?? []).includes(projectId),
      );
    });

    return () => {
      cancelled = true;
    };
  }, [pathname, projectId, singleMapPurchaseRequiresZoneLock]);

  useEffect(() => {
    useEditorWorkspaceStore
      .getState()
      .setWorkspaceZoneEditLocked(singleMapZoneLocked);
    return () => {
      useEditorWorkspaceStore.getState().setWorkspaceZoneEditLocked(false);
    };
  }, [singleMapZoneLocked]);

  const value = useMemo<DromapProductRuntimeValue>(
    () => ({
      enabled: true,
      projectId,
      capabilities: getDromapCapabilities(userMode, accountPlan, {
        singleMapMaxExport: singleMapMaxExportPurchased,
        publicMapExport: publicMapExportPurchased,
      }),
      singleMapMaxExportPurchased,
      singleMapPurchaseRequiresZoneLock,
      singleMapZoneLocked,
      markSingleMapZoneLockedLocally,
      requestRestriction,
    }),
    [
      accountPlan,
      projectId,
      markSingleMapZoneLockedLocally,
      requestRestriction,
      singleMapMaxExportPurchased,
      singleMapPurchaseRequiresZoneLock,
      singleMapZoneLocked,
      publicMapExportPurchased,
      userMode,
    ],
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
              {userMode === "guest" ? "Continuer sans compte" : "Plus tard"}
            </DromapButton>
            <DromapButton
              variant="primary"
              onClick={() => {
                setRestriction(null);
                if (userMode === "authenticated") {
                  router.push(restriction?.pricingPath ?? "/pricing");
                  return;
                }
                const returnTo = pathname || `/projects/${projectId}/editor`;
                router.push(`/signup?returnTo=${encodeURIComponent(returnTo)}`);
              }}
            >
              {userMode === "guest" ? "Créer un compte" : "Voir les formules"}
            </DromapButton>
          </>
        }
      >
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-950">
          {userMode === "guest"
            ? "Ton projet actuel reste conservé sur cet appareil. Après la création du compte, il sera transféré automatiquement."
            : "Ton projet n’est pas modifié. Tu peux consulter les formules disponibles puis revenir dans l’éditeur."}
        </div>
      </DromapDialog>
    </DromapProductRuntimeContext.Provider>
  );
}

export function useDromapProductRuntime() {
  return useContext(DromapProductRuntimeContext);
}
