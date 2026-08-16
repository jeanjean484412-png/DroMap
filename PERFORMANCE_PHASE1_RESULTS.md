# Résultats de la phase 1 de performance DroMap

Date : 17 août 2026  
Périmètre : erreurs TypeScript de `geoman-sync.ts`, index des couches Leaflet principales et déplacement visuel sans mutation Zustand par événement.

## Résumé

- Le typage des handlers `pm:markerdrag` est corrigé sans supprimer la preview de géométrie ni le commit final.
- La recherche de la couche principale d'une feature ne parcourt plus toutes les couches Leaflet pour chaque feature.
- Le déplacement du corps d'un objet utilise Leaflet comme état visuel temporaire et effectue une seule mutation métier historisée au relâchement.
- Les flèches, hitboxes, hachures, points, contours, labels et poignées nécessaires suivent le déplacement visuel.
- Aucun culling viewport, changement de persistance, changement Supabase, migration, changement d'export ou refonte de l'historique n'a été réalisé.

## Fichiers modifiés

- `app/editor/test/drawing-tool-controller.tsx`
- `app/editor/test/features-store-renderer.tsx`
- `lib/dromap/drag-preview.ts` (nouveau)
- `lib/dromap/geoman-sync.ts`
- `lib/dromap/layer-id.ts`
- `PERFORMANCE_PHASE1_RESULTS.md` (nouveau)

Le store `stores/editor-test-features.ts` n'est pas modifié dans le résultat final. L'instrumentation temporaire et les fixtures de test ont été retirées.

## Architecture de l'index Leaflet

`FeaturesStoreRenderer` conserve deux registres liés au cycle de vie de la carte :

1. `Map<string, L.Layer>` pour la couche principale `featureId -> layer` ;
2. `Map<string, Set<L.Layer>>` séparé pour les couches dérivées nécessaires à la preview de drag.

Le registre principal est initialisé par une seule passe sur les couches déjà montées. Il est ensuite mis à jour incrémentalement par `layeradd`, `layerremove` et par un événement local lorsque l'identifiant d'une couche Geoman est assigné après son ajout à la carte.

Lorsqu'une couche principale est recréée, l'ancienne couche indexée est retirée avant le remplacement. Les entrées sont supprimées lors de `layerremove`. Les listeners et les deux registres sont vidés au démontage du renderer. Il n'existe aucun registre global persistant au-delà de la carte.

Les couches dérivées restent distinctes : hitbox, corps et pointe de flèche, hachures, points, contour et label. Leur logique de création, leur pane et leur ordre ne sont pas fusionnés avec la couche principale.

## Recherches globales supprimées

La fonction `findLayerByFeatureId`, qui appelait `map.eachLayer()` une fois par feature rendue, est supprimée.

- 1 000 objets : 1 000 parcours globaux et 1 000 000 visites avant ; 0 parcours global de recherche après.
- 5 000 objets : 5 000 parcours globaux et 25 000 000 visites avant ; 0 parcours global de recherche après.

La passe globale qui retirait les couches principales orphelines a également été remplacée par une itération du registre. Une unique passe `map.eachLayer()` reste nécessaire à l'initialisation du registre au montage. Les parcours qui concernent les couches dérivées et l'ordre de dessin restent volontairement hors de cette correction P0.

## Drag avant/après

### Avant

- le drag manuel appelait `updateFeature` à chaque `mousemove`, puis une nouvelle fois à la fin ;
- le body drag Geoman appelait `updateFeature` à chaque `pm:drag`, puis à `pm:dragend` ;
- chaque appel remappait et renormalisait la collection Zustand ;
- l'historique était préparé séparément au début du geste.

### Après

- la couche manipulée est déplacée immédiatement par Leaflet ;
- les deltas visuels sont regroupés par `requestAnimationFrame` pour le drag manuel ;
- les couches principale et dérivées du même propriétaire suivent sans mutation du store ;
- les poignées Geoman sont rafraîchies pour suivre le corps ;
- le store reçoit une seule mutation `updateFeatureWithHistory` au relâchement ;
- cette mutation contient à la fois la géométrie finale et l'unique entrée Undo du geste.

Le vertex drag Geoman conserve sa preview par événement et sa synchronisation finale. Un garde empêche l'événement `pm:edit` terminal de dupliquer le commit du même déplacement de sommet.

## Mutations Zustand mesurées

Instrumentation temporaire sur un drag réel de marqueur à 101 positions :

- `commitFeaturesHistory` pendant le body drag : 0 ;
- `updateFeature` pendant le body drag : 0 ;
- `updateFeatureWithHistory` : 1 au relâchement.

Instrumentation temporaire sur une pointe de flèche à 51 positions :

- 51 événements de preview géométrique visibles ;
- 1 commit d'historique de session ;
- 1 synchronisation finale de géométrie ;
- aucune synchronisation de géométrie par événement de preview.

La micro-mesure synthétique ci-dessous utilise 100 événements : 100 remaps simulés avant, 1 mutation finale après.

## Micro-mesures à 1 000 et 5 000 objets

Protocole : médiane de 7 passages sous Node.js. La recherche « avant » reproduit le parcours complet sans interruption de `map.eachLayer` ; la recherche « après » construit un `Map` puis effectue les lectures par identifiant. Le drag synthétique mesure le remap d'une collection pour 100 événements contre une preview légère suivie d'un seul remap final. Ces durées n'incluent ni DOM, ni SVG, ni GPU, ni coût interne réel de Leaflet.

| Volume | Recherche avant | Recherche après | Visites avant | Drag simulé avant, 100 événements | Drag simulé après | Mutations avant/après |
|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | 6,724 ms | 0,217 ms | 1 000 000 | 1,911 ms | 0,160 ms | 100 / 1 |
| 5 000 | 106,930 ms | 0,921 ms | 25 000 000 | 5,973 ms | 0,687 ms | 100 / 1 |

## Tests de non-régression

| Test | Résultat | Observation |
|---|---|---|
| 1. Marqueur sélectionnable | Réussi | Sélection visible et inspecteur ouvert. |
| 2. Trait sélectionnable immédiatement après rechargement | Partiel | Le trait a été retrouvé et sélectionné depuis la liste après rechargement ; le clic cartographique automatisé n'a pas été concluant. |
| 3. Trait sélectionnable après un pan commencé depuis lui | Non conclu | Le navigateur automatisé n'a pas permis de finaliser ce scénario après retrait de la fixture. Aucun code de sélection/pan n'a été modifié. |
| 4. Déplacement marqueur en direct | Réussi | 101 positions, déplacement de 200 × 100 px, une mutation finale. |
| 5. Déplacement texte en direct | Réussi | 81 positions, déplacement de 120 × 60 px, une mutation finale. |
| 6. Déplacement trait en direct | Réussi | Corps, hitbox, pointe et label déplacés ensemble de 100 × -60 px, une mutation finale. |
| 7. Déplacement zone en direct | Réussi | Polygone, hachures, overlay de points et label déplacés ensemble de 80 × -50 px, une mutation finale. |
| 8. Poignée de pointe de flèche | Réussi | Corps et pointe déplacés ; 51 previews avant la synchronisation finale. |
| 9. Modification Geoman d'un sommet | Réussi | Une session d'historique et une synchronisation finale, sans écriture géométrique par preview. |
| 10. Annulation du geste complet | Réussi via commande Undo | Un marqueur est revenu de 840/440 à 640/340 en une seule annulation. Le raccourci `Ctrl+Z` lui-même n'a pas été reconnu par l'API clavier du navigateur. |
| 11. Rétablissement du geste complet | Réussi via commande Redo | Le marqueur est revenu à 840/440 en une seule restauration. Le raccourci `Ctrl+Y` lui-même n'a pas été reconnu par l'API clavier du navigateur. |
| 12. Plan avant/arrière inchangé | Réussi statiquement | Constantes de pane, z-index et algorithme de plan non modifiés. |
| 13. Hachures et points inchangés | Réussi | Les couches et leur contenu sont restés présents et ont suivi le drag. |
| 14. Édition = preview | Réussi sur les objets testés | Géométrie finale identique à la position visualisée pour marqueur, texte, trait/flèche et zone. |
| 15. Sauvegarde et rechargement de la position finale | Non vérifié | La session navigateur utilisée était éphémère et les fixtures temporaires ont été retirées sans persister de projet. La persistance n'a pas été modifiée. |

Vérifications supplémentaires :

- objet verrouillé : aucune mutation de feature pendant la tentative de drag ; le geste a panné la carte ;
- sélection multiple : logique et store non modifiés, mais scénario interactif complet non rejoué ;
- contraintes de zone de travail : aucun contrôleur de contrainte n'a été modifié, mais aucun test limite-à-limite dédié n'a été exécuté ;
- aucune erreur console applicative pendant les gestes testés ; l'avertissement d'hydratation vu pendant l'instrumentation provenait d'un attribut de mesure temporaire et a disparu avec son retrait.

## Validations techniques

- TypeScript local direct : réussi avec `node_modules/.bin/tsc.cmd -p tsconfig.json --noEmit --pretty false --noErrorTruncation`.
- Lint ciblé des cinq fichiers de code modifiés : 0 erreur, 4 avertissements préexistants.
- Lint global : échec sur 15 erreurs et 28 avertissements préexistants dans des fichiers hors périmètre ; aucune de ces erreurs ne provient des changements de phase 1.
- `pnpm exec tsc` ne résout toujours pas la commande `tsc` dans cet environnement ; le binaire local direct est utilisé comme autorisé.
- `pnpm build` : réussi ; compilation production, vérification TypeScript et génération des 31 pages terminées.

## Erreurs restantes

- Aucune erreur TypeScript connue dans les fichiers modifiés.
- La résolution de `pnpm exec tsc` reste défaillante dans l'environnement, indépendamment du code.
- Le lint global du dépôt contient encore les erreurs hors périmètre indiquées ci-dessus.
- Les scénarios de sélection de trait après pan, raccourcis clavier physiques et persistance après rechargement restent non conclus ou non vérifiés.

## Risques connus

- Les labels sont translatés visuellement pendant le drag, puis leur placement complet est recalculé au commit final. Un label peut donc se recaler légèrement au relâchement si les collisions ont changé ; l'algorithme de labels n'a pas été modifié.
- Les overlays SVG de points sont translatés par leurs bounds pendant la preview, puis recréés depuis la géométrie finale. À très haute latitude, une différence sub-pixel peut apparaître au commit final à cause de la projection.
- Le body drag Geoman direct est couvert par le même événement de preview, mais le chemin manuel utilisé par les outils Sélection/Modifier a reçu la couverture interactive principale.
- Les parcours globaux des couches dérivées et le placement quadratique des labels restent présents, conformément au périmètre demandé.
- La sélection multiple et la sauvegarde/reprise doivent être rejouées manuellement avant validation fonctionnelle complète.

## Hors périmètre confirmé

Aucun changement de culling viewport, historique global, persistance, format Projet DroMap, Supabase, migration, GeoJSON, bâtiments, export ou comportement UX n'a été effectué.
