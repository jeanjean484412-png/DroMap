"use client";

import { useEffect, useMemo, useState } from "react";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";
import { DromapButton } from "@/components/dromap-ui/button";
import {
  resolveDromapPreferences,
  type DromapDashboardViewPreference,
  type DromapProjectSortPreference,
  type DromapQuickStartBasemapPreference,
  type DromapScaleUnitsPreference,
} from "@/lib/dromap/preferences";
import { useDromapProductStore } from "@/stores/dromap-product";
import { OPEN_PRIVACY_SETTINGS_EVENT } from "@/lib/dromap/privacy-settings";

const TOUR_STORAGE_KEY = "dromap-p1-editor-tour-completed-v1";
const TOUR_AUTO_PRESENTED_KEY = "dromap-p1-editor-tour-auto-presented-v1";

type ToggleProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
};

function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-teal-600" : "bg-slate-300"}`}
    >
      <span
        className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${checked ? "left-6" : "left-1"}`}
      />
    </button>
  );
}

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-black tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
    </div>
  );
}

function ChoiceCard({
  selected,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-teal-500 bg-teal-50 ring-4 ring-teal-100"
          : "border-slate-200 bg-white hover:border-teal-300 hover:bg-slate-50"
      }`}
    >
      <div className="font-black text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{description}</div>
    </button>
  );
}

function SettingsContent() {
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountFirstName = useDromapProductStore((state) => state.accountFirstName);
  const accountLastName = useDromapProductStore((state) => state.accountLastName);
  const accountName = useDromapProductStore((state) => state.accountName);
  const accountPreferences = useDromapProductStore((state) => state.accountPreferences);
  const setAccountProfile = useDromapProductStore((state) => state.setAccountProfile);

  const resolved = useMemo(
    () => resolveDromapPreferences(accountPreferences),
    [accountPreferences],
  );

  const [projectSortDraft, setProjectSortDraft] =
    useState<DromapProjectSortPreference>("updated-desc");
  const [dashboardViewDraft, setDashboardViewDraft] =
    useState<DromapDashboardViewPreference>("grid");
  const [guidedProjectSetupDraft, setGuidedProjectSetupDraft] = useState(true);
  const [quickStartBasemapDraft, setQuickStartBasemapDraft] =
    useState<DromapQuickStartBasemapPreference>("openfreemap-liberty");
  const [quickStartCreateLayer1Draft, setQuickStartCreateLayer1Draft] = useState(true);
  const [scaleUnitsDraft, setScaleUnitsDraft] =
    useState<DromapScaleUnitsPreference>("metric");
  const [reduceMotionDraft, setReduceMotionDraft] = useState(false);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjectSortDraft(resolved.projectSort);
    setDashboardViewDraft(resolved.dashboardView);
    setGuidedProjectSetupDraft(!resolved.skipProjectSetup);
    setQuickStartBasemapDraft(resolved.quickStartBasemapId);
    setQuickStartCreateLayer1Draft(resolved.quickStartCreateLayer1);
    setScaleUnitsDraft(resolved.scaleUnits);
    setReduceMotionDraft(resolved.reduceMotion);
  }, [resolved]);

  useEffect(() => {
    if (!message && !error) return;
    const timeoutId = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 5000);
    return () => window.clearTimeout(timeoutId);
  }, [message, error]);

  async function saveSettings() {
    setWorking(true);
    setMessage(null);
    setError(null);

    const nextPreferences: Record<string, unknown> = {
      ...accountPreferences,
      projectSort: projectSortDraft,
      dashboardView: dashboardViewDraft,
      skipProjectSetup: !guidedProjectSetupDraft,
      quickStartBasemapId: quickStartBasemapDraft,
      quickStartCreateLayer1: quickStartCreateLayer1Draft,
      scaleUnits: scaleUnitsDraft,
      reduceMotion: reduceMotionDraft,
    };
    delete nextPreferences.preferredVisualExportFormat;
    delete nextPreferences.preferredVisualExportQuality;

    const fallbackParts = accountName.split(/\s+/).filter(Boolean);
    const firstName = accountFirstName ?? fallbackParts[0] ?? "";
    const lastName = accountLastName ?? fallbackParts.slice(1).join(" ");
    const ok = await setAccountProfile(firstName, lastName, nextPreferences);

    setWorking(false);
    if (ok) setMessage("Paramètres enregistrés.");
    else setError("Les paramètres n’ont pas pu être enregistrés.");
  }

  function resetEditorTutorial() {
    try {
      window.localStorage.removeItem(TOUR_STORAGE_KEY);
      window.localStorage.removeItem(TOUR_AUTO_PRESENTED_KEY);
      setError(null);
      setMessage("Tutoriel réinitialisé. Il se relancera automatiquement à la prochaine ouverture de l’éditeur.");
    } catch {
      setError("Le tutoriel n’a pas pu être réinitialisé sur cet appareil.");
    }
  }

  const feedbackToast = message || error ? (
    <div
      role={error ? "alert" : "status"}
      aria-live="assertive"
      className={`fixed left-1/2 top-6 z-[100000] w-[min(92vw,40rem)] -translate-x-1/2 rounded-2xl border px-4 py-3 text-sm font-bold shadow-lg ${
        error
          ? "border-red-300 bg-red-600 text-white"
          : "border-emerald-300 bg-emerald-600 text-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span>{error ?? message}</span>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMessage(null);
          }}
          className="shrink-0 rounded-lg px-2 py-0.5 text-lg leading-none text-white/90 hover:bg-white/15"
          aria-label="Fermer le message"
        >
          ×
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      {feedbackToast}
      <DromapProductShell
        title="Paramètres"
        description="Choisis comment DroMap démarre, affiche tes projets et prépare les nouveaux rendus."
      >
        <div className="max-w-5xl space-y-6 pb-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.18em] text-teal-600">
                  Réglages DroMap
                </div>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                  Ton espace de travail, à ta façon
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {userMode === "authenticated"
                    ? "Ces préférences sont enregistrées avec ton compte. Elles ne modifient jamais les droits de ta formule ni le contenu des projets existants."
                    : "Ces préférences sont conservées sur cet appareil. Elles ne modifient jamais les droits disponibles ni le contenu des projets existants."}
                </p>
              </div>
              <div className="rounded-2xl border border-teal-100 bg-white px-4 py-3 text-xs font-semibold leading-5 text-slate-600 shadow-sm">
                Les réglages de démarrage s’appliquent uniquement aux <strong className="text-slate-900">nouveaux projets</strong>.
              </div>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader
              title="Projets et tableau de bord"
              description="Définis l’ordre et la présentation utilisés par défaut dans Mes projets."
            />

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold text-slate-800" htmlFor="settings-project-sort">
                  Tri par défaut
                </label>
                <select
                  id="settings-project-sort"
                  value={projectSortDraft}
                  onChange={(event) =>
                    setProjectSortDraft(event.target.value as DromapProjectSortPreference)
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                >
                  <option value="updated-desc">Dernière modification</option>
                  <option value="name-asc">Nom du projet</option>
                  <option value="created-desc">Date de création</option>
                </select>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-800">Affichage par défaut</div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <ChoiceCard
                    selected={dashboardViewDraft === "grid"}
                    title="Grille"
                    description="Grandes vignettes, pratique pour reconnaître les cartes visuellement."
                    onClick={() => setDashboardViewDraft("grid")}
                  />
                  <ChoiceCard
                    selected={dashboardViewDraft === "list"}
                    title="Liste"
                    description="Cartes plus compactes, pratique quand tu as beaucoup de projets."
                    onClick={() => setDashboardViewDraft("list")}
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader
              title="Nouveaux projets"
              description="Contrôle le parcours de préparation et ce que DroMap crée lorsqu’il démarre directement dans l’éditeur."
            />

            <div className="mt-5 flex items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <div className="font-black text-slate-950">Parcours guidé en 4 étapes</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Nom, fond de carte, zone de travail et calques. Désactive ce réglage pour ouvrir directement les nouveaux projets dans l’éditeur.
                </p>
              </div>
              <Toggle
                checked={guidedProjectSetupDraft}
                onChange={() => setGuidedProjectSetupDraft((value) => !value)}
                label="Activer ou désactiver le parcours guidé"
              />
            </div>

            {!guidedProjectSetupDraft ? (
              <div className="mt-4 grid gap-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 lg:grid-cols-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-800" htmlFor="settings-quick-start-basemap">
                    Fond utilisé au démarrage rapide
                  </label>
                  <select
                    id="settings-quick-start-basemap"
                    value={quickStartBasemapDraft}
                    onChange={(event) =>
                      setQuickStartBasemapDraft(
                        event.target.value as DromapQuickStartBasemapPreference,
                      )
                    }
                    className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-100"
                  >
                    <option value="openfreemap-liberty">Classique</option>
                    <option value="openfreemap-positron">Clair</option>
                    <option value="blank-white">Fond blanc</option>
                  </select>
                </div>

                <div className="flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-white p-4">
                  <div>
                    <div className="text-sm font-black text-slate-950">Créer automatiquement « Calque 1 »</div>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      Désactive-le si tu préfères commencer sans aucun calque DroMap et créer ton premier calque toi-même.
                    </p>
                  </div>
                  <Toggle
                    checked={quickStartCreateLayer1Draft}
                    onChange={() => setQuickStartCreateLayer1Draft((value) => !value)}
                    label="Créer automatiquement Calque 1"
                  />
                </div>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900">
                Le parcours guidé est actif. Les choix de démarrage rapide ci-dessous ne seront utilisés que si tu désactives ces 4 étapes.
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader
              title="Carte et échelle"
              description="Choisis les unités utilisées par la barre d’échelle dans l’aperçu et dans les exports."
            />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <ChoiceCard
                selected={scaleUnitsDraft === "metric"}
                title="Métrique"
                description="Mètres et kilomètres. Recommandé pour la France et la plupart des usages internationaux."
                onClick={() => setScaleUnitsDraft("metric")}
              />
              <ChoiceCard
                selected={scaleUnitsDraft === "imperial"}
                title="Impérial"
                description="Pieds et miles. Utile pour les cartes destinées à un public utilisant ces unités."
                onClick={() => setScaleUnitsDraft("imperial")}
              />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader
              title="Interface et aide"
              description="Adapte les mouvements de l’interface et retrouve facilement le tutoriel de l’éditeur."
            />

            <div className="mt-5 flex items-start justify-between gap-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div>
                <div className="font-black text-slate-950">Réduire les animations de l’interface</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Réduit fortement les transitions et animations décoratives sans modifier les mouvements indispensables de la carte.
                </p>
              </div>
              <Toggle
                checked={reduceMotionDraft}
                onChange={() => setReduceMotionDraft((value) => !value)}
                label="Réduire les animations"
              />
            </div>

            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-black text-slate-950">Tutoriel de l’éditeur</div>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  Réinitialise seulement l’état du tutoriel sur cet appareil. Il se relancera à la prochaine ouverture de l’éditeur.
                </p>
              </div>
              <DromapButton onClick={resetEditorTutorial}>Réinitialiser le tutoriel</DromapButton>
            </div>
          </section>

          <section id="confidentialite" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeader
              title="Confidentialité et cookies"
              description="Modifie ton choix pour la mesure d’audience sur cet appareil. Tu peux accepter ou refuser à tout moment, sans modifier le fonctionnement de tes cartes."
            />
            <div className="mt-4">
              <DromapButton onClick={() => window.dispatchEvent(new Event(OPEN_PRIVACY_SETTINGS_EVENT))}>
                Gérer mes cookies
              </DromapButton>
            </div>
          </section>

          <div className="sticky bottom-4 z-20 flex justify-end rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
            <DromapButton variant="primary" disabled={working} onClick={() => void saveSettings()}>
              {working ? "Enregistrement…" : "Enregistrer les paramètres"}
            </DromapButton>
          </div>
        </div>
      </DromapProductShell>
    </>
  );
}

export function DromapSettingsClient() {
  return (
    <DromapProductBootstrap>
      <SettingsContent />
    </DromapProductBootstrap>
  );
}
