# Audit de performances DroMap

Date : 16 août 2026  
Révision inspectée : 03a7a91  
Périmètre : éditeur cartographique, rendu final, bâtiments, GeoJSON, React/Zustand, Leaflet/Geoman, sauvegarde locale et synchronisation distante.

## 1. Résumé exécutif

L’éditeur présente trois risques structurels majeurs à l’échelle visée de 1 000 à 5 000 bâtiments :

1. Le rendu des objets DroMap effectue, pour chaque objet, un parcours complet des couches Leaflet afin de retrouver sa couche existante. À 5 000 objets et 5 000 couches seulement, cela représente 25 millions de visites par passe de rendu. Une micro-mesure synthétique du seul double parcours prend 47,5 à 88,1 ms ; le vrai parcours Leaflet, les mises à jour de géométrie, les styles et les couches dérivées s’ajoutent ensuite.
2. Un déplacement du corps d’un objet écrit dans le store à chaque événement de souris/drag. Chaque écriture remappe et renormalise la collection entière, puis réveille plusieurs abonnés qui rescannent ou rerendent les mêmes objets. Ce chemin peut donc déclencher la passe précédente plusieurs fois par seconde.
3. Les bâtiments et gros GeoJSON sont filtrés à l’échelle de la zone de travail, avec une marge de 22 %, mais jamais à l’échelle du viewport courant. Les couches hors écran restent créées. Le rendu final ouvre une seconde carte Leaflet sans démonter la carte d’édition et duplique alors les couches GeoJSON et DroMap.

Le mode « calque GeoJSON complet et verrouillé » est nettement moins coûteux que la conversion de milliers de bâtiments en objets DroMap : il utilise un seul pane, ne crée pas de hitboxes DroMap et désactive l’interactivité Leaflet. Il conserve néanmoins au moins une couche Leaflet par bâtiment, y compris hors viewport. La conversion de 5 000 bâtiments en objets DroMap entraîne au minimum 5 000 panes, 5 000 couches géométriques et, en mode sélection/édition, jusqu’à environ 65 000 enregistrements de handlers par couche principale : neuf handlers Geoman et quatre handlers de sélection par objet, sans compter les couches dérivées.

La persistance est l’autre source de risque important. Un jeu synthétique simple de 5 000 polygones DroMap occupe 5,37 Mo une fois sérialisé. Un seul structuredClone prend 89,8 à 134,7 ms dans l’environnement de mesure. L’historique peut conserver 75 instantanés complets, soit environ 402,9 Mo d’équivalent JSON pour ce jeu simple, avant même le surcoût réel des objets JavaScript. Après un geste, l’autosauvegarde clone encore l’état complet et l’écrit dans IndexedDB ; au seuil de synchronisation automatique, deux parcours de persistance complets peuvent se suivre.

Le build de production n’est pas disponible : la compilation Next.js aboutit, puis la vérification TypeScript échoue dans lib/dromap/geoman-sync.ts. Il n’a donc pas été possible de démarrer le serveur de production ni de produire des profils navigateur production. Les résultats runtime de ce rapport sont des micro-mesures des fonctions réelles du projet sous le serveur de développement, complétées par une analyse statique détaillée. Aucune mesure non exécutée n’est présentée comme réelle.

Aucune optimisation ni correction n’a été appliquée. L’instrumentation temporaire a été supprimée.

## 2. Configuration, commandes et limites

### Environnement

| Élément | Valeur |
|---|---|
| Système | Windows NT 10.0.26200.0 |
| PowerShell | 7.6.4 |
| Node.js | v24.15.0 |
| pnpm | 11.19.0 |
| Next.js | 16.2.6 |
| React | 19.2.4 |
| Leaflet | 1.9.4 |
| Zustand | 5.0.13 |
| TypeScript déclaré | ^5 ; lien local vers 5.9.3 |
| Révision Git | 03a7a91 |
| CPU et RAM | non exposés par le bac à sable Windows ; requêtes système refusées |

### Commandes obligatoires, exécutées avant l’audit

| Commande | Résultat |
|---|---|
| pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation | Échec immédiat : pnpm ne résout pas la commande tsc, bien que node_modules/.bin/tsc.cmd existe. |
| pnpm build | Compilation Next.js réussie en environ 86 s, puis échec de la vérification TypeScript. |

Le build signale lib/dromap/geoman-sync.ts:249 sur le handler pm:markerdrag. Une exécution diagnostique directe du binaire TypeScript local, avec incremental désactivé pour ne pas écrire d’état, confirme deux erreurs TS2769 aux lignes 249 et 250 : les callbacks GeomanVertexDragEvent ne sont pas assignables au type LeafletEventHandlerFn.

### Différence entre développement et production

Le build production ne peut pas être servi à cause de ces erreurs de type. Il est donc impossible de comparer honnêtement le coût d’hydratation, le FPS, le heap, les long tasks ou le nombre de nœuds DOM entre pnpm dev et next start.

Sous pnpm dev, une requête HTTP vers /editor/test a donné :

| Passage | Temps client HTTP | Décomposition serveur |
|---|---:|---|
| Premier passage | 16 470,7 ms | 13,6 s de compilation Next.js + 2,1 s de code applicatif |
| Passage chaud | 369,3 ms | 15 ms Next.js + 227 ms de code applicatif ; 242 ms côté serveur |

Ces nombres couvrent la réponse serveur, pas le rendu, l’hydratation ni Leaflet dans un navigateur.

### Limites d’instrumentation

- Le navigateur intégré requis pour les interactions locales n’a pas pu démarrer : EPERM lors de l’accès à C:\Users\asson\AppData dans son noyau d’exécution.
- Aucun navigateur de remplacement non autorisé n’a été utilisé.
- Aucun projet utilisateur, fixture GeoJSON, fichier .dromap ou jeu de bâtiments persistant n’existe dans le dépôt.
- Les nombres courants du store, du DOM, du heap et des listeners d’une session utilisateur sont donc indisponibles.
- Une route API temporaire, clairement dédiée à l’audit, a appelé les fonctions réelles du projet sur des données synthétiques en mémoire. Elle a été supprimée après trois passages. Aucune donnée n’a été persistée.
- React Profiler, Performance panel, FPS, long tasks, heap snapshots et comptage DOM réel n’ont pas pu être collectés.

### Échelle de gravité

- P0 : bloque ou menace directement l’usage cible à 5 000 objets ; risque de gel, d’interaction inutilisable ou de crash mémoire.
- P1 : ralentissement important et systématique, mais dépendant d’une action ou d’un volume précis.
- P2 : coût secondaire, conditionnel ou inférieur aux goulots principaux.

## 3. Méthodologie

L’analyse a couvert en priorité tous les fichiers demandés, puis les chemins directement appelés :

- rendu : test-map.tsx, features-store-renderer.tsx, features-style-sync.tsx, geojson-layers-renderer.tsx, selected-feature-map-interactions.tsx, selected-feature-highlight.tsx ;
- navigation : map-view-controller.tsx, workspace-mask-layer.tsx ;
- édition : drawing-tool-controller.tsx, geoman-sync.ts ;
- export : export-setup-panel.tsx, export-preview-scene.tsx, export-leaflet-preview.tsx ;
- données : les stores features, layers, selection, workspace, GeoJSON et produit ;
- bâtiments : export-controls.tsx, overture-buildings-client.ts, building-selection-modal.tsx ;
- persistance : project-autosave.tsx, editor-project-persistence.ts, project-thumbnail.ts, remote-projects.ts.

Les mesures synthétiques utilisent des polygones simples à cinq coordonnées, 1 000 puis 5 000 entités. Les durées ci-dessous sont les médianes de trois passages, suivies de la plage observée. Elles mesurent le code JavaScript métier sur le serveur Next.js de développement ; elles ne comprennent pas la création des objets Leaflet, le DOM, SVG, le style navigateur ou le rendu GPU.

## 4. Mesures obtenues

### 4.1 Données GeoJSON et DroMap

| Opération réelle du projet | 1 000 objets, médiane | 5 000 objets, médiane | Plage à 5 000 |
|---|---:|---:|---:|
| JSON.stringify du FeatureCollection source | 2,45 ms | 14,75 ms | 11,57–29,43 ms |
| Parse et normalisation GeoJSON initiale | 11,65 ms | 53,45 ms | 36,41–68,91 ms |
| Filtre zone de travail, cache froid | 2,19 ms | 15,69 ms | 4,62–18,18 ms |
| Même filtre, cache chaud | 0,023 ms | 0,039 ms | 0,035–0,041 ms |
| Filtre après simple changement d’identité du calque | 1,50 ms | 13,60 ms | 10,52–36,24 ms |
| Simplification intermédiaire, cache froid | 3,61 ms | 15,56 ms | 13,58–46,97 ms |
| Même simplification, cache chaud | 0,030 ms | 0,013 ms | 0,013–0,014 ms |
| Conversion GeoJSON vers objets DroMap | 9,49 ms | 65,93 ms | 31,55–69,38 ms |
| Calcul des objets DroMap rendables | 7,44 ms | 14,68 ms | 13,83–16,29 ms |
| structuredClone des objets DroMap | 25,65 ms | 91,36 ms | 89,83–134,66 ms |
| JSON.stringify des objets DroMap | 6,95 ms | 34,48 ms | 33,52–69,94 ms |
| Action store de changement de style GeoJSON | 0,46 ms | 0,93 ms | 0,49–4,55 ms |

La dernière ligne ne mesure que la mutation du store. Un changement de style global parcourt les entités et peut modifier l’identité de data ; GeoJsonLayersRenderer supprime alors la couche L.GeoJSON et recrée toutes les couches Leaflet. Ce coût navigateur n’a pas été mesuré et sera supérieur au coût du store.

Tailles du jeu synthétique :

| Volume | GeoJSON source | Objets DroMap sérialisés | 75 instantanés DroMap |
|---|---:|---:|---:|
| 1 000 | 258 744 octets | 1 071 490 octets | 80 361 750 octets |
| 5 000 | 1 298 984 octets | 5 371 730 octets | 402 879 750 octets |

La colonne « 75 instantanés » est un équivalent JSON, pas une mesure heap. Le heap réel peut être sensiblement plus grand à cause des objets, tableaux, chaînes et métadonnées du moteur JavaScript.

### 4.2 Recherche de couches et labels

| Mesure | Résultat |
|---|---:|
| Parcours complet par objet, 1 000 × 1 000 | 1 000 000 visites ; médiane 6,39 ms |
| Parcours complet par objet, 5 000 × 5 000 | 25 000 000 visites ; médiane 60,08 ms ; plage 47,49–88,06 ms |
| Placement de 500 labels | médiane 26,87 ms ; plage 16,44–52,73 ms |
| Placement de 1 000 labels | médiane 48,63 ms ; plage 43,46–171,29 ms |

La mesure de recherche ne fait que comparer des identifiants dans des tableaux. FeaturesStoreRenderer appelle map.eachLayer pour chaque objet, sans interrompre le parcours après une correspondance, puis met à jour les couches, labels, hitboxes, flèches, hachures et contours. La mesure est donc un plancher.

Le placement des labels additionne, pour chaque candidat, les intersections avec tous les rectangles de labels déjà placés et tous les obstacles marqueurs. La complexité est quadratique en nombre de labels, plus le produit labels × marqueurs.

## 5. Les 10 principaux ralentissements classés

### 1. Recherche quadratique et passe globale dans FeaturesStoreRenderer

- Gravité : P0.
- Fichiers : app/editor/test/features-store-renderer.tsx ; stores/editor-test-layers.ts.
- Composants/fonctions : FeaturesStoreRenderer, renderAtCurrentZoom, findLayerByFeatureId, getRenderableFeaturesForLayers.
- Cause : chaque changement de features, layers, sélection, outil, workspace ou réglage de labels reconstruit les listes, crée ou met à jour un pane par objet, puis appelle map.eachLayer pour chaque objet. La recherche ne s’arrête pas après avoir trouvé la couche.
- Preuve/mesure : lignes 995–1 108 et 1 165–1 194 de FeaturesStoreRenderer. 25 millions de visites et 47,5–88,1 ms pour la seule boucle synthétique à 5 000 objets. Le coût Leaflet et les couches dérivées ne sont pas inclus.
- Impact utilisateur : sélection lente, zoom qui saccade, fin de pan coûteuse, délai visible après toute modification, amplification extrême pendant un drag.
- Correction minimale proposée : maintenir un index stable featureId → couche Leaflet dans un ref, séparer les effets géométrie/style/labels/sélection et ne déclencher la passe géométrique que lorsque ses entrées changent.
- Risque de régression : index désynchronisé après suppression, remplacement ou restauration ; ordre de rendu et WYSIWYG à tester.

### 2. Écriture du store à chaque événement de déplacement du corps

- Gravité : P0.
- Fichiers : app/editor/test/drawing-tool-controller.tsx ; lib/dromap/geoman-sync.ts ; stores/editor-test-features.ts.
- Composants/fonctions : bindManualBodyDrag, syncLayerGeometryToStore, onDrag, updateFeature.
- Cause : mousemove et pm:drag écrivent immédiatement la géométrie dans Zustand. updateFeature remappe et renormalise toute la collection, puis les abonnés larges relancent leurs calculs.
- Preuve/mesure : drawing-tool-controller.tsx:609 et geoman-sync.ts:227–229 ; editor-test-features.ts:309–318. Un seul clone de 5 000 objets simples coûte déjà 89,8–134,7 ms ; chaque écriture déclenche en plus le ralentissement numéro 1.
- Impact utilisateur : déplacement d’objet non fluide, poignée qui retarde, thread principal saturé, autosauvegarde continuellement repoussée.
- Correction minimale proposée : laisser Leaflet afficher la géométrie transitoire, publier au store au plus une fois par frame ou à la fin du geste, avec un état de preview séparé si les autres vues doivent suivre.
- Risque de régression : synchronicité des labels, flèches, inspecteur, undo et autosauvegarde pendant le geste.
- Point positif observé : le déplacement d’un sommet Geoman utilise déjà une preview sans réécrire le store à chaque pixel ; la géométrie est synchronisée à markerdragend.

### 3. Absence de culling viewport et duplication dans le rendu final

- Gravité : P0.
- Fichiers : lib/dromap/workspace-object-loading.ts ; app/editor/test/geojson-layers-renderer.tsx ; app/editor/test/features-store-renderer.tsx ; app/editor/test/export-leaflet-preview.tsx.
- Composants/fonctions : isDromapFeatureLoadedInWorkspace, getGeoJsonLayerLoadedDisplayData, GeoJsonLayersRenderer, ExportFeatureLayers.
- Cause : les données sont filtrées par la zone de travail avec 22 % de marge, pas par les limites visibles de la carte. Tous les objets chargés restent des couches Leaflet hors écran. Le rendu final monte une deuxième MapContainer et y recrée les mêmes données alors que la carte éditeur reste montée.
- Preuve/mesure : workspace-object-loading.ts:11 ; GeoJsonLayersRenderer ne dépend d’aucun événement de viewport ; export-leaflet-preview.tsx:921–996 inclut une deuxième carte, GeoJsonLayersRenderer et ExportFeatureLayers.
- Impact utilisateur : mémoire et DOM proportionnels au projet entier, zoom/pan Leaflet plus lourds, pic de mémoire à l’ouverture du rendu final, risque de gel avec des bâtiments convertis.
- Correction minimale proposée : culling viewport avec marge dans l’éditeur seulement, conservation explicite de l’objet sélectionné, et rendu complet séparé pour l’export ; évaluer Canvas ou un renderer partagé pour les bâtiments.
- Risque de régression : objets qui apparaissent tard, sélection hors écran, cadrage, labels et stricte identité WYSIWYG entre éditeur et export.

### 4. Historique constitué d’instantanés complets

- Gravité : P1.
- Fichier : stores/editor-test-features.ts.
- Fonctions : cloneFeatures, appendHistory, updateFeatureWithHistory, commitFeaturesHistory.
- Cause : structuredClone copie toute la collection de features pour chaque entrée d’historique ; 75 entrées sont conservées.
- Preuve/mesure : lignes 26, 71–89 et 131–136. Sur 5 000 polygones simples, un clone prend 89,8–134,7 ms et 75 copies représentent environ 402,9 Mo d’équivalent JSON.
- Impact utilisateur : pauses lors du premier mouvement ou d’une action historisée, pression mémoire, garbage collection, possible fermeture d’onglet sur gros projets convertis.
- Correction minimale proposée : stocker des patches inversables ou des snapshots structurellement partagés par geste, tout en conservant exactement la sémantique undo/redo.
- Risque de régression : historique incomplet, ordre des objets, restauration du workspace et compatibilité des anciens projets.

### 5. Clonages et écritures répétées de la persistance

- Gravité : P1.
- Fichiers : components/dromap-product/project-autosave.tsx ; lib/dromap/editor-project-persistence.ts ; stores/dromap-product.ts ; lib/dromap/remote-projects.ts.
- Fonctions : checkpointCurrentEditor, createDromapEditorProjectSnapshot, checkpointProjectSnapshot, persistStateDurably, writeProjectCache, encodeProject.
- Cause : 500 ms après un geste, un snapshot complet est créé synchroniquement. Le store le clone, writeProjectCache clone encore le projet, puis IndexedDB effectue sa propre copie structurée. Au cinquième changement, le checkpoint puis la sauvegarde automatique peuvent persister successivement le même snapshot. La synchronisation distante fait JSON.stringify du projet complet, encode, compresse puis convertit en base64.
- Preuve/mesure : project-autosave.tsx:221–260 ; editor-project-persistence.ts:564–599 ; dromap-product.ts:408–432 et 1 727–1 776 ; remote-projects.ts:117–159. structuredClone de 5 000 objets simples : médiane 91,36 ms.
- Impact utilisateur : long task peu après une interaction, saccade récurrente, forte allocation mémoire, retour rendu → éditeur perturbé par une sauvegarde lancée en arrière-plan mais préparée sur le thread principal.
- Correction minimale proposée : créer un snapshot immuable une seule fois, éviter les clones et écritures doublons, coalescer les demandes de persistance, puis déplacer sérialisation/compression dans un Worker.
- Risque de régression : perte de durabilité, ordre de sauvegarde, conflits distants, navigation avant fin d’écriture.

### 6. GeoJSON retraité ou recréé à l’échelle du calque

- Gravité : P1.
- Fichiers : stores/editor-test-geojson-layers.ts ; app/editor/test/geojson-layers-renderer.tsx.
- Fonctions : getGeoJsonLayerDisplayData, getGeoJsonLayerLoadedDisplayData, updateGeoJsonLayerStyle, applyLeafletGeoJsonLayerStyle, createLeafletGeoJsonLayer.
- Cause : les caches WeakMap sont indexés par l’objet calque. Un changement de métadonnée crée une nouvelle identité et invalide au moins le filtre workspace. Un changement de style global parcourt toutes les features ; s’il modifie data, la couche Leaflet entière est supprimée et recréée. Un changement d’opacité réutilise la couche, mais restyle chaque enfant.
- Preuve/mesure : caches aux lignes 792 et 854 ; filtre aux lignes 880–885 ; rendu aux lignes 199–251 ; action de style aux lignes 1 518–1 540. À 5 000 objets, filtre froid médian 15,69 ms, filtre chaud 0,039 ms, puis 13,60 ms après changement d’identité.
- Impact utilisateur : délai sur précision, style, visibilité et verrouillage ; recréation de milliers d’objets Leaflet ; allocation et garbage collection.
- Correction minimale proposée : indexer les caches par identité de data + précision + workspace, distinguer style global et overrides par feature, et ne recréer la géométrie que si data ou précision changent réellement.
- Risque de régression : styles individuels, ordre des calques, verrouillage interactif, précision des bâtiments.

### 7. Placement et recréation quadratiques des labels

- Gravité : P1.
- Fichiers : app/editor/test/feature-map-labels.ts ; app/editor/test/features-store-renderer.tsx ; app/editor/test/export-leaflet-preview.tsx.
- Fonctions : createFeatureMapLabelScreenLayouts, syncFeatureMapLabelLayers, ExportFeatureLayers.
- Cause : chaque candidat de label est comparé à tous les labels déjà placés et à tous les marqueurs. FeaturesStoreRenderer supprime puis recrée les labels lors de chaque passe de rendu ; l’export refait le même calcul.
- Preuve/mesure : feature-map-labels.ts:755–930 ; 1 000 labels synthétiques prennent 43,5–171,3 ms. La structure des réductions établit un coût O(labels² + labels × marqueurs).
- Impact utilisateur : zoom, resize, sélection ou changement de label lent dans les projets riches en noms ; ouverture du rendu final plus longue.
- Correction minimale proposée : index spatial en grille/R-tree pour les collisions, cache des mesures de texte, et mise à jour uniquement des labels affectés.
- Risque de régression : positions différentes, chevauchements nouveaux et divergence WYSIWYG éditeur/export.

### 8. Nombre de handlers et balayages d’interaction proportionnels aux couches

- Gravité : P1.
- Fichiers : lib/dromap/geoman-sync.ts ; app/editor/test/selected-feature-map-interactions.tsx ; app/editor/test/drawing-tool-controller.tsx.
- Fonctions : bindLayerGeomanEvents, bindAllLayers, enableSelectedLayersEdit.
- Cause : neuf événements Geoman sont liés à chaque couche DroMap dès sa création, même si l’objet est geometryLocked. En mode sélection/édition, quatre événements supplémentaires sont liés à chaque couche DroMap et hitbox. Le binding global rescane les couches immédiatement, à la frame suivante et après 40, 120, 350 et 800 ms.
- Preuve/mesure : geoman-sync.ts:245–253 ; selected-feature-map-interactions.tsx:254–332. Pour 5 000 polygones DroMap, jusqu’à 45 000 handlers Geoman + 20 000 handlers de sélection sont enregistrés, soit environ 65 000, sans compter les handlers de carte.
- Impact utilisateur : temps d’entrée dans l’outil, mémoire, coût de teardown/rebind lors d’un changement de mode ou de multisélection.
- Correction minimale proposée : lier Geoman lors de l’activation réelle de l’objet sélectionné, utiliser une stratégie d’événements délégués ou un registre unique, et remplacer les balayages temporisés par l’enregistrement synchrone au moment de la création.
- Risque de régression : clics perdus sur couches créées tard, double-clic texte, drag et compatibilité avec les hitboxes.
- Point positif observé : Geoman n’est activé pour l’édition que sur les objets sélectionnés ; aucun enable global de 5 000 géométries n’a été trouvé. Les cleanups de listeners prioritaires sont présents.

### 9. Abonnements React/Zustand larges et travail de panneaux cachés

- Gravité : P1.
- Fichiers : app/editor/test/export-setup-panel.tsx ; app/editor/test/features-style-sync.tsx ; components/dromap-product/editor-inspector.tsx ; app/editor/test/layers-panel.tsx ; app/editor/test/selected-feature-highlight.tsx.
- Composants : ExportSetupPanel, FeaturesStyleSync, DromapEditorInspector, LayersPanel, SelectedFeatureHighlight.
- Cause : de nombreux composants s’abonnent au tableau complet features, layers ou geoJsonLayers. ExportSetupPanel exécute tous ses hooks et recalcule les données rendables avant de retourner null quand il est fermé. FeaturesStyleSync parcourt encore toutes les couches après FeaturesStoreRenderer pour réappliquer les styles.
- Preuve/mesure : ExportSetupPanel s’abonne aux features à la ligne 530, calcule renderableFeatures aux lignes 550–554 et ne retourne null qu’aux lignes 646–647. FeaturesStyleSync parcourt map.eachLayer aux lignes 139–165. Une recherche statique trouve 28 abonnements directs aux tableaux complets features/layers/GeoJSON dans app et components.
- Impact utilisateur : un drag ou changement de style rerend des panneaux invisibles, reconstruit des tableaux et répète des recherches ; l’inspecteur replié reste abonné aux features uniquement pour afficher le compteur.
- Correction minimale proposée : wrapper conditionnel qui ne monte le contenu export qu’à l’ouverture, sélecteurs de compteurs/objets ciblés, séparation des listes lourdes et suppression du deuxième passage de style si le renderer principal garantit le style.
- Risque de régression : panneau obsolète à l’ouverture, compteur incorrect, style de marqueur personnalisé non rafraîchi.

### 10. Pipeline d’import bâtiments avec chaînes et clones complets

- Gravité : P1.
- Fichiers : app/editor/test/overture-buildings-client.ts ; app/editor/test/export-controls.tsx ; app/editor/test/building-selection-modal.tsx.
- Fonctions : downloadOvertureBuildings, enrichBuildingNamesFromOverturePlaces, createBuildingsGeoJsonLayer, BuildingSelectionMapLayer.
- Cause : GeoArrow convertit le reader en une chaîne GeoJSON ensuite parsée sur le thread principal. L’enrichissement clone toutes les features puis peut lire un deuxième dataset Parquet Places. L’import final sérialise à nouveau le FeatureCollection et le reparcourt avec parseGeoJsonTextToDromapGeoJsonLayer. Dans la modale, chaque clic de sélection restyle toutes les couches bâtiments.
- Preuve/mesure : overture-buildings-client.ts:603–627, 1 051–1 085 ; export-controls.tsx:661–670 et 729–730 ; building-selection-modal.tsx:247–333. Pour 5 000 polygones synthétiques : stringify source médian 14,75 ms, parse/normalisation médian 53,45 ms ; ces coûts s’ajoutent au décodage GeoArrow et au réseau.
- Impact utilisateur : pause après téléchargement, mémoire temporaire élevée, sélection de bâtiments de plus en plus lente, double coût pour IGN car l’enrichissement Places Overture est encore tenté si des noms manquent.
- Correction minimale proposée : accepter directement un FeatureCollection déjà normalisé, déplacer décodage/normalisation vers un Worker, éviter le clone intégral quand aucun nom ne change, et mettre à jour uniquement les anciens/nouveaux bâtiments sélectionnés dans la modale.
- Risque de régression : provenance/licence, noms enrichis, annulation AbortSignal, exactitude des identifiants et propriétés.

## 6. Point particulier : bâtiments

### 6.1 Comptages disponibles

Le dépôt ne contient aucune donnée utilisateur ou fixture permettant de donner le nombre actuel de bâtiments d’un vrai projet. Le navigateur intégré n’ayant pas démarré, le store vivant et le DOM ne sont pas accessibles. Le nombre actuel est donc : non mesuré.

Les relations exactes déduites du code sont :

| Mode | Dans le store | Couches Leaflet minimales | Hors viewport | Hitboxes/interactions |
|---|---:|---:|---|---|
| Calque GeoJSON complet, verrouillé | N features dans geoJsonLayers[i].data.features | 1 L.GeoJSON parent + N couches enfants pour N Polygon/MultiPolygon | Toutes les features chargées mais hors viewport restent créées | 0 hitbox DroMap ; interactive:false ; pas de handlers de sélection DroMap ni Geoman |
| Bâtiments sélectionnés convertis en DroMap | N features dans editor-test-features | N couches géométriques + N panes, avant labels/hachures/contours | Tous les objets dans workspace + marge restent créés | Pas de hitbox transparente supplémentaire pour les polygones ; couche polygonale interactive ; jusqu’à 13 handlers par couche principale en sélection/édition |
| Modale de sélection bâtiments | N features locales au composant | 1 L.GeoJSON + N couches enfants sur un renderer Canvas | Toutes restent dans la couche Canvas | Un handler click et un tooltip par bâtiment ; chaque changement de sélection parcourt les N couches |

Pour 1 000 et 5 000 bâtiments complets, le minimum est donc respectivement 1 001 et 5 001 objets Leaflet dans le groupe GeoJSON. Pour 5 000 bâtiments convertis, le minimum est 5 000 panes + 5 000 couches géométriques. Leaflet crée normalement un renderer par pane ; le DOM réel doit être confirmé dans un navigateur, mais cette architecture peut conduire à des milliers de conteneurs SVG distincts.

### 6.2 Rendu réel et culling

- getGeoJsonLayerLoadedDisplayData conserve les entités qui croisent la zone de travail agrandie de 22 %.
- Les imports bâtiments sont demandés sur la zone de travail ; la grande majorité, voire la totalité, reste donc chargée.
- Aucun test contre map.getBounds n’existe dans GeoJsonLayersRenderer ou FeaturesStoreRenderer.
- Nombre hors viewport = nombre chargé − nombre croisant le viewport. Ce nombre n’est jamais calculé et peut approcher N lors d’un zoom fort.
- Le masque de workspace est visuel. Il dessine quatre bandes ou rectangles et ne retire aucune couche. Il n’améliore donc ni le nombre de bâtiments, ni le DOM, ni le nombre de listeners.

### 6.3 Coûts par action

- Pan, calque GeoJSON complet : le composant React ne reconstruit pas le L.GeoJSON, mais Leaflet conserve toutes les géométries ; les tuiles et le renderer sont déplacés/mis à jour. Coût navigateur non mesuré.
- Zoom, calque GeoJSON complet : Leaflet doit reprojeter les couches géométriques existantes ; aucune simplification bâtiment n’est appliquée par choix de précision.
- Pan/zoom, bâtiments DroMap : à moveend/zoomend, FeaturesStoreRenderer relance la passe globale, les labels et les couches dérivées.
- Sélection d’un bâtiment DroMap : selectedFeatureId est une dépendance de FeaturesStoreRenderer ; une simple sélection relance toute la passe.
- Changement d’opacité GeoJSON : la géométrie Leaflet est réutilisée, mais le filtre workspace est recalculé à cause de la nouvelle identité du calque et chaque enfant est restylé.
- Changement de style GeoJSON : toutes les features du store sont parcourues ; si data change, tout le L.GeoJSON est recréé.
- Changement de style d’un bâtiment DroMap : une seule feature est modifiée logiquement, mais tout le tableau est remplacé et le renderer principal traite tous les objets.

### 6.4 Conclusion bâtiments

Le mode complet/verrouillé est le seul mode actuellement plausible à 5 000 bâtiments, mais il reste O(N) en couches Leaflet et sans culling viewport. La conversion de milliers de bâtiments en objets DroMap franchit plusieurs seuils dangereux simultanément : panes par objet, parcours quadratique, handlers par objet, historique complet, autosauvegarde complète et duplication dans le rendu final.

## 7. Point particulier : GeoJSON

### Création initiale

parseGeoJsonTextToDromapGeoJsonLayer fait JSON.parse, aplatit, assigne des identifiants, compte les coordonnées, calcule les bornes et déduit un style. Médiane : 11,65 ms à 1 000 objets et 53,45 ms à 5 000 objets synthétiques, hors création Leaflet.

### Simplification et changement de précision

- La simplification est mise en cache par objet calque.
- Cache chaud : environ 0,013 ms à 5 000 objets.
- Cache froid intermédiaire : médiane 15,56 ms, plage 13,58–46,97 ms.
- Un changement de précision crée un nouvel objet calque et force un nouveau calcul et une recréation Leaflet.
- Revenir à une précision déjà utilisée ne réutilise pas l’ancien résultat, car le WeakMap est indexé par l’ancienne identité.
- Les calques bâtiments IGN/Overture retournent toujours les données originales et contournent la simplification, afin de préserver les angles.

### Pan et zoom

GeoJsonLayersRenderer n’est pas abonné aux mouvements de carte. Le filtre workspace n’est donc pas recalculé pendant le pan/zoom. C’est positif pour le CPU React, mais cela signifie aussi qu’aucun culling viewport n’est effectué et que Leaflet conserve toutes les couches.

### Style, opacité, verrouillage et visibilité

- Opacité/verrouillage : nouvelle identité de calque, filtre workspace recalculé ; si data et précision sont identiques, la couche Leaflet est réutilisée et tous ses enfants sont restylés.
- Style global : parcours de toutes les features ; une modification de data déclenche suppression et recréation de toute la couche Leaflet.
- Visibilité off : suppression de la couche complète.
- Visibilité on : recalcul du filtre et reconstruction de la couche complète.
- Les cleanups de GeoJsonLayersRenderer retirent bien les couches connues.

### Conversion vers DroMap

La conversion flatMap toutes les features et éclate les Multi*. Médiane : 9,49 ms à 1 000 et 65,93 ms à 5 000. Ce coût ponctuel est inférieur au coût durable de la représentation résultante : rendu par objet, panes, interactions, historique et persistance.

### Calculs répétés

Le cache chaud est efficace. Les répétitions inutiles proviennent surtout de l’identité du calque qui change pour des métadonnées, de getGeoJsonLayerLoadedDisplayData appelé dans le filtre puis lors de la création, et des reconstructions Leaflet déclenchées par data/précision. Le second appel immédiat est généralement un cache hit et n’est pas le goulot principal.

## 8. Matrice des scénarios A à P

| Scénario | Statut | Chemin observé ou attendu | Conclusion |
|---|---|---|---|
| A. Projet léger avec quelques objets | Partiel | Route éditeur dev : 16,47 s à froid, 369 ms à chaud, sans hydratation navigateur | La compilation domine le froid ; aucune alerte algorithmique à petit N, mais le build production manque. |
| B. Environ 1 000 bâtiments | Synthétique + statique | Parse 11,65 ms ; clone DroMap 25,65 ms ; 1 million de visites de recherche | Calque complet probablement utilisable ; conversion DroMap commence déjà à multiplier panes/listeners. |
| C. Environ 5 000 bâtiments | Synthétique + statique | Parse 53,45 ms ; clone 91,36 ms ; 25 millions de visites ; 5,37 Mo DroMap sérialisé | Risque P0 si converti en DroMap ; calque complet reste O(5 000) couches sans culling. |
| D. Gros calque GeoJSON | Synthétique + statique | Cache chaud efficace ; style/précision/visibilité agissent à l’échelle du calque | Les reconstructions Leaflet sont le coût à profiler en priorité dès que le build fonctionne. |
| E. Déplacement continu de la carte | Statique | MapViewController coalesce la contrainte par requestAnimationFrame ; masque O(1) ; FeaturesStoreRenderer travaille à moveend | Contrôleurs de navigation corrects ; fin de pan DroMap et tuiles keepBuffer restent les risques. |
| F. Zoom/dézoom répété | Statique | FeaturesStoreRenderer et labels à chaque zoomend ; Leaflet reprojette le GeoJSON ; TileLayer updateWhenZooming | Risque de jank proportionnel aux objets et labels. |
| G. Sélection d’un objet | Statique | selectedFeatureId relance FeaturesStoreRenderer ; highlight rescane les couches | Travail global injustifié pour une sélection unitaire. |
| H. Sélection d’un trait | Statique | Une hitbox transparente par LineString en select/edit ; quatre handlers sur trait et hitbox | Deux couches interactives et jusqu’à huit handlers de sélection par trait, plus Geoman. |
| I. Déplacement d’un objet | Statique | updateFeature à chaque mousemove/pm:drag ; une entrée d’historique au début | Chemin P0 : cascade store → React → Leaflet répétée pendant le geste. |
| J. Modification géométrique d’un trait avec Geoman | Statique | markerdrag publie une preview ; store seulement à markerdragend ; flèche dérivée recréée pour la preview | Mieux maîtrisé que le drag du corps ; coût Geoman/preview à mesurer en navigateur. |
| K. Modification géométrique d’une zone | Statique | Même stratégie markerdrag sans écriture store par pixel ; mise à jour finale | Pas de tempête store évidente pendant le sommet ; coût des handles non mesuré. |
| L. Ouverture de l’inspecteur | Statique | L’inspecteur produit est déjà monté ; abonnement au tableau features même replié ; LegendPanel dépend du mode | Coût React permanent plus qu’un coût d’ouverture isolé. |
| M. Ouverture du rendu final | Statique | L’éditeur reste monté ; deuxième MapContainer ; données GeoJSON et DroMap dupliquées | Pic mémoire et CPU P0/P1 selon volume. |
| N. Retour rendu final vers éditeur | Statique | La deuxième carte est démontée ; l’éditeur n’est pas remonté ; saveNow automatic lancé sans bloquer visuellement | Bon choix de navigation, mais snapshot/persistance peut provoquer une pause peu après le retour. |
| O. Sauvegarde et synchronisation | Synthétique + statique | Snapshot, clones, IndexedDB, puis JSON/compression/base64 et chunks réseau au besoin | Long tasks et allocations probables ; réseau limité à deux chunks parallèles. |
| P. Dashboard puis projet depuis cache local | Statique | Cache IndexedDB lu avant le réseau si révision compatible ; applyCached réécrit immédiatement le cache puis persistState réécrit les projets chargés | Cache-first positif, mais écritures locales redondantes et restauration avec nouveaux clones. |

## 9. React et Zustand

### Abonnements trop larges

- FeaturesStoreRenderer, FeaturesStyleSync, ExportSetupPanel, inspector, panneau de calques, highlight, actions et contrôles de sauvegarde s’abonnent au tableau features complet.
- Toute mise à jour d’une seule feature remplace le tableau et réveille ces composants.
- Les signatures calculées par map/join dans DrawingToolController évitent certains rerenders si la signature reste égale, mais le sélecteur lui-même parcourt toutes les features à chaque notification du store.
- ExportPreviewScene utilise de nombreux sélecteurs scalaires, ce qui est préférable à un objet global, mais le composant de 4 600 lignes rerend dès que l’un de ces nombreux champs change.

### Travail dupliqué

- FeaturesStoreRenderer met à jour géométrie et style.
- FeaturesStyleSync reconstruit ensuite une Map des features, rescane map.eachLayer et réapplique les styles.
- ExportSetupPanel calcule renderableFeatures et renderableGeoJsonLayers même fermé.
- SelectedFeatureHighlight convertit les couches en tableau puis fait plusieurs find par sélection.
- getRenderableFeaturesForLayers recherche le calque par Array.find lors du filtre, du tri et du map final ; un index layerId → layer éviterait ces répétitions.

### Allocations

- scaleFeatureForVisualZoom crée des copies d’affichage pour toutes les features à chaque passe.
- getRenderableFeaturesForLayers recrée feature et properties pour appliquer layerRenderOrder et l’opacité.
- isDromapFeatureLoadedInWorkspace recalcule les bornes de chargement et collecte les coordonnées pour chaque feature à chaque appel.
- Les couches labels, flèches, hachures et contours sont supprimées puis recréées globalement.

## 10. Leaflet et Geoman

### Couches et panes

- Un pane est créé par feature DroMap et n’est pas supprimé quand la feature disparaît. Les couches disparaissent, mais les éléments de pane peuvent rester attachés à la carte jusqu’au démontage.
- Une hitbox LineString transparente est recréée pour chaque trait en outils select/edit, sans test viewport.
- Les hachures, contours alignés, flèches et labels sont des couches supplémentaires.
- GeoJSON complet utilise un pane par calque, mais une couche Leaflet enfant par feature.
- Le rendu final recrée toutes les features dans un layerGroup après clearLayers à chaque moveend/zoomend/resize.

### Listeners

- Les effets prioritaires retirent correctement leurs listeners et timers ; aucun doublon permanent certain n’a été démontré.
- bindLayerGeomanEvents protège contre le double binding avec dromapGeomanEventsBound.
- Cependant, les neuf handlers restent attachés à toutes les couches DroMap, même non éditables.
- SelectedFeatureMapInteractions démonte/recrée ses bindings sur changement de mode, outil, signature de calques ou multisélection et effectue plusieurs rescans temporisés.

### Geoman

- Seuls les objets sélectionnés reçoivent enableLayerEdit. C’est un non-problème important : Geoman n’est pas activé globalement.
- Les features freehand, traced, quick shape, boundary fill et geometryLocked sont exclues de l’édition géométrique.
- Le vertex drag évite l’écriture store par pixel ; le body drag ne l’évite pas.

### Navigation et masque

- MapViewController coalesce les contraintes de drag/resize/zoom avec requestAnimationFrame et nettoie ses listeners.
- WorkspaceMaskLayer monde fait deux projections et quatre écritures de rectangles par événement, soit un coût constant.
- Le masque non monde dessine quatre grands rectangles. Aucun signal ne justifie de l’optimiser avant les goulots P0.
- TileLayer utilise keepBuffer=6, updateWhenZooming et updateWhenIdle=false. Ce choix augmente le nombre de tuiles conservées et les requêtes pendant les gestes ; il est classé P2 faute de mesure réseau/navigateur.

## 11. Réseau, cache local et Supabase

### Projets et synchronisation

- L’ouverture d’un projet utilise IndexedDB avant le réseau lorsque la révision du cache correspond à la révision connue. C’est un comportement favorable.
- applyCached appelle néanmoins writeProjectCache sur le projet qui vient d’être lu, puis persistState, qui réécrit chaque projet dont le contenu est chargé.
- persistState est souvent planifié par queueMicrotask sans mécanisme global de coalescence ; plusieurs mutations rapprochées peuvent donc programmer plusieurs persistances.
- La synchronisation distante envoie le projet complet sous forme gzip-base64 découpée, avec deux chunks maximum en parallèle. Le nombre d’appels dépend de la taille compressée.
- Les changements de métadonnées disposent d’un PATCH dédié et n’exigent pas la réécriture des gros chunks, ce qui est positif.
- Aucune boucle de requêtes Supabase manifestement infinie ou appel réseau à chaque pixel n’a été trouvé.
- JSON.stringify, TextEncoder, base64ToBytes/bytesToBase64 et JSON.parse restent sur le thread principal ; CompressionStream est asynchrone, mais la préparation et la finalisation ne le sont pas entièrement.

### Bâtiments Overture/IGN

- Le catalogue Overture est mémorisé par une Promise de module, limitant les relectures du manifeste pendant la session.
- Les empreintes et les Places sont deux lectures Parquet distinctes.
- L’enrichissement Places n’est lancé que s’il existe au moins un bâtiment sans nom, mais il clone d’abord toutes les features.
- Pour une source IGN contenant des bâtiments sans nom, la deuxième lecture Overture Places est tout de même tentée ; elle enrichit les noms, mais ajoute réseau, décodage et mémoire.
- Le client limite à 12 fichiers Parquet croisant la zone et à un nombre maximum d’entités, protections utiles contre les imports démesurés.

## 12. Observations secondaires et non-problèmes

- Aucun défaut certain de cleanup dans MapViewController, WorkspaceMaskLayer, SelectedFeatureMapInteractions ou GeoJsonLayersRenderer n’a été trouvé.
- Les caches GeoJSON chauds sont très efficaces ; il ne faut pas les supprimer.
- Le vertex drag Geoman est déjà découplé du store pendant le geste.
- Le cache local évite normalement le téléchargement complet quand la révision correspond.
- Les métadonnées du produit sont séparées du gros editorSnapshot pour localStorage.
- La génération de miniature appelle createDromapEditorProjectSnapshot, puis exporte un canvas et fait toDataURL JPEG. Elle est lancée 1,4 s après le premier montage si aucune miniature n’existe, et après sauvegarde manuelle/navigation. Elle peut concurrencer l’éditeur, mais n’a pas pu être mesurée.
- keepBuffer=6 peut conserver nettement plus de tuiles que le viewport ; sa contribution doit être mesurée avant modification, car il réduit aussi les trous pendant le pan.

## 13. Optimisations à ne pas faire

1. Ne pas réduire silencieusement le nombre de bâtiments, de coordonnées ou de features importées.
2. Ne pas appliquer la simplification intermédiaire aux bâtiments IGN/Overture sans validation géométrique ; les angles de façade sont une exigence.
3. Ne pas rendre l’export dépendant du viewport de l’éditeur ; le rendu final doit conserver toutes les données de la zone.
4. Ne pas casser l’identité WYSIWYG des tailles, labels, hachures, contours et flèches entre éditeur, preview et export.
5. Ne pas désactiver globalement la sélection, Geoman ou les hitboxes pour masquer le coût.
6. Ne pas remplacer l’historique par une limite arbitraire très basse sans préserver l’undo/redo attendu.
7. Ne pas retarder ou supprimer les checkpoints avant d’avoir des tests de durabilité, de navigation et de crash.
8. Ne pas ajouter des useMemo partout : les dépendances larges et les mutations d’identité doivent d’abord être corrigées.
9. Ne pas utiliser JSON.stringify comme test d’égalité de gros objets.
10. Ne pas optimiser en priorité MapViewController ou le masque workspace : leur coût est constant et leurs cleanups sont corrects.
11. Ne pas fusionner toutes les couches dans un seul bitmap si cela empêche sélection, style individuel, accessibilité ou export vectoriel.
12. Ne pas modifier Supabase, les migrations, la cadence réseau ou le format distant sans tests de compatibilité et de reprise.

## 14. Plan d’optimisation recommandé

### Étape 0 — Rendre les mesures production possibles

1. Corriger séparément les deux erreurs de typage Geoman.
2. Réparer la résolution pnpm exec tsc dans l’environnement.
3. Ajouter un jeu de test éphémère reproductible : projet léger, 1 000 bâtiments, 5 000 bâtiments, gros GeoJSON et 1 000 labels.
4. Collecter en production : temps d’ouverture, FPS pan/zoom/drag, long tasks, heap, nombre de panes/SVG/path, couches Leaflet et handlers.

### Étape 1 — Supprimer la cascade P0 des objets DroMap

1. Indexer les couches Leaflet par featureId.
2. Séparer géométrie, style, sélection et couches dérivées en effets distincts.
3. Coalescer les mutations de drag et ne persister la géométrie définitive qu’à la fin du geste.
4. Vérifier A, G, H, I, J et K avant/après avec les mêmes traces.

### Étape 2 — Adapter le rendu bâtiments

1. Mesurer SVG partagé, Canvas Leaflet et culling viewport avec marge.
2. Conserver explicitement la sélection et les objets édités même hors marge.
3. Garder une voie de rendu complet indépendante pour preview/export.
4. Éliminer les panes par feature si l’ordre peut être conservé avec moins de panes.

### Étape 3 — Réduire le travail React/Zustand

1. Ne monter le contenu d’ExportSetupPanel que lorsqu’il est ouvert.
2. Remplacer les abonnements tableaux complets par des sélecteurs ciblés ou des composants de liste isolés.
3. Supprimer ou fusionner le passage redondant FeaturesStyleSync.
4. Indexer les calques dans getRenderableFeaturesForLayers.

### Étape 4 — Stabiliser GeoJSON

1. Faire dépendre les caches de data/précision/workspace plutôt que de l’objet calque complet.
2. Distinguer opacité/style global des modifications de données par feature.
3. Éviter de recréer L.GeoJSON si la géométrie est inchangée.
4. Mettre à jour la sélection bâtiment de façon différentielle.

### Étape 5 — Maîtriser mémoire et persistance

1. Remplacer les instantanés d’historique complets par patches/partage structurel.
2. Créer un snapshot de sauvegarde une seule fois par génération.
3. Coalescer writeProjectCache et supprimer les réécritures après lecture du cache.
4. Déporter sérialisation, compression et miniature dans des Workers lorsque possible.

### Étape 6 — Labels et import

1. Ajouter un index spatial pour les collisions de labels et mettre en cache les mesures de texte.
2. Passer directement les FeatureCollection en mémoire au normaliseur, sans stringify puis parse.
3. Déporter GeoArrow, normalisation et conversion dans un Worker.
4. Mesurer séparément empreintes, enrichissement Places et modale de sélection.

### Étape 7 — Validation

Pour chaque étape, conserver des tests fonctionnels et visuels sur :

- ordre des calques et sélection ;
- WYSIWYG éditeur/preview/export ;
- Geoman et undo/redo ;
- labels, hachures, contours, flèches ;
- persistance offline, navigation, reprise après crash et conflits distants ;
- exactitude géométrique des bâtiments.

## 15. Conclusion

La priorité n’est pas une micro-optimisation de Leaflet ou du masque, mais la réduction du nombre de travaux globaux déclenchés par une mutation unitaire. Les deux premiers correctifs futurs devraient être l’indexation des couches par featureId et le découplage du drag visuel des écritures Zustand. Le troisième chantier est l’architecture de rendu des bâtiments, afin que le coût de l’éditeur dépende du viewport sans modifier le rendu final complet.

Cet audit s’arrête volontairement au diagnostic. Aucune correction, optimisation, migration, modification UX, donnée utilisateur, configuration Supabase, secret, commit ou publication n’a été effectué.
