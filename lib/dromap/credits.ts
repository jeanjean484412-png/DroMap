import type {
  DromapBasemapBoundaryOverlay,
  DromapBasemapConfig,
} from "./basemap";

export type DromapThirdPartyCredit = {
  id: string;
  title: string;
  category: "fond" | "donnees" | "icones" | "bibliotheques";
  license: string;
  usage: string;
  href: string;
  visibleOnMap?: boolean;
};

const NATURAL_EARTH_ATTRIBUTION =
  '<a href="https://www.naturalearthdata.com/">Natural Earth</a>';

const FRANCE_GEOJSON_ATTRIBUTION =
  '<a href="https://github.com/gregoiredavid/france-geojson">france-geojson</a> / <a href="https://geoservices.ign.fr/adminexpress">IGN Admin Express</a>';

export const DROMAP_THIRD_PARTY_CREDITS: DromapThirdPartyCredit[] = [
  {
    id: "openfreemap",
    title: "OpenFreeMap",
    category: "fond",
    license: "Service/cartes open source basés sur OpenStreetMap/OpenMapTiles",
    usage: "Fonds vectoriels Classique et Clair.",
    href: "https://openfreemap.org/",
    visibleOnMap: true,
  },
  {
    id: "openmaptiles",
    title: "OpenMapTiles",
    category: "fond",
    license: "BSD / CC BY selon les composants",
    usage: "Schéma, styles et données de tuiles utilisés par OpenFreeMap.",
    href: "https://openmaptiles.org/",
    visibleOnMap: true,
  },
  {
    id: "openstreetmap",
    title: "OpenStreetMap contributors",
    category: "donnees",
    license: "ODbL",
    usage: "Données cartographiques des fonds Classique et Clair.",
    href: "https://www.openstreetmap.org/copyright",
    visibleOnMap: true,
  },
  {
    id: "nominatim",
    title: "Nominatim",
    category: "bibliotheques",
    license: "Service de géocodage OpenStreetMap / logiciel GPL-3.0",
    usage: "Recherche ponctuelle d’un lieu et recentrage de la carte.",
    href: "https://nominatim.org/",
  },
  {
    id: "carto",
    title: "CARTO",
    category: "fond",
    license: "Attribution / conditions CARTO basemaps",
    usage: "Fonds classiques Clair, Sans textes, Voyager et Voyager sans textes.",
    href: "https://carto.com/attribution/",
    visibleOnMap: true,
  },
  {
    id: "ign-geoplateforme",
    title: "IGN / Géoplateforme",
    category: "fond",
    license: "Licence Ouverte / Etalab 2.0 selon les ressources diffusées",
    usage: "Fonds Vue satellite, Plan IGN et import de bâtiments BD TOPO® via la Géoplateforme.",
    href: "https://cartes.gouv.fr/",
    visibleOnMap: true,
  },
  {
    id: "overture-buildings",
    title: "Overture Maps Foundation — Buildings",
    category: "donnees",
    license: "ODbL 1.0",
    usage: "Empreintes mondiales de bâtiments importées hors de France, avec attribution des sources Overture et OpenStreetMap.",
    href: "https://docs.overturemaps.org/guides/buildings/",
  },
  {
    id: "natural-earth",
    title: "Natural Earth",
    category: "donnees",
    license: "Public domain",
    usage: "Frontières mondiales, pays et continents des fonds blancs pédagogiques.",
    href: "https://www.naturalearthdata.com/about/terms-of-use/",
    visibleOnMap: true,
  },
  {
    id: "france-geojson",
    title: "france-geojson / IGN Admin Express",
    category: "donnees",
    license: "Licence Ouverte / Etalab selon la source IGN Admin Express",
    usage: "Régions et départements français des fonds France.",
    href: "https://github.com/gregoiredavid/france-geojson",
    visibleOnMap: true,
  },
  {
    id: "tabler-icons",
    title: "Tabler Icons",
    category: "icones",
    license: "MIT",
    usage: "Bibliothèque de pictogrammes des marqueurs DroMap.",
    href: "https://tabler.io/icons",
  },
  {
    id: "leaflet",
    title: "Leaflet",
    category: "bibliotheques",
    license: "BSD 2-Clause",
    usage: "Carte interactive principale de l’éditeur.",
    href: "https://leafletjs.com/",
  },
  {
    id: "maplibre-gl-js",
    title: "MapLibre GL JS",
    category: "bibliotheques",
    license: "BSD 3-Clause",
    usage: "Rendu vectoriel des fonds Classique, Clair et Plan IGN.",
    href: "https://maplibre.org/",
  },
  {
    id: "leaflet-geoman",
    title: "Leaflet-Geoman Free",
    category: "bibliotheques",
    license: "MIT",
    usage: "Édition géométrique de certains objets de carte.",
    href: "https://geoman.io/",
  },
];

function getBoundaryLayerSourceId(dataUrl: string) {
  if (dataUrl.includes("natural-earth-vector")) {
    return "natural-earth";
  }

  if (dataUrl.includes("gregoiredavid/france-geojson")) {
    return "france-geojson";
  }

  if (dataUrl.startsWith("dromap://france/")) {
    return "france-geojson";
  }

  return null;
}

function getBoundarySourceAttributionHtml(sourceId: string) {
  if (sourceId === "natural-earth") {
    return NATURAL_EARTH_ATTRIBUTION;
  }

  if (sourceId === "france-geojson") {
    return FRANCE_GEOJSON_ATTRIBUTION;
  }

  return "";
}

function normalizeAttributionHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function joinUniqueAttributions(attributions: string[]) {
  const normalized = new Set<string>();
  const uniqueAttributions: string[] = [];

  for (const attribution of attributions) {
    const cleanAttribution = attribution.trim();

    if (!cleanAttribution) {
      continue;
    }

    const normalizedAttribution = normalizeAttributionHtml(cleanAttribution);

    if (normalized.has(normalizedAttribution)) {
      continue;
    }

    normalized.add(normalizedAttribution);
    uniqueAttributions.push(cleanAttribution);
  }

  return uniqueAttributions.join(" · ");
}

export function getBoundaryOverlayAttributionHtml(
  boundaryOverlay?: DromapBasemapBoundaryOverlay,
) {
  if (!boundaryOverlay) {
    return "";
  }

  const sourceIds = new Set<string>();

  for (const layer of boundaryOverlay.layers) {
    const sourceId = getBoundaryLayerSourceId(layer.dataUrl);

    if (sourceId) {
      sourceIds.add(sourceId);
    }
  }

  return joinUniqueAttributions(
    [...sourceIds]
      .map((sourceId) => getBoundarySourceAttributionHtml(sourceId))
      .filter(Boolean),
  );
}

export function getDromapBasemapAttributionHtml(
  basemap: DromapBasemapConfig,
) {
  const baseAttribution =
    basemap.kind === "tile" || basemap.kind === "maplibre"
      ? basemap.attribution
      : "";

  return joinUniqueAttributions([
    baseAttribution,
    getBoundaryOverlayAttributionHtml(basemap.boundaryOverlay),
  ]);
}

export function getDromapBoundaryAttributionHtml(
  basemap: DromapBasemapConfig,
) {
  return getBoundaryOverlayAttributionHtml(basemap.boundaryOverlay);
}


function getBaseExportAttributionHtml(basemap: DromapBasemapConfig) {
  if (
    basemap.id === "ign-satellite" ||
    basemap.id === "ign-plan" ||
    basemap.id === "ign-plan-raster"
  ) {
    return '<a href="https://www.ign.fr/">© IGN</a> · <a href="https://cartes.gouv.fr/">Géoplateforme</a>';
  }

  if (basemap.kind === "maplibre" || basemap.id.startsWith("openfreemap-")) {
    return '<a href="https://openfreemap.org">© OpenFreeMap</a> · <a href="https://www.openmaptiles.org">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright">© OSM</a>';
  }

  const rawAttribution = basemap.kind === "tile" ? basemap.attribution : "";
  const normalizedAttribution = normalizeAttributionHtml(rawAttribution);

  if (normalizedAttribution.includes("carto")) {
    return '<a href="https://carto.com/attributions">© CARTO</a> · <a href="https://www.openstreetmap.org/copyright">© OSM</a>';
  }

  if (normalizedAttribution.includes("openstreetmap")) {
    return '<a href="https://www.openstreetmap.org/copyright">© OSM</a>';
  }

  return basemap.kind === "tile" ? basemap.attribution : "";
}

function getBoundarySourceExportAttributionHtml(sourceId: string) {
  if (sourceId === "france-geojson") {
    return '<a href="https://github.com/gregoiredavid/france-geojson">© france-geojson</a> · <a href="https://geoservices.ign.fr/adminexpress">© IGN</a>';
  }

  // Natural Earth est public domain : on le garde dans le panneau Crédits,
  // mais on ne surcharge pas les images exportées avec une mention non obligatoire.
  return "";
}

export function getBoundaryOverlayExportAttributionHtml(
  boundaryOverlay?: DromapBasemapBoundaryOverlay,
) {
  if (!boundaryOverlay) {
    return "";
  }

  const sourceIds = new Set<string>();

  for (const layer of boundaryOverlay.layers) {
    const sourceId = getBoundaryLayerSourceId(layer.dataUrl);

    if (sourceId) {
      sourceIds.add(sourceId);
    }
  }

  return joinUniqueAttributions(
    [...sourceIds]
      .map((sourceId) => getBoundarySourceExportAttributionHtml(sourceId))
      .filter(Boolean),
  );
}

export function getDromapExportAttributionHtml(
  basemap: DromapBasemapConfig,
) {
  return joinUniqueAttributions([
    getBaseExportAttributionHtml(basemap),
    getBoundaryOverlayExportAttributionHtml(basemap.boundaryOverlay),
  ]);
}

export function attributionHtmlToPlainText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
