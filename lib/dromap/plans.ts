export type DromapAccountPlan = "free" | "plus" | "pro" | "tester";

export type DromapPublicPlanId = "guest" | "free" | "plus" | "pro" | "single-map";

export type DromapPlanDefinition = {
  id: DromapPublicPlanId;
  name: string;
  shortDescription: string;
  monthlyPriceEur: number | null;
  yearlyPriceEur: number | null;
  oneTimePriceEur: number | null;
  highlights: string[];
};

export const DROMAP_PLAN_DEFINITIONS: readonly DromapPlanDefinition[] = [
  {
    id: "guest",
    name: "Sans compte",
    shortDescription: "Pour essayer DroMap immédiatement.",
    monthlyPriceEur: 0,
    yearlyPriceEur: null,
    oneTimePriceEur: null,
    highlights: [
      "1 projet temporaire sur cet appareil",
      "Outils manuels essentiels",
      "Export PNG Standard avec mention DroMap",
      "Bibliothèque publique consultable",
      "Pas de marqueur personnalisé",
    ],
  },
  {
    id: "free",
    name: "Gratuit",
    shortDescription: "Pour conserver quelques cartes en ligne.",
    monthlyPriceEur: 0,
    yearlyPriceEur: null,
    oneTimePriceEur: null,
    highlights: [
      "Compte et sauvegarde en ligne",
      "Outils manuels essentiels",
      "Export PNG Standard",
      "Bibliothèque publique consultable",
      "Pas de marqueur personnalisé",
    ],
  },
  {
    id: "plus",
    name: "Plus",
    shortDescription: "Pour créer régulièrement des cartes abouties.",
    monthlyPriceEur: 7,
    yearlyPriceEur: 75,
    oneTimePriceEur: null,
    highlights: [
      "Exports haute qualité et formats avancés",
      "Marqueurs personnalisés et bibliothèques",
      "Assistant IA et bâtiments",
      "Légende avancée et export de données",
      "Publication et téléchargement des cartes publiques",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    shortDescription: "Pour un usage intensif et des quotas supérieurs.",
    monthlyPriceEur: 13,
    yearlyPriceEur: 140,
    oneTimePriceEur: null,
    highlights: [
      "Toutes les fonctions de Plus",
      "Quotas IA et traitements plus élevés",
      "Publication et téléchargement des cartes publiques",
      "Priorité aux fonctions professionnelles futures",
    ],
  },
  {
    id: "single-map",
    name: "Export Max à l’unité",
    shortDescription: "Pour acheter la qualité maximale sur une seule carte sans abonnement.",
    monthlyPriceEur: null,
    yearlyPriceEur: null,
    oneTimePriceEur: 3,
    highlights: [
      "Paiement unique rattaché au projet",
      "Qualité maximale + PNG, JPEG, WebP, PDF et SVG",
      "Détail du fond et affichage des écritures du fond",
      "Réexport de cette même carte sans nouvel achat",
      "Zone de travail verrouillée après le premier téléchargement",
      "N’inclut pas l’IA, les bâtiments ni les marqueurs personnalisés",
    ],
  },
] as const;

export function normalizeDromapAccountPlan(value: unknown): DromapAccountPlan {
  return value === "free" || value === "plus" || value === "pro" || value === "tester"
    ? value
    : "tester";
}

export function getDromapAccountPlanLabel(plan: DromapAccountPlan) {
  if (plan === "free") return "Gratuit";
  if (plan === "plus") return "Plus";
  if (plan === "pro") return "Pro";
  return "Accès de test";
}
