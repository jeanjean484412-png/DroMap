export type DromapRoadImportCategory =
  | "motorways"
  | "main"
  | "secondary"
  | "local";

export type DromapRoadImportCategoryDefinition = {
  id: DromapRoadImportCategory;
  label: string;
  description: string;
  highwayValues: readonly string[];
  maxAreaKm2: number;
};

export const DROMAP_ROAD_IMPORT_CATEGORIES: readonly DromapRoadImportCategoryDefinition[] = [
  {
    id: "motorways",
    label: "Autoroutes",
    description: "Chaussées autoroutières principales, sans bretelles ni sorties.",
    highwayValues: ["motorway"],
    maxAreaKm2: 1_500_000,
  },
  {
    id: "main",
    label: "Nationales / principales",
    description: "Grands axes, voies rapides et routes principales, sans bretelles de raccordement.",
    highwayValues: ["trunk", "primary"],
    maxAreaKm2: 750_000,
  },
  {
    id: "secondary",
    label: "Départementales / secondaires",
    description: "Routes secondaires et tertiaires, sans bretelles de raccordement.",
    highwayValues: ["secondary", "tertiary"],
    maxAreaKm2: 120_000,
  },
  {
    id: "local",
    label: "Petites routes",
    description:
      "Routes locales, résidentielles et non classées. Les chemins et voies de service ne sont pas inclus.",
    highwayValues: ["unclassified", "residential", "living_street", "road"],
    maxAreaKm2: 10_000,
  },
] as const;

const CATEGORY_BY_ID = new Map(
  DROMAP_ROAD_IMPORT_CATEGORIES.map((category) => [category.id, category]),
);

const CATEGORY_BY_HIGHWAY = new Map<string, DromapRoadImportCategory>();
for (const category of DROMAP_ROAD_IMPORT_CATEGORIES) {
  for (const highway of category.highwayValues) {
    CATEGORY_BY_HIGHWAY.set(highway, category.id);
  }
}

export function isDromapRoadImportCategory(
  value: unknown,
): value is DromapRoadImportCategory {
  return typeof value === "string" && CATEGORY_BY_ID.has(value as DromapRoadImportCategory);
}

export function getDromapRoadImportCategoryDefinition(
  id: DromapRoadImportCategory,
) {
  return CATEGORY_BY_ID.get(id) ?? null;
}

export function getDromapRoadCategoryForHighway(
  highway: unknown,
): DromapRoadImportCategory | null {
  return typeof highway === "string" ? CATEGORY_BY_HIGHWAY.get(highway) ?? null : null;
}

export function getDromapRoadImportHighwayValues(
  categories: readonly DromapRoadImportCategory[],
) {
  const values = new Set<string>();

  for (const categoryId of categories) {
    const category = getDromapRoadImportCategoryDefinition(categoryId);
    category?.highwayValues.forEach((value) => values.add(value));
  }

  return [...values];
}

export function getDromapRoadImportMaxAreaKm2(
  categories: readonly DromapRoadImportCategory[],
) {
  if (categories.length === 0) {
    return 0;
  }

  return Math.min(
    ...categories.map(
      (categoryId) =>
        getDromapRoadImportCategoryDefinition(categoryId)?.maxAreaKm2 ?? 0,
    ),
  );
}

export function getDromapRoadImportCategoryLabel(
  category: DromapRoadImportCategory,
) {
  return getDromapRoadImportCategoryDefinition(category)?.label ?? category;
}
