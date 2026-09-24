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
  'IGN Admin Express COG — 2018';

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
    id: "geoboundaries",
    title: "geoBoundaries — gbOpen",
    category: "donnees",
    license: "CC BY 4.0 pour gbOpen ; attribution requise",
    usage:
      "Limites administratives téléchargées uniquement depuis l’API gbOpen. Les variantes gbAuthoritative et gbHumanitarian ne sont pas utilisées.",
    href: "https://www.geoboundaries.org/api.html",
  },
  {
    id: "usgs-earthquakes",
    title: "U.S. Geological Survey — Earthquake Hazards Program",
    category: "donnees",
    license: "Données USGS généralement dans le domaine public ; crédit recommandé",
    usage: "Flux GeoJSON de séismes du catalogue de données.",
    href: "https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php",
  },
  {
    id: "world-bank-wdi",
    title: "World Bank — World Development Indicators",
    category: "donnees",
    license: "CC BY 4.0 + conditions additionnelles de la Banque mondiale",
    usage: "Indicateurs WDI récupérés par l’assistant lorsque la source est utilisée.",
    href: "https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators",
  },
  {
    id: "wikidata",
    title: "Wikidata",
    category: "donnees",
    license: "CC0 pour les données structurées",
    usage: "Recherche et métadonnées structurées utilisées par l’assistant.",
    href: "https://www.wikidata.org/wiki/Wikidata:Licensing",
  },
  {
    id: "wikipedia",
    title: "Wikipedia / Wikimedia",
    category: "donnees",
    license: "CC BY-SA 4.0 pour le texte, avec attribution et partage à l’identique si réutilisé",
    usage: "Source documentaire pouvant être consultée par l’assistant.",
    href: "https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use",
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
    license: "Licence Ouverte / Etalab 2.0",
    usage: "Contours administratifs français utilisés par les fonds blancs France (données IGN Admin Express COG 2018, diffusées via france-geojson).",
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
    id: "fabric-js",
    title: "Fabric.js",
    category: "bibliotheques",
    license: "MIT",
    usage:
      "Moteur de manipulation du canevas du concepteur de marqueurs personnalisés (sélection, déplacement, redimensionnement et rotation).",
    href: "https://fabricjs.com/",
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
    id: "react-leaflet",
    title: "React Leaflet",
    category: "bibliotheques",
    license: "Hippocratic License 2.1",
    usage: "Adaptateur React utilisé autour de Leaflet.",
    href: "https://github.com/PaulLeCam/react-leaflet",
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
    id: "maplibre-gl-leaflet",
    title: "MapLibre GL Leaflet",
    category: "bibliotheques",
    license: "ISC",
    usage: "Pont Leaflet ↔ MapLibre chargé pour les fonds vectoriels.",
    href: "https://github.com/maplibre/maplibre-gl-leaflet",
  },
  {
    id: "geoarrow-wasm",
    title: "GeoArrow WASM",
    category: "bibliotheques",
    license: "MIT OR Apache-2.0",
    usage: "Lecture des données GeoParquet Overture pour les bâtiments.",
    href: "https://github.com/geoarrow/geoarrow-rs",
  },
  {
    id: "leaflet-geoman",
    title: "Leaflet-Geoman Free",
    category: "bibliotheques",
    license: "MIT",
    usage: "Édition géométrique de certains objets de carte.",
    href: "https://geoman.io/",
  },
  {
    id: "openai-api",
    title: "OpenAI API",
    category: "bibliotheques",
    license: "Conditions de service OpenAI API",
    usage: "Service utilisé par l’assistant IA lorsque cette fonction est disponible.",
    href: "https://openai.com/policies/service-terms/",
  },
  {
    id: "stripe-services",
    title: "Stripe Payments / Billing / Checkout",
    category: "bibliotheques",
    license: "Stripe Services Agreement et conditions applicables aux services Stripe",
    usage:
      "Paiements ponctuels, abonnements, portail de facturation et gestion du cycle de paiement lorsque la facturation DroMap est activée.",
    href: "https://stripe.com/legal/ssa",
  },
  {
    id: "stripe-node",
    title: "Stripe Node.js Library",
    category: "bibliotheques",
    license: "MIT",
    usage: "SDK serveur officiel utilisé pour appeler l’API Stripe et vérifier les webhooks.",
    href: "https://github.com/stripe/stripe-node",
  },
  {
    id: "vercel-web-analytics",
    title: "Vercel Web Analytics",
    category: "bibliotheques",
    license: "Service Vercel ; package @vercel/analytics sous licence MIT",
    usage:
      "Mesure agrégée de l’audience des pages publiques de DroMap, sans cookie de mesure d’audience et avec exclusion des routes privées ou sensibles.",
    href: "https://vercel.com/docs/analytics",
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
    return 'Source : <a href="https://www.ign.fr/">IGN</a>';
  }

  if (basemap.kind === "maplibre" || basemap.id.startsWith("openfreemap-")) {
    return '<a href="https://www.openmaptiles.org">© OpenMapTiles</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> — openstreetmap.org/copyright';
  }

  const rawAttribution = basemap.kind === "tile" ? basemap.attribution : "";
  const normalizedAttribution = normalizeAttributionHtml(rawAttribution);

  if (normalizedAttribution.includes("carto")) {
    return '<a href="https://carto.com/attributions">© CARTO</a> · Map data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> — openstreetmap.org/copyright';
  }

  if (normalizedAttribution.includes("openstreetmap")) {
    return 'Map data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> — openstreetmap.org/copyright';
  }

  return basemap.kind === "tile" ? basemap.attribution : "";
}

function getBoundarySourceExportAttributionHtml(sourceId: string) {
  if (sourceId === "france-geojson") {
    return 'IGN Admin Express COG — 2018';
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
