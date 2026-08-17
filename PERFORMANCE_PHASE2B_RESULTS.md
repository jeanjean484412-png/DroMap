# Résultats de performance DroMap — Phase 2B.1

Date : 17 août 2026  
Révision de départ : `27454df`  
Périmètre : culling viewport et Canvas partagé pour les gros calques GeoJSON verrouillés dans l’éditeur, avec séparation stricte du rendu complet preview/export.

## 1. Verdict

La Phase 2B.1 est implémentée dans le produit pour les calques GeoJSON verrouillés compatibles, notamment les bâtiments IGN BD TOPO et Overture.

À 20 000 bâtiments, médiane de trois passages en build production :

- le store conserve les 20 000 features, mais l’éditeur n’en monte que 338 au chargement ;
- 340 couches Leaflet sont présentes au lieu de 20 002 sur le comparateur complet ;
- un seul Canvas est utilisé, sans SVG ni `path` GeoJSON dans le DOM ;
- la disponibilité passe de 809,1 ms sur le comparateur complet à 133,8 ms, soit un facteur 6,05 ;
- le pan animé reste à 59,9 FPS contre 44,6 FPS sur le comparateur complet ;
- la mise à jour différentielle après pan prend 26,5 ms et remplace uniquement les features réellement sorties/entrées ;
- un changement de style conserve toutes les instances montées communes et ne reconstruit pas l’index bbox.

La preview complète conserve bien 20 000/20 000 features après pan, zoom et changement de style. Aucun culling éditeur n’entre dans son graphe d’import.

## 2. Architecture livrée

### 2.1 Frontière éditeur/export

Deux chemins explicites sont désormais séparés :

- `EditorGeoJsonLayersRenderer`, importé uniquement par la carte éditeur ;
- `FullGeoJsonLayersRenderer`, utilisé par la preview et le rendu final, sans dépendance vers `editor-only`.

Une règle ESLint interdit les imports `editor-only` depuis le renderer complet, les helpers partagés et les chemins `export-*`/rendu final.

### 2.2 Éligibilité et fallback

Le chemin viewport + Canvas est activé si le calque :

- est verrouillé ;
- contient au moins une feature ;
- est identifié comme bâtiments IGN/Overture, ou contient au moins 1 000 features ;
- possède des identifiants de features présents et uniques ;
- ne contient que des géométries Leaflet Path prises en charge ;
- produit des bbox finies et valides.

Tout calque déverrouillé, petit ou incompatible revient au renderer complet historique. La visibilité et l’opacité ne déterminent pas la compatibilité : masquer un calque détruit ses objets Leaflet/Canvas/pane, mais conserve son index réutilisable.

### 2.3 Index stable

L’index reste local au renderer et ne modifie ni le store, ni les propriétés GeoJSON, ni le format Projet :

- `featureId -> bbox`, position source et références de géométrie ;
- bbox construites sur les géométries d’affichage ;
- réutilisation sur rename, ordre, visibilité, opacité, lock/unlock et remplacement de données par un changement de style si les IDs et références de géométrie restent identiques ;
- reconstruction sur changement réel de géométrie ou de précision effective ;
- pour IGN/Overture, la précision effective reste `original`, conformément au store existant ;
- un changement de workspace ne reconstruit pas les bbox : la requête intersecte la marge de chargement workspace historique avec le viewport.

Les références `sourceData` sont actualisées lors des remplacements style-only afin de ne pas retenir une ancienne `FeatureCollection`. La suppression d’un calque nettoie aussi son cache, même s’il était masqué et n’avait plus d’entrée Leaflet.

### 2.4 Mise à jour viewport

Le renderer :

- calcule `map.getBounds().pad(0.25)` ;
- écoute `moveend`, `zoomend` et `resize` ;
- coalesce ces événements dans un seul `requestAnimationFrame` ;
- maintient `featureId -> L.Layer` pour les seules features montées ;
- retire et ajoute différentiellement les enfants ;
- laisse inchangées les instances restant dans le viewport ;
- rejoue l’ordre source par `bringToFront` après un diff pour conserver l’ordre Canvas ;
- utilise un seul `L.canvas` et un seul pane par calque optimisé ;
- garde `pmIgnore`, `interactive: false` et `pointer-events: none` sur ce chemin verrouillé.

Le style actualise la référence `feature` de chaque enfant monté et appelle `setStyle`/`setRadius` sans reconstruire sa bbox ni sa couche si la géométrie est inchangée.

## 3. Protocole

### 3.1 Environnement

| Élément | Valeur |
|---|---|
| OS | Windows |
| Node.js | v24.15.0 |
| pnpm | 11.19.0 |
| Next.js | 16.2.6 |
| Navigateur | Codex in-app Chromium |
| Viewport | 1 280 × 720 px |
| Zone carte | environ 920 × 720 px |
| Exécution | `pnpm build`, puis `pnpm start` |

### 3.2 Harness temporaire

Une route temporaire a monté les renderers de production réels avec une seule carte, sans fond, tuile, réseau, persistance ni projet utilisateur. Elle a été retirée après les mesures.

Fixtures déterministes : 1 000, 5 000, 10 000 et 20 000 polygones de bâtiments IGN, sept coordonnées par empreinte, grille de 160 colonnes espacées de `0,0012°`, précision originale, calque visible et verrouillé.

Deux modes ont été mesurés :

- `editor` : renderer éditeur définitif, culling 25 % + Canvas ;
- `preview` : renderer complet définitif, sans culling, utilisé comme comparateur contrôlé.

Chaque volume et chaque mode ont été chargés trois fois. Les tableaux donnent la médiane.

### 3.3 Opérations

- création : fixture, store, index et premier sous-ensemble monté ;
- utilisable : création puis deux frames ;
- pan : animation Leaflet de 420 ms sur 480 × 90 px ;
- zoom : `setZoom(+1)` sans animation ;
- style : remplacement du style via le store réel ;
- culling : durée interne de la frame coalescée ;
- long tasks : `PerformanceObserver`, seuil navigateur de 50 ms.

Le FPS du pan mesure principalement l’animation. La durée de réconciliation après `moveend` est donc publiée séparément ; à 20 000, ses 26,5 ms dépassent le budget strict d’une frame de 16,7 ms, sans dégrader l’animation mesurée grâce à la marge de 25 %.

## 4. Résultats éditeur

Toutes les lignes conservent le volume complet dans le store. `Montées` est le nombre d’enfants GeoJSON présents dans Leaflet au chargement.

| Volume | Création / utilisable | Montées / store | Couches Leaflet | DOM panes/SVG/canvas/path | Pan total / FPS | Update pan | Zoom total / update | Style total / renderer |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | 54,6 / 74,0 ms | 156 / 1 000 | 158 | 8/0/1/0 | 460,1 ms / 60,0 | 8,3 ms | 29,5 / 1,9 ms | 56,1 / 0,3 ms |
| 5 000 | 78,6 / 111,5 ms | 364 / 5 000 | 366 | 8/0/1/0 | 474,6 ms / 59,9 | 15,1 ms | 22,0 / 6,3 ms | 61,0 / 0,6 ms |
| 10 000 | 87,6 / 116,1 ms | 338 / 10 000 | 340 | 8/0/1/0 | 468,2 ms / 60,0 | 22,8 ms | 27,9 / 4,2 ms | 55,6 / 0,8 ms |
| 20 000 | 105,7 / 133,8 ms | 338 / 20 000 | 340 | 8/0/1/0 | 470,1 ms / 59,9 | 26,5 ms | 24,4 / 9,7 ms | 70,7 / 1,9 ms |

Le conteneur de carte contient 37 nœuds DOM dans les quatre cas, dont un coût fixe du panneau de commande temporaire. La croissance source ne crée donc ni SVG ni `path` supplémentaire dans l’éditeur.

### 4.1 Diff différentiel

Après le pan standard :

| Volume | Ajoutées | Retirées | Restées montées |
|---:|---:|---:|---:|
| 1 000 | 48 | 54 | 150 |
| 5 000 | 129 | 143 | 350 |
| 10 000 | 121 | 134 | 325 |
| 20 000 | 121 | 134 | 325 |

Contrôle d’identité dédié à 20 000, zoom 16 :

- avant pan : 338 instances ;
- après pan : 204 IDs communs, 204/204 instances identiques, 134 retirées, 121 ajoutées ;
- après retour : les 204 restées montées conservent leur identité ; seules les 134 réellement démontées sont recréées ;
- après style sans pan : 338 IDs communs, 338/338 instances identiques, 0 ajout, 0 retrait ;
- nombre de constructions de l’index : 1 avant et après le style.

### 4.2 Coalescence

Un `moveend`, un `zoomend` et un `resize` déclenchés dans le même tour ont produit une seule mise à jour viewport : 2,1 ms, 0 ajout, 0 retrait, index inchangé.

## 5. Comparateur complet preview/export

Ce mode utilise le renderer complet définitif, pas un prototype. Toutes les features restent montées après pan, zoom et style.

| Volume | Création / utilisable | Montées | Couches Leaflet | DOM panes/SVG/canvas/path | Pan total / FPS | Zoom | Style |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | 92,0 / 102,7 ms | 1 000 | 1 002 | 8/1/0/1 000 | 453,6 ms / 60,0 | 35,6 ms | 55,3 ms |
| 5 000 | 247,5 / 273,0 ms | 5 000 | 5 002 | 8/1/0/5 000 | 479,4 ms / 57,9 | 91,6 ms | 124,0 ms |
| 10 000 | 396,5 / 440,3 ms | 10 000 | 10 002 | 8/1/0/10 000 | 537,6 ms / 52,5 | 153,1 ms | 232,1 ms |
| 20 000 | 725,6 / 809,1 ms | 20 000 | 20 002 | 8/1/0/20 000 | 599,8 ms / 44,6 | 312,1 ms | 417,2 ms |

À chaque volume, `montées = store` après le pan, le zoom et le style. Le chemin complet ne reçoit aucun callback de culling.

## 6. Gains contrôlés

Comparaison médiane entre les deux renderers définitifs dans le même harness :

| Volume | Accélération création | Accélération utilisable | Réduction couches montées | Réduction nœuds DOM | Gain FPS pan |
|---:|---:|---:|---:|---:|---:|
| 1 000 | ×1,68 | ×1,39 | 84,4 % | 96,44 % | +0,0 % |
| 5 000 | ×3,15 | ×2,45 | 92,72 % | 99,27 % | +3,6 % |
| 10 000 | ×4,53 | ×3,79 | 96,62 % | 99,63 % | +14,3 % |
| 20 000 | ×6,86 | ×6,05 | 98,31 % | 99,82 % | +34,5 % |

À 20 000, l’opération style complète est aussi 5,90 fois plus rapide : 70,7 ms contre 417,2 ms. Le travail propre au renderer n’est que de 1,9 ms ; le reste vient principalement du remplacement style/data existant dans le store sur 20 000 features.

## 7. Mise en perspective Phase 1 / Phase 2A

### 7.1 Phase 1

La Phase 1 concernait l’index des objets DroMap et la preview de drag sans mutation Zustand par pixel. Aucun fichier de ce chemin n’est modifié en Phase 2B.1 : ses gains et son contrat d’historique restent donc structurellement inchangés. Aucune nouvelle mesure d’objet DroMap n’est réétiquetée comme mesure Phase 2B.

### 7.2 Phase 2A historique

Le harness `/performance-phase2` de la Phase 2A n’existe plus dans la révision de départ ; seules ses mesures documentées subsistent. Une reproduction bit-à-bit est donc impossible sans reconstruire son prototype. Les comparaisons ci-dessous sont contextuelles et non strictement à matériel/harness identique.

Sur la ligne historique 20 000 « architecture actuelle SVG » :

- création : 407,6 ms historiquement contre 105,7 ms ici, facteur 3,86 ;
- utilisable : 521,3 ms contre 133,8 ms, facteur 3,90 ;
- zoom : 240,7 ms contre 24,4 ms, facteur 9,86 ;
- pan : 49,1 FPS contre 59,9 FPS, soit +22 % ;
- couches : 20 002 contre 340 ;
- paths DOM : 20 000 contre 0.

Le prototype historique « culling + Canvas » était plus isolé et donc plus rapide en valeur absolue : 50,8 ms utilisable et 11,4 ms de culling à 20 000, contre 133,8 et 26,5 ms dans le renderer produit réel. En revanche, le produit conserve le résultat architectural attendu : un Canvas, aucun path, quelques centaines de couches, ~60 FPS pendant le pan et aucune perte dans le store/export.

## 8. Styles, ordre, masque et transitions

### 8.1 Style et fidélité

Le scénario visuel a appliqué couleur violette, opacité, contour de deux pixels et tirets sur le Canvas 20 000 ; le rendu était présent et cohérent. L’identité des 338 enfants montés est restée stable.

Les helpers partagés reproduisent le branchement historique de style du renderer complet, y compris le traitement top-level des `Point`, `MultiPoint` et groupes Leaflet. Aucune simplification supplémentaire ni diminution de coordonnées n’est introduite.

Limite : aucune égalité pixel automatisée n’a été calculée. L’ordre est couvert par le replay `bringToFront` et la revue statique, pas par un test couleur de pixel sur deux polygones superposés.

### 8.2 Masque workspace

Le pane optimisé mesuré a un z-index de 410. Le renderer éditeur plafonne tous ses panes à 19 990, sous le masque workspace à 20 000. Le renderer complet preview/export n’applique pas ce plafond et conserve le calcul historique.

### 8.3 Visibilité, lock et teardown

Scénario dédié à 20 000, zoom 17 :

- optimisé visible : 84 enfants, 1 Canvas, 8 panes, 0 SVG/path ;
- masqué : 0 couche, 0 Canvas, 7 panes ;
- réaffiché : 84 enfants, 1 Canvas, 8 panes, index toujours construit une seule fois ;
- déverrouillé : fallback complet, 20 000 enfants, 1 SVG, 20 000 paths ;
- reverrouillé : retour à 84 enfants, 1 Canvas, 0 SVG/path.

Le passage déverrouillé complet a pris 867,2 ms et produit 816 ms de long tasks, ce qui confirme l’intérêt du chemin verrouillé. Le retour optimisé a pris 98,6 ms.

Deux cycles supplémentaires hide/show/unlock/lock ont reproduit exactement les mêmes nombres de panes, Canvas, SVG, paths et nœuds DOM : aucune croissance de renderer ou pane n’a été observée.

## 9. Preview, export et persistance

### Vérifié dynamiquement

- le renderer complet monte 1 000, 5 000, 10 000 et 20 000 features ;
- pan, zoom et style ne réduisent jamais ce total ;
- le renderer complet utilise SVG et ne reçoit aucun culling ;
- `/editor/test` charge la carte réelle sans erreur console applicative.

### Vérifié statiquement

- `export-leaflet-preview.tsx` utilise uniquement `FullGeoJsonLayersRenderer` ;
- aucun module `editor-only` n’est importé par preview, rendu final ou exports ;
- les exports image/PDF/SVG, Projet DroMap et GeoJSON ne sont pas modifiés ;
- les stores, l’historique, la persistance, Supabase, les migrations et le format Projet ne sont pas modifiés ;
- le store conserve toujours la collection complète, y compris les features hors viewport.

Limite : aucun téléchargement image/PDF/Projet/GeoJSON réel ni round-trip Supabase n’a été exécuté dans le harness isolé. La non-régression de ces sorties repose sur le comptage complet du renderer partagé, la frontière d’import lintée et l’absence de diff dans leurs chemins.

## 10. Objets DroMap ordinaires

Aucun fichier des marqueurs, textes, traits, flèches, zones, sélection, multisélection, drag, Geoman, hachures, contours, labels ou ordre avant/arrière n’est modifié. `test-map.tsx` remplace uniquement le point de montage du renderer GeoJSON, au même emplacement avant `FeaturesStoreRenderer`.

Le smoke test réel `/editor/test` confirme le chargement de la carte et des contrôles sans erreur console. Les interactions exhaustives marqueur/texte/trait/flèche/zone, Undo/Redo, ordre, multisélection et sauvegarde/rechargement n’ont pas été rejouées dans cette phase ; elles restent couvertes par les résultats Phase 1 et par l’audit de diff, pas par une nouvelle preuve dynamique Phase 2B.

## 11. Pression mémoire

`performance.memory` n’était pas accessible de façon fiable dans le navigateur de contrôle et aucun GC forcé n’a été utilisé. Aucun chiffre de heap artificiellement précis n’est donc publié.

Les indicateurs structurels sont néanmoins nets à 20 000 :

- store métier : 20 000 features dans les deux modes, volontairement inchangé ;
- éditeur : 338 enfants Leaflet, 340 couches, 1 Canvas, 0 path ;
- complet : 20 000 enfants, 20 002 couches, 1 SVG, 20 000 paths ;
- cache éditeur : bbox/ID/références de géométrie, sans copie persistée dans le projet ;
- teardown répété : comptes DOM/Leaflet stables ;
- suppression et démontage : cache, enfants, Canvas, renderer, pane, listeners et frame planifiée nettoyés.

## 12. Risques et limites résiduels

1. Le scan bbox reste linéaire. À 20 000, le diff post-pan prend 26,5 ms ; un index spatial deviendrait pertinent pour plusieurs gros calques simultanés ou des géométries plus complexes.
2. Le seuil générique de 1 000 est volontairement conservateur mais devra être réévalué sur des GeoJSON non-bâtiments réels.
3. Le test visuel n’est pas un diff pixel. Un scénario automatisé de polygones superposés renforcerait la preuve d’ordre Canvas.
4. Le store complet reste en mémoire par contrat ; le culling réduit les couches Leaflet et le DOM, pas les données métier.
5. Le cap de z-index éditeur égaliserait théoriquement l’ordre au-delà d’environ 4 896 calques GeoJSON visibles, cas extrême sans effet sur preview/export.
6. Les téléchargements d’exports, la persistance et les interactions exhaustives d’objets ordinaires n’ont pas été rejoués dynamiquement dans ce harness.

## 13. Fichiers produit

Nouveaux :

- `app/editor/test/editor-only/editor-geojson-layers-renderer.tsx` ;
- `app/editor/test/editor-only/geojson-viewport-index.ts` ;
- `app/editor/test/geojson-leaflet-rendering.ts` ;
- `PERFORMANCE_PHASE2B_RESULTS.md`.

Modifiés :

- `app/editor/test/geojson-layers-renderer.tsx` ;
- `app/editor/test/test-map.tsx` ;
- `app/editor/test/export-leaflet-preview.tsx` ;
- `eslint.config.mjs`.

Aucun fichier temporaire de benchmark ne subsiste.

## 14. Validation technique finale

| Vérification | Résultat |
|---|---|
| TypeScript direct | Réussi, aucune sortie |
| `pnpm build` final | Réussi, 31 pages, aucune route benchmark |
| ESLint ciblé | 0 erreur ; 1 avertissement `exhaustive-deps` préexistant dans `test-map.tsx:127` |
| `git diff --check` | 0 erreur ; avertissements de normalisation CRLF uniquement |
| Recherche instrumentation temporaire | Aucun marqueur, hook global ou route trouvé |
| Revue de code concurrente | Aucun P0/P1/P2 restant |

Aucun commit ni push n’a été effectué.
