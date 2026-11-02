import { DROMAP_BETA, DROMAP_BETA_NOTICE } from "@/lib/dromap/release-mode";
import { DromapLegalContactLink } from "./legal-contact-link";

export function DromapBetaNotice() {
  if (!DROMAP_BETA) return null;
  return <aside className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
    <p className="font-bold">{DROMAP_BETA_NOTICE}</p>
    <p className="mt-2">Participez aux tests : signalez les bugs et proposez vos améliorations via Contact. Trois cartes enregistrées sont disponibles pendant cette phase. L’offre gratuite à utilisation limitée et les abonnements payants seront proposés prochainement. Assistant IA à venir.</p>
    <DromapLegalContactLink className="mt-3 font-bold underline">Signaler un bug ou proposer une amélioration</DromapLegalContactLink>
  </aside>;
}
