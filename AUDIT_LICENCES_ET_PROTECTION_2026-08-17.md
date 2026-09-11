# DroMap — audit licences, services tiers et protection du rendu

**Date : 17 août 2026**  
**Base examinée :** code fourni dans `node_modules.zip` + arbre `node_modules` fourni + documents DroMap du 6 et 14 août 2026.  
**Nature :** audit technique de conformité et de dépendances. Ce document ne remplace pas un avis juridique professionnel et ne peut pas garantir à lui seul la légalité dans toutes les juridictions.

## 1. Résultat exécutif

### État global

- **Inventaire logiciel : 384 couples paquet/version uniques** détectés dans l'arbre `node_modules` fourni.
- **0 paquet sans identifiant de licence dans les métadonnées inspectées.**
- Les textes de licence présents dans l'archive ont été consolidés dans `public/THIRD_PARTY_LICENSES.txt`.
- Un inventaire exploitable est fourni dans `public/dromap_dependency_licenses.csv`.
- Les actifs CDN explicitement chargés par DroMap mais non représentés comme racines distinctes dans le `node_modules` fourni ont été ajoutés au relevé : MapLibre GL JS 5.10.0, MapLibre GL Leaflet 0.1.3 et images Leaflet 1.9.4.

### Verdict de mise en production commerciale

**Je ne recommande pas de déclarer DroMap juridiquement “sans problème” dans son état actuel.** Deux points doivent être traités avant une mise à disposition commerciale au public :

1. **BLOQUANT — Google Gemini API et public mineur.** Les conditions Gemini API effectives au 23 mars 2026 imposent un âge de 18 ans minimum et interdisent l'utilisation du service dans un client dirigé vers, ou susceptible d'être utilisé par, des personnes de moins de 18 ans. DroMap vise explicitement notamment les lycéens. Dans l'EEE, la Suisse et le Royaume-Uni, un client exposé aux utilisateurs doit en outre utiliser les services payants. La combinaison “DroMap grand public/lycéens + Gemini API” est donc incompatible avec le cadrage produit actuel sans changement d'architecture ou de fournisseur IA.
2. **RISQUE CONTRACTUEL IMPORTANT — React Leaflet 5 / @react-leaflet/core 3.** Ces paquets sont sous **Hippocratic License 2.1**, licence éthique non standard. Elle impose notamment transmission de la licence/notice, conformité aux principes et lois de droits humains, mécanisme d'arbitrage et indemnisation dans certains cas. Le code DroMap contient actuellement **36 fichiers source** qui référencent React Leaflet : une migration n'est donc pas un micro-correctif, mais ce point doit être validé juridiquement ou planifié vers une couche Leaflet permissive avant lancement si l'objectif est un dossier de licences simple et classique.

## 2. Répartition des 384 dépendances détectées

| Licence déclarée | Nombre |
|---|---:|
| MIT | 322 |
| Apache-2.0 | 21 |
| ISC | 17 |
| BSD-2-Clause | 8 |
| MPL-2.0 | 3 |
| Hippocratic-2.1 | 2 |
| BSD-3-Clause | 2 |
| MIT OR Apache-2.0 | 1 |
| Apache-2.0 AND LGPL-3.0-or-later | 1 |
| Python-2.0 | 1 |
| CC-BY-4.0 | 1 |
| CC0-1.0 | 1 |
| BlueOak-1.0.0 | 1 |
| Unlicense | 1 |
| `BDS-3-Clause` (métadonnée du paquet `splaytree-ts`, vraisemblable faute de frappe pour BSD-3-Clause) | 1 |
| 0BSD | 1 |

### Dépendances à surveiller

- `react-leaflet@5.0.0` — Hippocratic-2.1.
- `@react-leaflet/core@3.0.0` — Hippocratic-2.1.
- `@img/sharp-win32-x64@0.34.5` — métadonnée `Apache-2.0 AND LGPL-3.0-or-later`; Sharp lui-même est Apache-2.0 et son écosystème binaire embarque libvips et bibliothèques sous licences compatibles. Pour un SaaS serveur classique, c'est surtout un sujet de conservation des notices ; pour une distribution on-premise/desktop, vérifier spécifiquement les obligations de redistribution LGPL.
- `axe-core` et `lightningcss*` — MPL-2.0 : conserver notices et, si des fichiers MPL eux-mêmes sont modifiés puis distribués, respecter le copyleft au niveau fichier.
- `caniuse-lite` — CC BY 4.0 : attribution/licence conservée dans le relevé tiers.

## 3. Sources cartographiques et données

### OpenFreeMap / OpenMapTiles / OpenStreetMap

**État : acceptable avec attribution.** OpenFreeMap autorise explicitement l'usage commercial et demande l'attribution. Le correctif conserve une attribution OpenFreeMap / OpenMapTiles / OSM sur la carte et dans l'export.

**Correctif supplémentaire :** les anciens identifiants de fonds CARTO et OSM direct restent reconnus pour compatibilité des anciens projets, mais **ne contactent plus `cartocdn.com` ni `tile.openstreetmap.org`**. Ils sont redirigés vers les styles OpenFreeMap compatibles.

### CARTO

**État avant correctif : risque commercial.** CARTO indique qu'un usage commercial de ses basemaps nécessite une licence Enterprise.  
**État après correctif :** aucune URL de tuile `cartocdn.com` active n'a été trouvée dans le code applicatif ; les anciens IDs CARTO sont conservés comme alias de compatibilité mais utilisent OpenFreeMap.

### Nominatim public OSM

**État : acceptable seulement pour usage modéré, avec garde-fous ; à remplacer pour montée en charge.** La politique publique impose notamment un maximum absolu de 1 requête/s par application, un User-Agent/Referer identifiable, attribution, cache, recherche déclenchée par l'utilisateur, capacité de changer de service et interdit l'autocomplétion client agressive.

**Correctifs appliqués :**
- URLs de recherche et reverse configurables par variables d'environnement ;
- User-Agent configurable ;
- e-mail de contact Nominatim configurable sur la recherche ;
- cadence existante > 1 s conservée ;
- enrichissement massif par Overpass public des noms de bâtiments **désactivé par défaut**, réactivable uniquement par `DROMAP_ENABLE_PUBLIC_OSM_NAME_ENRICHMENT=true`.

**Recommandation production :** avant audience importante ou clients payants, utiliser une instance propre ou un fournisseur géocodage avec SLA/conditions commerciales adaptées.

### Overture Buildings

**État : acceptable avec ODbL + attribution.** Le thème Buildings est publié sous ODbL en raison de l'intégration d'OpenStreetMap. Le correctif propage et exporte l'attribution `© OpenStreetMap contributors · Overture Maps Foundation` quand les données correspondantes sont utilisées.

### IGN / Géoplateforme

**État : acceptable pour les ressources actives identifiées.** Plan IGN, BD ORTHO et les principales données ouvertes IGN sont diffusés en open data / Licence Ouverte Etalab 2.0. DroMap conserve `© IGN` / Géoplateforme dans les crédits et exports concernés. Les conditions spécifiques d'un futur produit IGN différent devront être revalidées au moment de son ajout.

### geoBoundaries

**État : acceptable car le code utilise explicitement `gbOpen`.** L'API officielle indique que `gbOpen` est la variante adaptée à l'usage général avec attribution ; `gbAuthoritative` est non commercial. Le proxy DroMap est verrouillé sur `/api/current/gbOpen`.

**Correctif appliqué :** DroMap ne remplace plus systématiquement les métadonnées par une simple étiquette CC BY 4.0 ; il transporte désormais `boundaryLicense` et `boundarySource` renvoyés par la source dans le calque, puis les conserve lors des conversions et dans l'export.

### Natural Earth

**État : faible risque.** Natural Earth est publié dans le domaine public et libre pour tout type de projet. Le crédit reste présent dans le panneau, même s'il n'est pas juridiquement requis sur chaque export.

### france-geojson / IGN Admin Express COG

**État : acceptable.** Le dépôt indique que les tracés proviennent d'IGN Admin Express COG et renvoie à la Licence Ouverte. Attention : la version utilisée par ce dépôt est millésimée 2018 ; c'est surtout un sujet de fraîcheur des données, pas un blocage de licence.

### USGS Earthquake Hazards Program

**État : faible risque.** Les productions USGS sont généralement dans le domaine public américain, sous réserve d'éventuels éléments tiers explicitement signalés. Le catalogue DroMap conserve désormais la source et le crédit USGS dans les métadonnées de calque.

### NASA EONET

**État : désactivé par prudence dans ce correctif.** NASA explique que certains contenus qu'elle relaie peuvent appartenir à des tiers et que son propre droit d'utilisation ne transmet pas automatiquement ces droits aux réutilisateurs. EONET agrège des événements provenant de sources multiples. Tant que DroMap ne propage pas de façon fiable les conditions de chaque événement/source, les entrées EONET sont conservées dans le code mais exclues du catalogue actif (`NASA_EONET_CATALOG_ENABLED = false`).

### World Bank — World Development Indicators

**État : acceptable pour WDI avec attribution.** Le jeu WDI est CC BY 4.0, avec conditions additionnelles de la Banque mondiale. La source doit rester attribuée et les modifications/translations être signalées lorsque nécessaire. Ne pas étendre automatiquement cette conclusion à tous les contenus du site World Bank : vérifier la licence de chaque jeu futur.

### Wikidata / Wikipedia

- **Wikidata :** données structurées CC0 — faible risque pour la récupération de faits structurés.
- **Wikipedia :** texte sous CC BY-SA 4.0 (et selon les éditions, GFDL). Utiliser les articles comme sources factuelles avec lien est beaucoup plus simple que republier des passages substantiels. Si DroMap réutilise réellement du texte Wikipedia dans une sortie utilisateur, il faut assurer attribution, indication des modifications et obligations de partage à l'identique applicables.

## 4. Bibliothèques principales

| Composant | Licence/condition | État |
|---|---|---|
| Leaflet 1.9.4 | BSD-2-Clause | OK, notice conservée |
| Leaflet-Geoman Free 2.19.3 | MIT | OK, notice conservée |
| Tabler Icons | MIT | OK, notice conservée |
| MapLibre GL JS 5.10.0 (CDN) | BSD-3-Clause | OK, ajouté au relevé runtime |
| MapLibre GL Leaflet 0.1.3 (CDN) | ISC | OK, ajouté au relevé runtime |
| GeoArrow WASM | MIT OR Apache-2.0 | OK, notice conservée |
| React Leaflet 5 / core 3 | Hippocratic-2.1 | **À valider juridiquement / migration à planifier** |
| Google Gemini API | Conditions API | **BLOQUANT avec public susceptible d'être mineur** |

## 5. Correctif anti-superposition IA / Recherche de lieu

Le document de reprise exige que Assistant IA / Bâtiments / Recherche restent lisibles et non superposés. Le correctif remplace les décalages fixes fragiles par une mécanique structurelle :

1. **Dock produit unique en haut de la carte** (`ProductTopDock`) en `flex` + `flex-wrap` + `gap`, borné à droite par la largeur réelle de l'inspecteur.
2. `ExportControls` (donc Bâtiments), Recherche de lieu et Assistant IA sont placés dans ce dock en mode produit, au lieu d'avoir chacun leurs coordonnées fixes concurrentes.
3. **Exclusion mutuelle des grands panneaux :** ouvrir Recherche ferme l'IA ; ouvrir l'IA ferme Recherche, via événements `dromap:open-place-search` / `dromap:open-ai-assistant`.
4. Le mode historique non-produit conserve son positionnement précédent.

Ce mécanisme ne dépend plus d'un nombre arbitraire de pixels entre deux boutons, donc résiste beaucoup mieux aux changements de largeur d'inspecteur, de texte ou de fenêtre.

## 6. Attribution dans les exports et roundtrip

Correctifs appliqués :

- ajout aux sources DroMap de `sourceLabel`, `sourceUrl`, `sourceLicense`, `sourceAttribution`, `sourceVersion` ;
- conservation de ces champs lors de GeoJSON → objets DroMap → GeoJSON ;
- restauration des champs lors d'un import Projet DroMap ;
- collecte des crédits des calques GeoJSON visibles et objets convertis dans l'export ;
- ajout automatique des mentions connues Overture/OSM et IGN si des données anciennes n'ont pas encore les nouveaux champs ;
- rendu des crédits **après** les couches cartographiques dans le pipeline d'export pour éviter qu'une image de fond ne les recouvre.

## 7. Capture d'écran : ce qui est techniquement possible

### Ce qui est impossible à garantir dans une application Web

Une page Web **ne peut pas empêcher de façon fiable une capture d'écran**. Le système d'exploitation, l'outil de capture natif, l'enregistrement d'écran, les DevTools, un navigateur modifié, une machine distante ou simplement un appareil photo externe contournent tout JavaScript/CSS. Intercepter `PrintScreen`, désactiver le clic droit ou masquer au `blur` serait une protection cosmétique et donnerait un faux sentiment de sécurité.

### Protection correcte pour une carte payante

La règle de sécurité doit être : **ne jamais envoyer au navigateur d'un utilisateur non autorisé le rendu propre qu'il n'a pas acheté.**

Architecture recommandée :

1. contrôle d'entitlement/paiement **côté serveur** ;
2. preview gratuite rendue côté serveur en résolution réduite et avec watermark visible ;
3. watermark personnalisé (compte/commande/session) pour décourager les fuites ;
4. rendu HD/propre généré côté serveur uniquement après validation du droit ;
5. URLs d'export courtes durées/signées ;
6. aucune donnée source ou image HD propre dans le bundle/client tant que le droit n'est pas acquis.

### Pourquoi ce correctif ne simule pas un “anti-screenshot”

Le cahier produit fourni n'a **pas encore de modèle de paiement/abonnement/entitlement** : il distingue Invité / Connecté et autorise actuellement à l'invité un rendu final et un PNG Standard. Ajouter maintenant un faux blocage `PrintScreen` ne résoudrait pas le problème “sans payer” et introduirait une promesse de sécurité impossible à tenir.

La prochaine étape de protection, lorsque le modèle commercial est défini, doit donc être une **preview protégée + export propre server-side après paiement**, pas une interception clavier.

## 8. Fichiers modifiés ou ajoutés

- `app/api/dromap/buildings/route.ts`
- `app/api/dromap/buildings/reverse-names/route.ts`
- `app/api/dromap/place-search/route.ts`
- `app/editor/test/credits-panel.tsx`
- `app/editor/test/dromap-ai-panel.tsx`
- `app/editor/test/editor-surface.tsx`
- `app/editor/test/export-controls.tsx`
- `app/editor/test/export-download.ts`
- `app/editor/test/geojson-data-catalog.ts`
- `app/editor/test/geojson-layer-conversion.ts`
- `app/editor/test/geojson-library-browser.tsx`
- `app/editor/test/place-search-control.tsx`
- `components/dromap-product/restricted-ai-trigger.tsx`
- `lib/dromap/basemap.ts`
- `lib/dromap/credits.ts`
- `lib/dromap/feature.ts`
- `public/THIRD_PARTY_LICENSES.txt` (nouveau)
- `public/dromap_dependency_licenses.csv` (nouveau)

## 9. Validation technique effectuée

- Contrôle syntaxique TypeScript/TSX des **16 fichiers TS/TSX modifiés** avec TypeScript 5.9.3 : **aucun diagnostic de syntaxe**.
- Recherche statique : **aucune URL runtime `tile.openstreetmap.org`** dans `app/components/lib/stores`.
- Recherche statique : **aucune URL runtime `cartocdn.com`** ; seulement un commentaire de compatibilité.
- geoBoundaries : le proxy et le navigateur utilisent explicitement `gbOpen`.
- NASA EONET : catalogue actif désactivé par défaut.

### Validation non exécutable depuis l'archive fournie

Le ZIP fourni ne contient pas les fichiers racine nécessaires au build (`package.json`, `tsconfig.json`, lockfile). Je ne peux donc pas honnêtement annoncer les commandes de recette obligatoires comme validées :

```text
pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation
pnpm build
```

Après remplacement des fichiers dans le vrai projet local, exécuter ces deux commandes dans cet ordre, conformément au document de reprise.

## 10. Priorités avant lancement public

1. **Décider du sort de Gemini** : remplacer le fournisseur pour rester compatible avec un public lycéen/mineur, ou modifier réellement le public et l'architecture du client IA après avis juridique. Ne pas simplement ajouter une case “18+” si l'application reste elle-même susceptible d'être utilisée par des mineurs.
2. **Faire valider React Leaflet Hippocratic 2.1** par conseil juridique ou planifier une migration vers Leaflet direct/solution à licence permissive.
3. **Passer Nominatim public à un fournisseur/instance de production** avant volume commercial significatif.
4. **Définir paiement + entitlement server-side**, puis implémenter preview watermarked / export propre server-side ; ne pas investir dans une pseudo-protection `PrintScreen`.
5. Faire `tsc` + `pnpm build` dans le vrai dépôt, puis recette visuelle du dock IA/Recherche/Bâtiments à plusieurs largeurs d'écran.

## 11. Sources officielles principales vérifiées le 17 août 2026

- Google Gemini API Additional Terms: https://ai.google.dev/gemini-api/terms
- React Leaflet license: https://github.com/PaulLeCam/react-leaflet/blob/master/LICENSE.md
- OpenFreeMap attribution/commercial: https://openfreemap.org/
- CARTO basemaps FAQ: https://docs.carto.com/faqs/carto-basemaps
- OSMF Nominatim policy: https://operations.osmfoundation.org/policies/nominatim/
- OSMF Tile policy: https://operations.osmfoundation.org/policies/tiles/
- Overture attribution/licensing: https://docs.overturemaps.org/attribution/
- Overture Buildings: https://docs.overturemaps.org/guides/buildings/
- geoBoundaries API/licensing: https://www.geoboundaries.org/api.html
- IGN Géoplateforme: https://geoservices.ign.fr/
- Natural Earth Terms: https://www.naturalearthdata.com/about/terms-of-use/
- NASA media/data reuse guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- World Bank WDI: https://datacatalog.worldbank.org/search/dataset/0037712/world-development-indicators
- World Bank data licences: https://datacatalog.worldbank.org/public-licenses
- Wikimedia Terms: https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use
- Wikidata licensing: https://www.wikidata.org/wiki/Wikidata:Licensing
- france-geojson: https://github.com/gregoiredavid/france-geojson
- Sharp: https://sharp.pixelplumbing.com/
