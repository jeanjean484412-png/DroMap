export type DromapBasemapId = string;

export type DromapBasemapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type DromapBasemapBoundaryLayerKind =
  | "coastline"
  | "admin0-boundaries"
  | "admin0-countries"
  | "admin1-regions"
  | "france-outline"
  | "france-regions"
  | "france-departments";

export type DromapBasemapBoundaryLayer = {
  kind: DromapBasemapBoundaryLayerKind;
  dataUrl: string;
  strokeColor: string;
  strokeOpacity: number;
  strokeWeight: number;
  strokeDashArray?: string;
  /**
   * all : rendu brut des géométries.
   * unique : chaque segment visible n’est tracé qu’une seule fois. Utile pour
   * les continents, afin que les frontières internes et externes aient la même force.
   * interior : seuls les segments partagés entre subdivisions sont tracés. Utile
   * pour pays + régions, afin que la frontière extérieure ne soit pas doublée.
   * exterior : seuls les segments non partagés entre subdivisions sont tracés. Utile
   * pour retracer le contour extérieur d’un pays depuis les mêmes régions que
   * celles utilisées par le remplissage, sans décalage de précision.
   */
  boundaryRenderMode?: "all" | "unique" | "interior" | "exterior";
  /**
   * Masque les micro-frontières/enclaves Natural Earth qui créent des petits
   * traits parasites sur les fonds monde précis. On garde les vraies frontières
   * pédagogiquement lisibles, mais on évite les cas type micro-enclaves.
   */
  hideMicroBoundaryLines?: boolean;
  microBoundaryMaxSpan?: number;
  /**
   * Ignore les anneaux intérieurs GeoJSON. Pour les fonds monde/pays, cela
   * évite d'afficher des trous techniques, micro-enclaves et découpes internes
   * qui ne sont pas des frontières utiles à l'échelle pédagogique.
   */
  suppressInteriorRings?: boolean;
  /**
   * Masque les très petites parties de polygone sur certains fonds mondiaux.
   * Cela supprime les micro-enclaves Natural Earth qui ressemblent à des bugs
   * de frontière quand la carte est affichée à l'échelle Europe/monde.
   */
  minimumPolygonPartSpan?: number;
  hideDisputed?: boolean;
  continent?: string;
  countryIsoA2?: string;
  countryIsoA3?: string;
  countryName?: string;
  /**
   * Limite géographique utilisée pour rester sur la métropole d’un pays quand
   * Natural Earth associe aussi des territoires ultramarins ou dépendances.
   */
  metropolitanBounds?: DromapBasemapBounds;
  /**
   * Déplie seulement les géométries qui traversent l'antiméridien en
   * décalant le morceau à l'ouest vers la droite. À utiliser avec parcimonie
   * sur les fonds blancs vectoriels où la coupure du monde gêne la lecture.
   */
  antimeridianMode?: "unwrap-east";
  antimeridianWestThreshold?: number;
  /**
   * Masque le trait technique de découpe à l'antiméridien après dépliage.
   * Ce trait n'est pas une vraie frontière : il vient seulement de la coupure
   * GeoJSON du monde à 180°.
   */
  hideAntimeridianSeam?: boolean;
};

export type DromapBasemapBoundaryOverlay = {
  type: "pedagogical-boundaries";
  layers: DromapBasemapBoundaryLayer[];
};

type DromapBasemapCommon = {
  id: DromapBasemapId;
  label: string;
  description: string;
  exportBackground: string;
  boundaryOverlay?: DromapBasemapBoundaryOverlay;
  /**
   * Étend uniquement le fond blanc pédagogique affiché derrière les frontières.
   * Cela permet de raccrocher visuellement un pays à cheval sur l'antiméridien
   * sans modifier les fonds classiques à tuiles.
   */
  worldBackgroundBounds?: DromapBasemapBounds;
};

type DromapTileBasemap = DromapBasemapCommon & {
  kind: "tile";
  tileUrl: string;
  /**
   * URL utilisée uniquement dans l'éditeur. Elle peut pointer vers des tuiles
   * haute densité au même niveau de zoom logique, pour améliorer la netteté
   * sans charger un zoom cartographique plus détaillé.
   */
  screenTileUrl?: string;
  attribution: string;
  maxZoom: number;
  getExportTileUrl: (zoom: number, x: number, y: number) => string;
};

type DromapMapLibreBasemap = DromapBasemapCommon & {
  kind: "maplibre";
  /**
   * Style MapLibre/OpenFreeMap. Contrairement aux tuiles raster classiques,
   * le fond est rendu en vectoriel dans le navigateur et peut donc être exporté
   * en haute résolution sans demander un zoom de tuile supérieur.
   */
  styleUrl: string;
  attribution: string;
  maxZoom: number;
};

type DromapSolidBasemap = DromapBasemapCommon & {
  kind: "solid";
  background: string;
};

export type DromapBasemapConfig =
  | DromapTileBasemap
  | DromapMapLibreBasemap
  | DromapSolidBasemap;

export type DromapBasemapMenuItem =
  | {
      type: "basemap";
      basemapId: DromapBasemapId;
      label?: string;
      description?: string;
    }
  | {
      type: "group";
      id: string;
      label: string;
      description?: string;
      defaultOpen?: boolean;
      items: DromapBasemapMenuItem[];
    };

export type DromapBasemapMenuSection = {
  id: string;
  label: string;
  description: string;
  items: DromapBasemapMenuItem[];
};

type CountryBasemapDefinition = {
  isoA2: string;
  isoA3: string;
  fallbackLabel: string;
};

type ContinentBasemapDefinition = {
  id: string;
  label: string;
  naturalEarthContinent: string;
  wholeLabel: string;
  countries: CountryBasemapDefinition[];
};

const NATURAL_EARTH_110M_ADMIN0_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson";

const NATURAL_EARTH_50M_ADMIN0_COUNTRIES_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson";

const NATURAL_EARTH_10M_ADMIN1_REGIONS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson";

const NATURAL_EARTH_50M_ADMIN1_REGIONS_URL =
  "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson";

const FRANCE_OUTLINE_FROM_REGIONS_URL = "dromap://france/outline-from-regions";

const FRANCE_REGIONS_SIMPLIFIED_URL =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/regions-version-simplifiee.geojson";

const FRANCE_DEPARTMENTS_SIMPLIFIED_URL =
  "https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/departements-version-simplifiee.geojson";

const CARTO_SUBDOMAINS = ["a", "b", "c", "d"];

function getCartoSubdomain(zoom: number, x: number, y: number) {
  return CARTO_SUBDOMAINS[Math.abs(x + y + zoom) % CARTO_SUBDOMAINS.length];
}

function country(isoA2: string, isoA3: string, fallbackLabel: string) {
  return { isoA2, isoA3, fallbackLabel } satisfies CountryBasemapDefinition;
}

function getFrenchCountryLabel(countryDefinition: CountryBasemapDefinition) {
  try {
    const displayNames = new Intl.DisplayNames(["fr"], { type: "region" });
    const label = displayNames.of(countryDefinition.isoA2);

    if (label && label !== countryDefinition.isoA2) {
      return label;
    }
  } catch {
    // Intl.DisplayNames peut être absent dans de vieux environnements.
  }

  return countryDefinition.fallbackLabel;
}

function sortCountries(countries: CountryBasemapDefinition[]) {
  return [...countries].sort((first, second) =>
    getFrenchCountryLabel(first).localeCompare(
      getFrenchCountryLabel(second),
      "fr",
      { sensitivity: "base" },
    ),
  );
}

const EUROPE_COUNTRIES = sortCountries([
  country("AL", "ALB", "Albanie"),
  country("DE", "DEU", "Allemagne"),
  country("AD", "AND", "Andorre"),
  country("AT", "AUT", "Autriche"),
  country("BE", "BEL", "Belgique"),
  country("BY", "BLR", "Biélorussie"),
  country("BA", "BIH", "Bosnie-Herzégovine"),
  country("BG", "BGR", "Bulgarie"),
  country("CY", "CYP", "Chypre"),
  country("HR", "HRV", "Croatie"),
  country("DK", "DNK", "Danemark"),
  country("ES", "ESP", "Espagne"),
  country("EE", "EST", "Estonie"),
  country("FI", "FIN", "Finlande"),
  country("FR", "FRA", "France"),
  country("GR", "GRC", "Grèce"),
  country("HU", "HUN", "Hongrie"),
  country("IE", "IRL", "Irlande"),
  country("IS", "ISL", "Islande"),
  country("IT", "ITA", "Italie"),
  country("XK", "KOS", "Kosovo"),
  country("LV", "LVA", "Lettonie"),
  country("LI", "LIE", "Liechtenstein"),
  country("LT", "LTU", "Lituanie"),
  country("LU", "LUX", "Luxembourg"),
  country("MK", "MKD", "Macédoine du Nord"),
  country("MT", "MLT", "Malte"),
  country("MD", "MDA", "Moldavie"),
  country("MC", "MCO", "Monaco"),
  country("ME", "MNE", "Monténégro"),
  country("NO", "NOR", "Norvège"),
  country("NL", "NLD", "Pays-Bas"),
  country("PL", "POL", "Pologne"),
  country("PT", "PRT", "Portugal"),
  country("CZ", "CZE", "Tchéquie"),
  country("RO", "ROU", "Roumanie"),
  country("GB", "GBR", "Royaume-Uni"),
  country("RU", "RUS", "Russie"),
  country("SM", "SMR", "Saint-Marin"),
  country("RS", "SRB", "Serbie"),
  country("SK", "SVK", "Slovaquie"),
  country("SI", "SVN", "Slovénie"),
  country("SE", "SWE", "Suède"),
  country("CH", "CHE", "Suisse"),
  country("TR", "TUR", "Turquie"),
  country("UA", "UKR", "Ukraine"),
  country("VA", "VAT", "Vatican"),
]);

const AFRICA_COUNTRIES = sortCountries([
  country("ZA", "ZAF", "Afrique du Sud"),
  country("DZ", "DZA", "Algérie"),
  country("AO", "AGO", "Angola"),
  country("BJ", "BEN", "Bénin"),
  country("BW", "BWA", "Botswana"),
  country("BF", "BFA", "Burkina Faso"),
  country("BI", "BDI", "Burundi"),
  country("CM", "CMR", "Cameroun"),
  country("CV", "CPV", "Cap-Vert"),
  country("CF", "CAF", "Centrafrique"),
  country("KM", "COM", "Comores"),
  country("CG", "COG", "Congo"),
  country("CI", "CIV", "Côte d’Ivoire"),
  country("DJ", "DJI", "Djibouti"),
  country("EG", "EGY", "Égypte"),
  country("ER", "ERI", "Érythrée"),
  country("SZ", "SWZ", "Eswatini"),
  country("ET", "ETH", "Éthiopie"),
  country("GA", "GAB", "Gabon"),
  country("GM", "GMB", "Gambie"),
  country("GH", "GHA", "Ghana"),
  country("GN", "GIN", "Guinée"),
  country("GQ", "GNQ", "Guinée équatoriale"),
  country("GW", "GNB", "Guinée-Bissau"),
  country("KE", "KEN", "Kenya"),
  country("LS", "LSO", "Lesotho"),
  country("LR", "LBR", "Liberia"),
  country("LY", "LBY", "Libye"),
  country("MG", "MDG", "Madagascar"),
  country("MW", "MWI", "Malawi"),
  country("ML", "MLI", "Mali"),
  country("MA", "MAR", "Maroc"),
  country("MU", "MUS", "Maurice"),
  country("MR", "MRT", "Mauritanie"),
  country("MZ", "MOZ", "Mozambique"),
  country("NA", "NAM", "Namibie"),
  country("NE", "NER", "Niger"),
  country("NG", "NGA", "Nigeria"),
  country("UG", "UGA", "Ouganda"),
  country("RW", "RWA", "Rwanda"),
  country("EH", "ESH", "Sahara occidental"),
  country("ST", "STP", "Sao Tomé-et-Principe"),
  country("SN", "SEN", "Sénégal"),
  country("SC", "SYC", "Seychelles"),
  country("SL", "SLE", "Sierra Leone"),
  country("SO", "SOM", "Somalie"),
  country("SD", "SDN", "Soudan"),
  country("SS", "SSD", "Soudan du Sud"),
  country("TZ", "TZA", "Tanzanie"),
  country("TD", "TCD", "Tchad"),
  country("TG", "TGO", "Togo"),
  country("TN", "TUN", "Tunisie"),
  country("CD", "COD", "République démocratique du Congo"),
  country("ZM", "ZMB", "Zambie"),
  country("ZW", "ZWE", "Zimbabwe"),
]);

const ASIA_COUNTRIES = sortCountries([
  country("AF", "AFG", "Afghanistan"),
  country("SA", "SAU", "Arabie saoudite"),
  country("AM", "ARM", "Arménie"),
  country("AZ", "AZE", "Azerbaïdjan"),
  country("BH", "BHR", "Bahreïn"),
  country("BD", "BGD", "Bangladesh"),
  country("BT", "BTN", "Bhoutan"),
  country("BN", "BRN", "Brunei"),
  country("KH", "KHM", "Cambodge"),
  country("CN", "CHN", "Chine"),
  country("KP", "PRK", "Corée du Nord"),
  country("KR", "KOR", "Corée du Sud"),
  country("AE", "ARE", "Émirats arabes unis"),
  country("GE", "GEO", "Géorgie"),
  country("IN", "IND", "Inde"),
  country("ID", "IDN", "Indonésie"),
  country("IR", "IRN", "Iran"),
  country("IQ", "IRQ", "Irak"),
  country("IL", "ISR", "Israël"),
  country("JP", "JPN", "Japon"),
  country("JO", "JOR", "Jordanie"),
  country("KZ", "KAZ", "Kazakhstan"),
  country("KG", "KGZ", "Kirghizistan"),
  country("KW", "KWT", "Koweït"),
  country("LA", "LAO", "Laos"),
  country("LB", "LBN", "Liban"),
  country("MY", "MYS", "Malaisie"),
  country("MV", "MDV", "Maldives"),
  country("MN", "MNG", "Mongolie"),
  country("MM", "MMR", "Myanmar"),
  country("NP", "NPL", "Népal"),
  country("OM", "OMN", "Oman"),
  country("UZ", "UZB", "Ouzbékistan"),
  country("PK", "PAK", "Pakistan"),
  country("PS", "PSE", "Palestine"),
  country("PH", "PHL", "Philippines"),
  country("QA", "QAT", "Qatar"),
  country("SG", "SGP", "Singapour"),
  country("LK", "LKA", "Sri Lanka"),
  country("SY", "SYR", "Syrie"),
  country("TJ", "TJK", "Tadjikistan"),
  country("TW", "TWN", "Taïwan"),
  country("TH", "THA", "Thaïlande"),
  country("TL", "TLS", "Timor oriental"),
  country("TM", "TKM", "Turkménistan"),
  country("VN", "VNM", "Vietnam"),
  country("YE", "YEM", "Yémen"),
]);

const NORTH_AMERICA_COUNTRIES = sortCountries([
  country("AG", "ATG", "Antigua-et-Barbuda"),
  country("BS", "BHS", "Bahamas"),
  country("BB", "BRB", "Barbade"),
  country("BZ", "BLZ", "Belize"),
  country("CA", "CAN", "Canada"),
  country("CR", "CRI", "Costa Rica"),
  country("CU", "CUB", "Cuba"),
  country("DM", "DMA", "Dominique"),
  country("SV", "SLV", "El Salvador"),
  country("US", "USA", "États-Unis"),
  country("GD", "GRD", "Grenade"),
  country("GL", "GRL", "Groenland"),
  country("GT", "GTM", "Guatemala"),
  country("HT", "HTI", "Haïti"),
  country("HN", "HND", "Honduras"),
  country("JM", "JAM", "Jamaïque"),
  country("MX", "MEX", "Mexique"),
  country("NI", "NIC", "Nicaragua"),
  country("PA", "PAN", "Panama"),
  country("DO", "DOM", "République dominicaine"),
  country("KN", "KNA", "Saint-Christophe-et-Niévès"),
  country("LC", "LCA", "Sainte-Lucie"),
  country("VC", "VCT", "Saint-Vincent-et-les-Grenadines"),
  country("TT", "TTO", "Trinité-et-Tobago"),
]);

const SOUTH_AMERICA_COUNTRIES = sortCountries([
  country("AR", "ARG", "Argentine"),
  country("BO", "BOL", "Bolivie"),
  country("BR", "BRA", "Brésil"),
  country("CL", "CHL", "Chili"),
  country("CO", "COL", "Colombie"),
  country("EC", "ECU", "Équateur"),
  country("GY", "GUY", "Guyana"),
  country("PY", "PRY", "Paraguay"),
  country("PE", "PER", "Pérou"),
  country("SR", "SUR", "Suriname"),
  country("UY", "URY", "Uruguay"),
  country("VE", "VEN", "Venezuela"),
]);

const OCEANIA_COUNTRIES = sortCountries([
  country("AU", "AUS", "Australie"),
  country("FJ", "FJI", "Fidji"),
  country("KI", "KIR", "Kiribati"),
  country("MH", "MHL", "Îles Marshall"),
  country("SB", "SLB", "Îles Salomon"),
  country("FM", "FSM", "Micronésie"),
  country("NR", "NRU", "Nauru"),
  country("NZ", "NZL", "Nouvelle-Zélande"),
  country("PW", "PLW", "Palaos"),
  country("PG", "PNG", "Papouasie-Nouvelle-Guinée"),
  country("WS", "WSM", "Samoa"),
  country("TO", "TON", "Tonga"),
  country("TV", "TUV", "Tuvalu"),
  country("VU", "VUT", "Vanuatu"),
]);

const CONTINENTS: ContinentBasemapDefinition[] = [
  {
    id: "europe",
    label: "Europe",
    naturalEarthContinent: "Europe",
    wholeLabel: "Europe entière",
    countries: EUROPE_COUNTRIES,
  },
  {
    id: "africa",
    label: "Afrique",
    naturalEarthContinent: "Africa",
    wholeLabel: "Afrique entière",
    countries: AFRICA_COUNTRIES,
  },
  {
    id: "asia",
    label: "Asie",
    naturalEarthContinent: "Asia",
    wholeLabel: "Asie entière",
    countries: ASIA_COUNTRIES,
  },
  {
    id: "north-america",
    label: "Amérique du Nord",
    naturalEarthContinent: "North America",
    wholeLabel: "Amérique du Nord entière",
    countries: NORTH_AMERICA_COUNTRIES,
  },
  {
    id: "south-america",
    label: "Amérique du Sud",
    naturalEarthContinent: "South America",
    wholeLabel: "Amérique du Sud entière",
    countries: SOUTH_AMERICA_COUNTRIES,
  },
  {
    id: "oceania",
    label: "Océanie",
    naturalEarthContinent: "Oceania",
    wholeLabel: "Océanie entière",
    countries: OCEANIA_COUNTRIES,
  },
  {
    id: "antarctica",
    label: "Antarctique",
    naturalEarthContinent: "Antarctica",
    wholeLabel: "Antarctique entier",
    countries: [],
  },
];

const COUNTRIES_WITH_ADMIN1_REGIONS = new Set([
  "AGO",
  "ALB",
  "ARG",
  "ARM",
  "AUS",
  "AUT",
  "AZE",
  "BDI",
  "BEL",
  "BEN",
  "BFA",
  "BGD",
  "BGR",
  "BIH",
  "BLR",
  "BOL",
  "BRA",
  "BTN",
  "BWA",
  "CAF",
  "CAN",
  "CHE",
  "CHL",
  "CHN",
  "CIV",
  "CMR",
  "COD",
  "COG",
  "COL",
  "CRI",
  "CUB",
  "CZE",
  "DEU",
  "DNK",
  "DOM",
  "DZA",
  "ECU",
  "EGY",
  "ERI",
  "ESP",
  "EST",
  "ETH",
  "FIN",
  "FRA",
  "GAB",
  "GBR",
  "GEO",
  "GHA",
  "GIN",
  "GRC",
  "GTM",
  "HND",
  "HRV",
  "HTI",
  "HUN",
  "IDN",
  "IND",
  "IRL",
  "IRN",
  "IRQ",
  "ITA",
  "JAM",
  "JOR",
  "JPN",
  "KAZ",
  "KEN",
  "KGZ",
  "KHM",
  "KOR",
  "LAO",
  "LBN",
  "LBR",
  "LBY",
  "LKA",
  "LSO",
  "LTU",
  "LVA",
  "MAR",
  "MDA",
  "MDG",
  "MEX",
  "MKD",
  "MLI",
  "MMR",
  "MNE",
  "MNG",
  "MOZ",
  "MRT",
  "MWI",
  "MYS",
  "NAM",
  "NER",
  "NGA",
  "NIC",
  "NLD",
  "NOR",
  "NPL",
  "NZL",
  "OMN",
  "PAK",
  "PAN",
  "PER",
  "PHL",
  "PNG",
  "POL",
  "PRK",
  "PRT",
  "PRY",
  "ROU",
  "RUS",
  "RWA",
  "SAU",
  "SDN",
  "SEN",
  "SLV",
  "SOM",
  "SRB",
  "SSD",
  "SVK",
  "SVN",
  "SWE",
  "SWZ",
  "SYR",
  "TCD",
  "TGO",
  "THA",
  "TJK",
  "TKM",
  "TUN",
  "TUR",
  "TZA",
  "UGA",
  "UKR",
  "URY",
  "USA",
  "UZB",
  "VEN",
  "VNM",
  "YEM",
  "ZAF",
  "ZMB",
  "ZWE",
]);

function countryHasAdmin1Regions(countryDefinition: CountryBasemapDefinition) {
  return COUNTRIES_WITH_ADMIN1_REGIONS.has(countryDefinition.isoA3);
}

const METROPOLITAN_BOUNDS_BY_ISO_A3: Partial<
  Record<string, DromapBasemapBounds>
> = {
  // Ces limites ne servent pas à définir les frontières : elles éliminent les
  // dépendances/territoires éloignés quand Natural Earth les rattache encore au
  // pays. La France garde ses fonds dédiés déjà limités à métropole + Corse.
  AUS: { west: 112, south: -44.5, east: 154.5, north: -9 },
  DNK: { west: 7.5, south: 54.3, east: 15.7, north: 58.2 },
  ESP: { west: -10.5, south: 35, east: 5.1, north: 44.5 },
  GBR: { west: -9.5, south: 49.5, east: 2.5, north: 61.2 },
  NLD: { west: 3, south: 50.5, east: 7.5, north: 54 },
  NOR: { west: 4, south: 57, east: 32.5, north: 72.5 },
  NZL: { west: 165, south: -48, east: 179.5, north: -33 },
  PRT: { west: -10, south: 36.5, east: -6, north: 42.5 },
  USA: { west: -125.5, south: 24, east: -66, north: 50 },
};

const ANTIMERIDIAN_EAST_BACKGROUND_BOUNDS: DromapBasemapBounds = {
  west: -180,
  south: -85.05112878,
  east: 240,
  north: 85.05112878,
};

function getCountryMetropolitanBounds(
  countryDefinition: CountryBasemapDefinition,
) {
  return METROPOLITAN_BOUNDS_BY_ISO_A3[countryDefinition.isoA3];
}

function shouldUnwrapRussiaAntimeridian(
  countryDefinition: CountryBasemapDefinition,
) {
  return countryDefinition.isoA3 === "RUS";
}

const STATIC_BASEMAPS: DromapBasemapConfig[] = [
  {
    id: "osm",
    kind: "tile",
    label: "Standard",
    description: "Fond OpenStreetMap actuel, avec noms et routes.",
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
    exportBackground: "#f8fafc",
    getExportTileUrl: (zoom, x, y) =>
      `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`,
  },

  {
    id: "openfreemap-liberty",
    kind: "maplibre",
    label: "OpenFreeMap Liberty",
    description:
      "Fond vectoriel gratuit basé sur OpenStreetMap/OpenMapTiles, sans clé API.",
    styleUrl: "https://tiles.openfreemap.org/styles/liberty",
    attribution:
      '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
  },
  {
    id: "openfreemap-positron",
    kind: "maplibre",
    label: "OpenFreeMap Clair",
    description:
      "Fond vectoriel clair, gratuit, lisible pour les cartes pédagogiques.",
    styleUrl: "https://tiles.openfreemap.org/styles/positron",
    attribution:
      '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
  },
  {
    id: "openfreemap-bright",
    kind: "maplibre",
    label: "OpenFreeMap Bright",
    description:
      "Fond vectoriel OpenFreeMap plus coloré, gratuit et sans clé API.",
    styleUrl: "https://tiles.openfreemap.org/styles/bright",
    attribution:
      '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
  },
  {
    id: "carto-light",
    kind: "tile",
    label: "Clair",
    description: "Fond clair plus discret, avec labels.",
    tileUrl: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    screenTileUrl:
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
    getExportTileUrl: (zoom, x, y) => {
      const subdomain = getCartoSubdomain(zoom, x, y);
      return `https://${subdomain}.basemaps.cartocdn.com/light_all/${zoom}/${x}/${y}.png`;
    },
  },
  {
    id: "carto-no-labels",
    kind: "tile",
    label: "Sans textes",
    description: "Fond clair sans noms de villes ni labels cartographiques.",
    tileUrl:
      "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",
    screenTileUrl:
      "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}@2x.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
    getExportTileUrl: (zoom, x, y) => {
      const subdomain = getCartoSubdomain(zoom, x, y);
      return `https://${subdomain}.basemaps.cartocdn.com/light_nolabels/${zoom}/${x}/${y}.png`;
    },
  },
  {
    id: "carto-voyager",
    kind: "tile",
    label: "Voyager",
    description:
      "Fond classique lisible avec couleurs douces, routes et labels.",
    tileUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    screenTileUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
    getExportTileUrl: (zoom, x, y) => {
      const subdomain = getCartoSubdomain(zoom, x, y);
      return `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager/${zoom}/${x}/${y}.png`;
    },
  },
  {
    id: "carto-voyager-no-labels",
    kind: "tile",
    label: "Voyager sans textes",
    description: "Fond Voyager sans labels, pratique pour une carte annotée.",
    tileUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png",
    screenTileUrl:
      "https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}@2x.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    maxZoom: 20,
    exportBackground: "#f8fafc",
    getExportTileUrl: (zoom, x, y) => {
      const subdomain = getCartoSubdomain(zoom, x, y);
      return `https://${subdomain}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/${zoom}/${x}/${y}.png`;
    },
  },
  {
    id: "blank-white",
    kind: "solid",
    label: "Blanc uni",
    description: "Fond blanc vide, sans tuiles, sans textes ni frontières.",
    background: "#ffffff",
    exportBackground: "#ffffff",
  },
  {
    id: "white-borders-basic",
    kind: "solid",
    label: "Frontières de base",
    description:
      "Fond blanc avec frontières noires simplifiées, plus léger pour dessiner.",
    background: "#ffffff",
    exportBackground: "#ffffff",
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "admin0-countries",
          dataUrl: NATURAL_EARTH_110M_ADMIN0_COUNTRIES_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.9,
          strokeWeight: 0.95,
          boundaryRenderMode: "unique",
          suppressInteriorRings: true,
          minimumPolygonPartSpan: 0.08,
          hideDisputed: true,
        },
      ],
    },
  },
  {
    id: "white-borders",
    kind: "solid",
    label: "Frontières précises",
    description:
      "Fond blanc avec côtes et frontières noires plus détaillées, sans textes ni routes.",
    background: "#ffffff",
    exportBackground: "#ffffff",
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "admin0-countries",
          dataUrl: NATURAL_EARTH_50M_ADMIN0_COUNTRIES_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.92,
          strokeWeight: 0.95,
          boundaryRenderMode: "unique",
          suppressInteriorRings: true,
          minimumPolygonPartSpan: 0.08,
          hideDisputed: true,
        },
      ],
    },
  },
  {
    id: "france-outline",
    kind: "solid",
    label: "France seule",
    description:
      "Fond blanc avec uniquement le contour de la France métropolitaine et de la Corse.",
    background: "#ffffff",
    exportBackground: "#ffffff",
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "france-outline",
          dataUrl: FRANCE_OUTLINE_FROM_REGIONS_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.95,
          strokeWeight: 1.15,
        },
      ],
    },
  },
  {
    id: "france-regions",
    kind: "solid",
    label: "France + régions",
    description:
      "Fond blanc avec uniquement la France, la Corse et les limites régionales.",
    background: "#ffffff",
    exportBackground: "#ffffff",
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "france-regions",
          dataUrl: FRANCE_REGIONS_SIMPLIFIED_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.62,
          strokeWeight: 0.55,
          boundaryRenderMode: "interior",
        },
        {
          kind: "france-outline",
          dataUrl: FRANCE_OUTLINE_FROM_REGIONS_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.98,
          strokeWeight: 1.15,
        },
      ],
    },
  },
  {
    id: "france-departments",
    kind: "solid",
    label: "France + régions + départements",
    description:
      "Fond blanc avec uniquement la France, la Corse, les régions et les départements.",
    background: "#ffffff",
    exportBackground: "#ffffff",
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "france-departments",
          dataUrl: FRANCE_DEPARTMENTS_SIMPLIFIED_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.46,
          strokeWeight: 0.38,
          boundaryRenderMode: "interior",
        },
        {
          kind: "france-regions",
          dataUrl: FRANCE_REGIONS_SIMPLIFIED_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.68,
          strokeWeight: 0.68,
          boundaryRenderMode: "interior",
        },
        {
          kind: "france-outline",
          dataUrl: FRANCE_OUTLINE_FROM_REGIONS_URL,
          strokeColor: "#111827",
          strokeOpacity: 0.98,
          strokeWeight: 1.15,
        },
      ],
    },
  },
];

function createContinentBasemap(
  continent: ContinentBasemapDefinition,
): DromapBasemapConfig {
  const unwrapRussiaInEurope = continent.id === "europe";

  return {
    id: `continent-${continent.id}`,
    kind: "solid",
    label: continent.wholeLabel,
    description: `Fond blanc avec uniquement ${continent.label.toLowerCase()} et les frontières des pays.`,
    background: "#ffffff",
    exportBackground: "#ffffff",
    worldBackgroundBounds: unwrapRussiaInEurope
      ? ANTIMERIDIAN_EAST_BACKGROUND_BOUNDS
      : undefined,
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "admin0-countries",
          dataUrl: NATURAL_EARTH_50M_ADMIN0_COUNTRIES_URL,
          continent: continent.naturalEarthContinent,
          strokeColor: "#111827",
          strokeOpacity: 0.98,
          strokeWeight: 1.05,
          boundaryRenderMode: "unique",
          hideDisputed: true,
          antimeridianMode: unwrapRussiaInEurope ? "unwrap-east" : undefined,
          antimeridianWestThreshold: -120,
          hideAntimeridianSeam: unwrapRussiaInEurope,
        },
      ],
    },
  };
}

function createCountryBasemap(
  countryDefinition: CountryBasemapDefinition,
): DromapBasemapConfig {
  const label = getFrenchCountryLabel(countryDefinition);

  return {
    id: `country-${countryDefinition.isoA3.toLowerCase()}`,
    kind: "solid",
    label: `${label} seul`,
    description: `Fond blanc avec uniquement ${label}.`,
    background: "#ffffff",
    exportBackground: "#ffffff",
    worldBackgroundBounds: shouldUnwrapRussiaAntimeridian(countryDefinition)
      ? ANTIMERIDIAN_EAST_BACKGROUND_BOUNDS
      : undefined,
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "admin0-countries",
          dataUrl: NATURAL_EARTH_50M_ADMIN0_COUNTRIES_URL,
          countryIsoA2: countryDefinition.isoA2,
          countryIsoA3: countryDefinition.isoA3,
          countryName: label,
          metropolitanBounds: getCountryMetropolitanBounds(countryDefinition),
          antimeridianMode: shouldUnwrapRussiaAntimeridian(countryDefinition)
            ? "unwrap-east"
            : undefined,
          antimeridianWestThreshold: -120,
          hideAntimeridianSeam: shouldUnwrapRussiaAntimeridian(countryDefinition),
          strokeColor: "#111827",
          strokeOpacity: 0.96,
          strokeWeight: 1.15,
        },
      ],
    },
  };
}

function createCountryRegionsBasemap(
  countryDefinition: CountryBasemapDefinition,
): DromapBasemapConfig {
  const label = getFrenchCountryLabel(countryDefinition);
  const admin1DataUrl =
    countryDefinition.isoA3 === "RUS"
      ? NATURAL_EARTH_50M_ADMIN1_REGIONS_URL
      : NATURAL_EARTH_10M_ADMIN1_REGIONS_URL;

  return {
    id: `country-${countryDefinition.isoA3.toLowerCase()}-regions`,
    kind: "solid",
    label: `${label} + régions/États`,
    description: `Fond blanc avec ${label} et ses subdivisions quand elles sont disponibles dans Natural Earth.`,
    background: "#ffffff",
    exportBackground: "#ffffff",
    worldBackgroundBounds: shouldUnwrapRussiaAntimeridian(countryDefinition)
      ? ANTIMERIDIAN_EAST_BACKGROUND_BOUNDS
      : undefined,
    boundaryOverlay: {
      type: "pedagogical-boundaries",
      layers: [
        {
          kind: "admin1-regions",
          dataUrl: admin1DataUrl,
          countryIsoA2: countryDefinition.isoA2,
          countryIsoA3: countryDefinition.isoA3,
          countryName: label,
          metropolitanBounds: getCountryMetropolitanBounds(countryDefinition),
          antimeridianMode: shouldUnwrapRussiaAntimeridian(countryDefinition)
            ? "unwrap-east"
            : undefined,
          antimeridianWestThreshold: -120,
          hideAntimeridianSeam: shouldUnwrapRussiaAntimeridian(countryDefinition),
          strokeColor: "#111827",
          strokeOpacity: 0.54,
          strokeWeight: 0.48,
          boundaryRenderMode: "interior",
        },
        {
          kind: "admin1-regions",
          dataUrl: admin1DataUrl,
          countryIsoA2: countryDefinition.isoA2,
          countryIsoA3: countryDefinition.isoA3,
          countryName: label,
          metropolitanBounds: getCountryMetropolitanBounds(countryDefinition),
          antimeridianMode: shouldUnwrapRussiaAntimeridian(countryDefinition)
            ? "unwrap-east"
            : undefined,
          antimeridianWestThreshold: -120,
          hideAntimeridianSeam: shouldUnwrapRussiaAntimeridian(countryDefinition),
          strokeColor: "#111827",
          strokeOpacity: 0.98,
          strokeWeight: 1.15,
          boundaryRenderMode: "exterior",
        },
      ],
    },
  };
}

function getGeneratedCountryBasemaps() {
  const countries = CONTINENTS.flatMap(
    (continent) => continent.countries,
  ).filter((countryDefinition) => countryDefinition.isoA3 !== "FRA");

  return countries.flatMap((countryDefinition) => {
    const basemaps: DromapBasemapConfig[] = [
      createCountryBasemap(countryDefinition),
    ];

    if (countryHasAdmin1Regions(countryDefinition)) {
      basemaps.push(createCountryRegionsBasemap(countryDefinition));
    }

    return basemaps;
  });
}

function getGeneratedContinentBasemaps() {
  return CONTINENTS.map(createContinentBasemap);
}

function getCountryMenuItem(
  countryDefinition: CountryBasemapDefinition,
): DromapBasemapMenuItem {
  const countryLabel = getFrenchCountryLabel(countryDefinition);

  if (countryDefinition.isoA3 === "FRA") {
    return {
      type: "group",
      id: "country-france",
      label: "France",
      items: [
        { type: "basemap", basemapId: "france-outline", label: "France seule" },
        {
          type: "basemap",
          basemapId: "france-regions",
          label: "France + régions",
        },
        {
          type: "basemap",
          basemapId: "france-departments",
          label: "France + régions + départements",
        },
      ],
    };
  }

  if (!countryHasAdmin1Regions(countryDefinition)) {
    return {
      type: "basemap",
      basemapId: `country-${countryDefinition.isoA3.toLowerCase()}`,
      label: `${countryLabel} seul`,
    };
  }

  return {
    type: "group",
    id: `country-${countryDefinition.isoA3.toLowerCase()}`,
    label: countryLabel,
    items: [
      {
        type: "basemap",
        basemapId: `country-${countryDefinition.isoA3.toLowerCase()}`,
        label: "Pays seul",
      },
      {
        type: "basemap",
        basemapId: `country-${countryDefinition.isoA3.toLowerCase()}-regions`,
        label: "Régions / États",
      },
    ],
  };
}

function getContinentMenuItems(
  continent: ContinentBasemapDefinition,
): DromapBasemapMenuItem {
  const items: DromapBasemapMenuItem[] = [
    {
      type: "basemap",
      basemapId: `continent-${continent.id}`,
      label: continent.wholeLabel,
    },
  ];

  if (continent.countries.length > 0) {
    items.push({
      type: "group",
      id: `menu-continent-${continent.id}-countries`,
      label: "Pays",
      items: continent.countries.map(getCountryMenuItem),
    });
  }

  return {
    type: "group",
    id: `menu-continent-${continent.id}`,
    label: continent.label,
    items,
  };
}

export const DROMAP_BASEMAPS: DromapBasemapConfig[] = [
  ...STATIC_BASEMAPS,
  ...getGeneratedContinentBasemaps(),
  ...getGeneratedCountryBasemaps(),
];

export const DROMAP_BASEMAP_MENU_SECTIONS: DromapBasemapMenuSection[] = [
  {
    id: "classic",
    label: "Cartes classiques",
    description:
      "Fonds en ligne utiles pour dessiner sur une carte de référence.",
    items: [
      { type: "basemap", basemapId: "osm" },
      {
        type: "group",
        id: "openfreemap",
        label: "OpenFreeMap gratuit",
        description:
          "Fonds vectoriels gratuits, sans clé API. À privilégier pour les essais SaaS sans fournisseur payant.",
        defaultOpen: true,
        items: [
          { type: "basemap", basemapId: "openfreemap-liberty" },
          { type: "basemap", basemapId: "openfreemap-positron" },
          { type: "basemap", basemapId: "openfreemap-bright" },
        ],
      },
      { type: "basemap", basemapId: "carto-no-labels" },
      { type: "basemap", basemapId: "carto-light" },
      { type: "basemap", basemapId: "carto-voyager" },
      { type: "basemap", basemapId: "carto-voyager-no-labels" },
    ],
  },
  {
    id: "white-vector",
    label: "Fonds blancs",
    description:
      "Fonds vectoriels pédagogiques, sans villes ni routes, rangés par monde, continent et pays.",
    items: [
      {
        type: "group",
        id: "menu-world",
        label: "Monde",
        items: [
          { type: "basemap", basemapId: "blank-white" },
          { type: "basemap", basemapId: "white-borders-basic" },
          { type: "basemap", basemapId: "white-borders" },
        ],
      },
      ...CONTINENTS.map(getContinentMenuItems),
    ],
  },
];

export const DEFAULT_DROMAP_BASEMAP_ID: DromapBasemapId = "osm";

export function isDromapBasemapId(value: unknown): value is DromapBasemapId {
  return (
    typeof value === "string" &&
    DROMAP_BASEMAPS.some((basemap) => basemap.id === value)
  );
}

export function getDromapBasemapConfig(
  basemapId: DromapBasemapId,
): DromapBasemapConfig {
  return (
    DROMAP_BASEMAPS.find((basemap) => basemap.id === basemapId) ??
    DROMAP_BASEMAPS[0]
  );
}
