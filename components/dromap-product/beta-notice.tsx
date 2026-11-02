import { DROMAP_BETA, DROMAP_BETA_NOTICE } from "@/lib/dromap/release-mode";
import { DromapLegalContactLink } from "./legal-contact-link";

export function DromapBetaNotice({ prominent = false }: { prominent?: boolean }) {
  if (!DROMAP_BETA) return null;
  if (prominent) return <aside aria-label="DroMap en version bêta" className="mb-12 rounded-2xl border border-[#348279]/25 bg-[#e8ede0] p-6 text-[#1c4355] sm:p-10">
    <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#348279]">Version bêta · Rejoignez les premiers testeurs</p>
    <h2 className="mt-4 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">Vos cartes font avancer DroMap.</h2>
    <p className="mt-5 max-w-3xl text-lg leading-relaxed sm:text-xl">DroMap est fonctionnel et encore en développement. Essayez les outils, créez vos cartes et dites-nous ce qui fonctionne… et ce qui mérite d’être amélioré. Vos retours sont essentiels à notre équipe.</p>
    <p className="mt-4 max-w-3xl text-base leading-relaxed text-[#52616a]">Pendant les tests, un compte vous donne gratuitement accès à tous les outils disponibles et à toutes les qualités d’export, avec trois cartes enregistrées. L’assistant IA arrive prochainement. Une offre gratuite à utilisation limitée et des abonnements payants suivront.</p>
    <DromapLegalContactLink className="mt-6 inline-flex rounded-lg bg-[#1c4355] px-5 py-3 text-base font-semibold text-white transition hover:bg-[#348279]">Signaler un bug ou proposer une amélioration</DromapLegalContactLink>
  </aside>;
  return <aside className="rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm text-teal-950">
    <p className="font-bold">{DROMAP_BETA_NOTICE}</p>
    <p className="mt-2">Avec un compte, tous les outils disponibles et toutes les qualités d’export sont gratuits pendant les tests, avec trois cartes enregistrées. Vos retours via Contact sont essentiels. Assistant IA et abonnements payants à venir.</p>
    <DromapLegalContactLink className="mt-3 font-bold underline">Signaler un bug ou proposer une amélioration</DromapLegalContactLink>
  </aside>;
}
