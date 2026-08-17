# Benchmark de performance DroMap — Phase 2A

Date : 17 août 2026  
Révision de départ : `f32f02b`  
Périmètre : architecture de rendu des bâtiments, gros GeoJSON, viewport culling, renderer Canvas partagé, sélection et séparation éditeur/export.

## 1. Résumé

La recommandation pour la Phase 2B est une architecture différenciée, pas un remplacement global du renderer :

1. **Calques de bâtiments GeoJSON verrouillés dans l’éditeur : viewport culling à 25 % + un renderer `L.canvas` partagé par calque.**
2. **Preview/export : rendu complet indépendant du viewport, alimenté par le store intégral.**
3. **Objets DroMap : ne pas conserver le prototype culling à panes SVG unitaires tel quel.** Préparer un hybride où les objets ordinaires visibles sont regroupés dans des renderers partagés et où les objets sélectionnés/édités restent dans un overlay SVG dédié compatible Geoman. Cette partie doit rester derrière un garde de développement tant que l’ordre, les hitboxes, les styles dérivés et le WYSIWYG ne sont pas couverts.

Résultats principaux sur 20 000 bâtiments GeoJSON verrouillés, médiane de trois passages production :

- architecture actuelle SVG : 20 002 couches Leaflet, 20 000 paths DOM, disponibilité à 521,3 ms, zoom à 240,7 ms, 49,1 FPS pendant le pan ;
- culling SVG 25 % : 327 couches, 325 paths DOM, disponibilité à 70,8 ms, mise à jour culling à 39,6 ms ;
- Canvas sans culling : 20 002 couches, 1 canvas et aucun path DOM, disponibilité à 331,3 ms, mais toutes les données restent montées ;
- culling + Canvas : 327 couches, 1 canvas, aucun path DOM, disponibilité à 50,8 ms, mise à jour culling à 11,4 ms et 57,8 FPS.

Les bâtiments convertis en objets DroMap confirment le risque de l’architecture par objet : à 5 000 objets, le passage unique mesuré crée 5 000 panes et 5 000 SVG, produit 20 013 nœuds DOM, un pan de 4,76 s et un zoom de 3,24 s. À 10 000, le zoom prend 20,19 s. Le cas 20 000 n’a pas été exécuté, car il n’était plus raisonnable après ce gel.

## 2. Légende des niveaux de preuve

- **[Mesure]** valeur collectée par le harness production dans Chromium.
- **[Observation]** comportement constaté visuellement, par interaction réelle ou par inspection du DOM/Leaflet.
- **[Estimation]** valeur dérivée d’une mesure, avec calcul indiqué.
- **[Hypothèse]** proposition à valider en Phase 2B ; elle n’est pas présentée comme acquise.

## 3. Méthodologie

### 3.1 Validation de la base

Avant instrumentation :

| Commande | Résultat |
|---|---|
| `pnpm build` | Réussi : compilation, TypeScript et génération des 31 pages. |
| `node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit --pretty false --noErrorTruncation` | Réussi, aucune sortie. |

### 3.2 Harness temporaire

Une route client-only temporaire `/performance-phase2` a été construite et exécutée avec `next start`. Elle n’utilisait ni tuile, ni réseau, ni projet utilisateur, ni persistance.

Le harness reproduisait les choix structurants des renderers DroMap :

- GeoJSON actuel : un `L.GeoJSON`, un pane de calque, renderer SVG par défaut, une couche enfant par feature, `interactive: false` pour le calque verrouillé ;
- objets DroMap actuels : un pane et un renderer SVG par objet, couche Leaflet individuelle, neuf événements Geoman liés, passe géométrie/style/ordre à `moveend` et `zoomend` ;
- Canvas : `L.canvas` partagé sur un pane ;
- culling : test des bornes de chaque fixture contre `map.getBounds().pad(marge)`, déclenché à `moveend`/`zoomend` et coalescé par `requestAnimationFrame` ;
- objets sélectionnés, multisélectionnés et édités : union explicite avec les identifiants visibles avant décision de démontage ;
- preview : seconde carte isolée montant toujours toutes les fixtures, sans culling.

Le harness ne montait pas le reste de l’interface React/Zustand, la persistance, les labels en masse, les hachures ni les contours alignés. Les mesures objets DroMap sont donc un **plancher** pour le produit complet, même si les panes, SVG, couches, handlers et opérations Leaflet critiques sont représentés.

### 3.3 Protocole temporel

- `creationMs` : création synchrone de la carte, des fixtures et des couches ;
- `usableMs` : temps précédent + deux frames `requestAnimationFrame` ;
- pan : animation Leaflet de 420 ms sur 52 % de la largeur et 90 px verticalement ; le temps total inclut volontairement ces 420 ms fixes, donc FPS et frame time sont les comparateurs de fluidité ;
- zoom : `setZoom(+1)` sans animation, puis attente de `zoomend` et de deux frames ;
- culling : temps de la reconstruction/mise à jour exécutée dans la frame coalescée ;
- style : `setStyle` sur toutes les géométries montées ;
- long tasks : `PerformanceObserver`, seuil navigateur standard de 50 ms ;
- mémoire : `performance.memory.usedJSHeapSize` avant/après. Cette valeur est exposée, mais le GC n’est pas contrôlé ; les deltas sont indicatifs et peuvent être négatifs.

La matrice principale des bâtiments GeoJSON verrouillés a été exécutée trois fois ; les tableaux utilisent la médiane. Les cas objets DroMap, les marges alternatives, la preview et le gros GeoJSON non-bâtiments sont des passages uniques.

## 4. Configuration

| Élément | Valeur |
|---|---|
| OS | Microsoft Windows NT 10.0.26200.0 |
| Node.js | v24.15.0 |
| pnpm | 11.19.0 |
| Next.js | 16.2.6 |
| React | 19.2.4 |
| Leaflet | 1.9.4 |
| Geoman | 2.19.3 |
| Navigateur | Codex in-app Chromium |
| Viewport navigateur | 1 280 × 720 px |
| Device pixel ratio | 1,25 |
| Zone carte | environ 920 × 720 px, le panneau du harness occupant 360 px |
| CPU/RAM machine | non accessibles : requêtes système refusées |

## 5. Fixtures utilisées

### Bâtiments

Fixtures déterministes non persistées, espacées de `0,0012°` à densité constante. Chaque empreinte est un polygone fermé à sept coordonnées, avec un décroché de façade et des dimensions variant légèrement selon l’index. Aucun point n’est simplifié et aucune précision géométrique n’est diminuée.

Volumes : 1 000, 5 000, 10 000 et 20 000.

### Gros GeoJSON non-bâtiments

10 000 et 20 000 `LineString` déterministes à quatre coordonnées, distribuées avec la même densité. Le but est de distinguer un résultat propre aux polygones d’un résultat structurel Leaflet/GeoJSON.

### Interactions

Petit jeu mixte : une zone, un trait, un marqueur, un bâtiment sélectionnable et un bâtiment témoin non sélectionné.

## 6. Mesures — bâtiments GeoJSON verrouillés

Les valeurs sont des **[Mesures]**, médianes de trois passages. `Pan` donne temps total / FPS ; `DOM` donne panes / SVG / canvas / paths. Le delta heap est indicatif.

| Volume | Architecture | Création / utilisable | Pan / FPS | Zoom | Culling | Couches | DOM P/S/C/path | Δ heap | Long tasks total | Style |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | Actuelle SVG | 37,8 / 52,5 ms | 457,9 ms / 60,0 | 33,0 ms | — | 1 002 | 8/1/0/1 000 | +5,7 Mo | 0 ms | 5,8 ms |
| 1 000 | Culling SVG 25 % | 20,0 / 41,1 ms | 482,0 ms / 57,9 | 30,9 ms | 11,4 ms | 197 | 8/1/0/195 | −6,3 Mo (GC) | 0 ms | 2,3 ms |
| 1 000 | Canvas | 16,7 / 27,9 ms | 463,4 ms / 57,8 | 33,3 ms | — | 1 002 | 8/0/1/0 | +11,2 Mo | 0 ms | 2,1 ms |
| 1 000 | Culling + Canvas | 14,9 / 23,1 ms | 476,9 ms / 57,8 | 69,3 ms | 12,3 ms | 197 | 8/0/1/0 | +1,0 Mo | 0 ms | 0,9 ms |
| 5 000 | Actuelle SVG | 113,8 / 157,7 ms | 495,1 ms / 57,9 | 71,8 ms | — | 5 002 | 8/1/0/5 000 | +20,6 Mo | 117 ms | 31,6 ms |
| 5 000 | Culling SVG 25 % | 39,6 / 51,0 ms | 491,9 ms / 56,0 | 52,1 ms | 18,1 ms | 327 | 8/1/0/325 | +9,8 Mo | 0 ms | 3,0 ms |
| 5 000 | Canvas | 78,5 / 91,3 ms | 466,8 ms / 53,3 | 78,6 ms | — | 5 002 | 8/0/1/0 | +19,4 Mo | 0 ms | 9,2 ms |
| 5 000 | Culling + Canvas | 28,0 / 32,5 ms | 470,1 ms / 57,8 | 43,2 ms | 9,4 ms | 327 | 8/0/1/0 | +5,1 Mo | 0 ms | 0,5 ms |
| 10 000 | Actuelle SVG | 230,8 / 287,6 ms | 505,6 ms / 54,2 | 132,3 ms | — | 10 002 | 8/1/0/10 000 | +31,7 Mo | 239 ms | 57,6 ms |
| 10 000 | Culling SVG 25 % | 37,6 / 50,4 ms | 483,5 ms / 57,8 | 58,3 ms | 18,9 ms | 327 | 8/1/0/325 | +6,5 Mo | 0 ms | 2,4 ms |
| 10 000 | Canvas | 161,4 / 174,8 ms | 472,2 ms / 53,3 | 124,2 ms | — | 10 002 | 8/0/1/0 | +28,6 Mo | 101 ms | 33,4 ms |
| 10 000 | Culling + Canvas | 33,8 / 41,7 ms | 492,4 ms / 57,8 | 28,2 ms | 8,2 ms | 327 | 8/0/1/0 | +22,6 Mo | 0 ms | 0,4 ms |
| 20 000 | Actuelle SVG | 407,6 / 521,3 ms | 588,2 ms / 49,1 | 240,7 ms | — | 20 002 | 8/1/0/20 000 | +87,6 Mo | 511 ms | 108,7 ms |
| 20 000 | Culling SVG 25 % | 59,3 / 70,8 ms | 503,6 ms / 56,0 | 72,5 ms | 39,6 ms | 327 | 8/1/0/325 | +15,7 Mo | 55 ms | 3,0 ms |
| 20 000 | Canvas | 295,8 / 331,3 ms | 516,2 ms / 48,0 | 152,9 ms | — | 20 002 | 8/0/1/0 | +77,1 Mo | 262 ms | 64,9 ms |
| 20 000 | Culling + Canvas | 46,1 / 50,8 ms | 466,6 ms / 57,8 | 51,0 ms | 11,4 ms | 327 | 8/0/1/0 | +0,7 Mo | 0 ms | 0,6 ms |

### Lecture

- **[Mesure]** Canvas seul supprime les milliers de paths DOM mais pas les couches Leaflet, les géométries montées ni leur mémoire métier.
- **[Mesure]** Le culling seul réduit les couches à 197–327 et conserve 195–325 paths DOM.
- **[Mesure]** La combinaison est la seule à réduire simultanément couches, géométries hors viewport et DOM.
- **[Observation]** Le total `moveendHandlerMs`/`zoomendHandlerMs` de planification reste à 0–0,1 ms ; le vrai coût est dans `cullingUpdateMs`, exécuté dans la frame coalescée.
- **[Observation]** Les écarts de heap ne sont pas monotones et un delta négatif apparaît après GC. Ils confirment seulement que Canvas n’élimine pas le coût JavaScript des 20 000 couches.

## 7. Marges de culling

10 000 bâtiments, passages uniques pour 10 % et 50 % ; la ligne 25 % reprend la médiane principale.

| Marge | Montées | Visibles | Montées hors viewport | Création | Mise à jour | Pan FPS | Zoom |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 % | 220 | 153 | 67 | 25,5 ms | 18,5 ms | 60,0 | 40,6 ms |
| 25 % | 325 | 153 | 172 | 37,6 ms | 18,9 ms | 57,8 | 58,3 ms |
| 50 % | 561 | 153 | 408 | 103,0 ms | 29,7 ms | 52,0 | 66,4 ms |

- **[Observation]** 10 % est le moins coûteux mais laisse peu de tampon contre l’apparition tardive pendant les déplacements successifs.
- **[Mesure]** 50 % monte 73 % de géométries en plus que 25 % et augmente la mise à jour à 29,7 ms.
- **[Recommandation fondée sur mesure]** 25 % est le compromis de départ Phase 2B. Le seuil devra rester configurable pendant les tests visuels.

## 8. Objets DroMap

Passages uniques. Les FPS `—` signifient qu’aucun intervalle de frame inférieur à 250 ms n’a pu être retenu : le thread principal était bloqué.

### Architecture actuelle et culling SVG à panes unitaires

| Volume | Architecture | Création / utilisable | Pan / FPS | Zoom | Culling | Montées / visibles | Couches | Panes / SVG / DOM | Long tasks total / max |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | Actuelle | 109,4 / 162,4 ms | 849,0 ms / 18,0 | 242,2 ms | — | 1 000 / 99 | 2 000 | 1 008 / 1 000 / 4 013 | 738 / 278 ms |
| 5 000 | Actuelle | 835,2 / 1 203,5 ms | 4 764,3 ms / — | 3 244,4 ms | — | 5 000 / 128 | 10 000 | 5 008 / 5 000 / 20 013 | 9 449 / 2 633 ms |
| 10 000 | Actuelle | 4 052,5 / 5 170,0 ms | 3 803,5 ms / — | 20 185,0 ms | — | 10 000 / 153 | 20 000 | 10 008 / 10 000 / 40 013 | 25 741 / 19 034 ms |
| 20 000 | Actuelle | Non exécuté | Non exécuté | Non exécuté | — | — | — | — | — |
| 1 000 | Culling 25 % | 599,6 / 698,1 ms | 664,2 ms / 16,9 | 205,4 ms | 80,6 ms | 197 / 99 | 394 | 205 / 197 / 801 | 630 / 146 ms |
| 5 000 | Culling 25 % | 163,4 / 241,6 ms | 902,9 ms / 23,1 | 514,9 ms | 254,3 ms | 327 / 128 | 654 | 335 / 327 / 1 321 | 1 101 / 318 ms |
| 10 000 | Culling 25 % | 116,7 / 198,2 ms | 773,5 ms / 21,5 | 364,8 ms | 175,8 ms | 327 / 153 | 654 | 335 / 327 / 1 321 | 850 / 220 ms |
| 20 000 | Culling 25 % | 124,1 / 200,2 ms | 818,6 ms / 28,8 | 424,6 ms | 203,7 ms | 327 / 136 | 654 | 335 / 327 / 1 321 | 968 / 265 ms |

Le premier prototype culling objets laissait les renderers Leaflet de panes retirés dans `_paneRenderers`. Il a été corrigé puis intégralement rejoué ; seules les lignes corrigées ci-dessus sont retenues.

- **[Mesure]** Le culling borne le nombre de panes/SVG, mais créer/détruire des centaines de renderers unitaires coûte 175,8–254,3 ms à 5 000–20 000 données.
- **[Conclusion fondée sur mesure]** Le culling avec architecture « un pane par objet » ne suffit pas pour les objets DroMap.
- **[Mesure]** 20 000 objets actuels n’ont pas été tentés après le zoom de 20,19 s à 10 000 ; cette absence est indiquée, pas extrapolée comme mesure.

### Faisabilité Canvas pour les objets

| Volume | Canvas partagé | Création / utilisable | Pan / FPS | Zoom | Couches | DOM | Sélection | Geoman |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 000 | 1 canvas, 8 panes | 47,3 / 60,9 ms | 934,8 ms / 60,1 | 38,0 ms | 1 001 | 14 nœuds | 0,2 ms | 14,2 ms, 12 poignées |
| 5 000 | 1 canvas, 8 panes | 209,7 / 218,1 ms | 556,1 ms / 51,1 | 110,4 ms | 5 001 | 14 nœuds | < 0,1 ms | 25,4 ms, 12 poignées |

- **[Observation]** Clic, style individuel, ordre par `bringToFront` et activation Geoman ont fonctionné sur les polygones du harness.
- **[Observation]** Le temps total de pan à 1 000 inclut une long task de 472 ms après `moveend`, due à la passe complète sur les 1 000 objets ; le FPS pendant l’animation seule reste à 60.
- **[Limite]** Les hitboxes de traits, marqueurs `DivIcon`, textes, labels, hachures, contours alignés, flèches et ordre inter-calques complet n’étaient pas reproduits. Canvas partagé pour tous les objets n’est donc pas validé comme remplacement produit.

## 9. Gros GeoJSON non-bâtiments

Passages uniques.

| Volume | Architecture | Création / utilisable | Pan FPS | Zoom | Culling | Couches montées | DOM paths / canvas | Long tasks |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 10 000 | Actuelle SVG | 271,9 / 328,1 ms | 55,9 | 109,8 ms | — | 10 002 | 10 000 / 0 | 319 ms |
| 20 000 | Actuelle SVG | 366,0 / 466,0 ms | 50,6 | 212,0 ms | — | 20 002 | 20 000 / 0 | 625 ms |
| 10 000 | Culling SVG | 50,7 / 79,7 ms | 55,9 | 47,6 ms | 15,6 ms | 327 | 325 / 0 | 51 ms |
| 20 000 | Culling SVG | 69,2 / 85,7 ms | 55,9 | 51,6 ms | 22,3 ms | 352 | 350 / 0 | 0 ms |
| 10 000 | Canvas | 127,3 / 137,8 ms | 51,4 | 83,1 ms | — | 10 002 | 0 / 1 | 78 ms |
| 20 000 | Canvas | 268,1 / 278,5 ms | 57,9 | 100,0 ms | — | 20 002 | 0 / 1 | 93 ms |
| 10 000 | Culling + Canvas | 47,0 / 55,1 ms | 60,0 | 67,4 ms | 9,6 ms | 327 | 0 / 1 | 0 ms |
| 20 000 | Culling + Canvas | 49,6 / 55,3 ms | 57,8 | 39,6 ms | 12,6 ms | 352 | 0 / 1 | 0 ms |

**[Conclusion fondée sur mesure]** Le gain combiné n’est pas propre aux empreintes de bâtiments ; il se retrouve sur un gros GeoJSON linéaire.

## 10. Coût hors viewport

Après le pan et le zoom du protocole :

- architecture actuelle, 20 000 bâtiments : 136 réellement visibles, 19 864 montés hors viewport ;
- Canvas seul, 20 000 : même relation 136 / 19 864 ; Canvas change le DOM, pas le nombre de couches ;
- culling 25 %, 20 000 : 136 visibles, 189 montés dans la marge hors viewport, 325 montés au total ;
- culling + Canvas : mêmes 325 données montées, mais un seul canvas et aucun path DOM.

**[Estimation calculée]** À 20 000, le culling 25 % retire du montage éditeur `20 000 − 325 = 19 675` géométries, soit 98,4 % du jeu, sans les retirer du store.

Le masque de workspace n’a pas été modifié et n’intervient pas dans ces nombres.

## 11. Sélection, multisélection et Geoman

### Tests exécutés

| Scénario | Résultat | Niveau |
|---|---|---|
| Clic navigateur réel sur un bâtiment visible | Réussi ; l’identifiant `mixed-building` a été reçu par la couche | Observation |
| Sélection zone, trait, marqueur et bâtiment | Réussi sur SVG, Canvas et culling + Canvas | Mesure/observation |
| Multisélection avant changement de viewport | Réussie | Observation |
| Objet sélectionné quittant le viewport | Resté monté | Observation |
| Objet édité quittant le viewport | Resté monté | Observation |
| Ensemble multisélectionné quittant le viewport | Tous les identifiants sont restés montés | Observation |
| Pan commencé depuis le bâtiment | Réussi ; le pane carte est passé d’une translation nulle à une translation non nulle | Observation |
| Retour vers la position | Le path du bâtiment est revenu dans le viewport et la sélection est restée `mixed-building` | Observation |
| Geoman sur zone du jeu mixte | Activation réussie, 9 poignées | Mesure |
| Geoman sur bâtiment polygonal | Activation réussie, 12 poignées | Mesure |

### Limites

- Le harness valide le contrat de conservation des identifiants et l’activation Geoman, pas toutes les commandes de l’éditeur réel.
- Aucun vertex drag complet n’a été rejoué sur le prototype mixte. La Phase 1 avait déjà validé le vertex drag sans mutation store par pixel, mais cette validation n’est pas réétiquetée comme mesure Phase 2A.
- La fidélité des flèches, hachures, contours et labels avec Canvas partagé reste non mesurée.

## 12. Coût d’ouverture du rendu final

La preview temporaire était toujours complète, indépendamment de l’architecture éditeur.

| Données | Volume | Création / utilisable | Géométries | Panes | SVG | Paths | DOM |
|---|---:|---:|---:|---:|---:|---:|---:|
| Bâtiments GeoJSON | 1 000 | 22,0 / 31,4 ms | 1 000 | 8 | 1 | 1 000 | 1 015 |
| Bâtiments GeoJSON | 5 000 | 88,0 / 117,5 ms | 5 000 | 8 | 1 | 5 000 | 5 015 |
| Bâtiments GeoJSON | 10 000 | 166,3 / 217,3 ms | 10 000 | 8 | 1 | 10 000 | 10 015 |
| Bâtiments GeoJSON | 20 000 | 329,3 / 430,6 ms | 20 000 | 8 | 1 | 20 000 | 20 015 |
| Objets DroMap | 1 000 | 71,0 / 123,9 ms | 1 000 | 1 007 | 1 000 | 1 000 | 4 012 |
| Objets DroMap | 5 000 | 411,9 / 777,2 ms | 5 000 | 5 007 | 5 000 | 5 000 | 20 012 |
| Objets DroMap | 10 000 | 1 324,6 / 2 143,2 ms | 10 000 | 10 007 | 10 000 | 10 000 | 40 012 |

- **[Mesure]** Toutes les fixtures sont présentes dans la preview, y compris celles hors viewport éditeur.
- **[Limite]** La preview était mesurée isolément. Dans le produit actuel, l’éditeur reste monté pendant l’ouverture du rendu final ; le pic combiné sera supérieur, mais il n’est pas estimé numériquement ici.

## 13. Mémoire, DOM et couches Leaflet

- **[Mesure]** SVG actuel : un path DOM par géométrie GeoJSON.
- **[Mesure]** Canvas partagé : zéro path DOM mais toujours une couche Leaflet par géométrie.
- **[Mesure]** Objets actuels : un pane et un SVG par objet polygonal ; les renderers comptent aussi comme couches Leaflet, d’où 20 000 couches pour 10 000 polygones.
- **[Mesure]** Culling + Canvas verrouillé : 14 nœuds DOM dans le conteneur Leaflet du harness, quel que soit le volume source.
- **[Observation]** `usedJSHeapSize` est sensible au GC et à l’ordre des essais. Aucun chiffre n’est présenté comme taille mémoire absolue d’une architecture.
- **[Hypothèse]** Un index spatial persistant réduira le coût CPU du scan des 20 000 bornes à chaque mise à jour ; le harness utilisait volontairement un scan linéaire simple.

## 14. Fidélité visuelle et WYSIWYG

Le culling proposé est exclusivement une décision de montage de l’éditeur. Les stores continuent de contenir toutes les données.

### Contrat Phase 2B

Éditeur :

- requête viewport + marge ;
- union avec sélection, multisélection, objet édité et objet en drag ;
- géométrie source inchangée ;
- renderer partagé seulement pour les familles validées.

Preview/export :

- aucune requête viewport éditeur ;
- toutes les données chargées dans la zone de travail ;
- même géométrie et mêmes propriétés métier que le store.

### Éléments vérifiés ou non

| Élément | État Phase 2A |
|---|---|
| Géométrie | Inchangée ; aucune simplification ni réduction de coordonnées |
| Couleurs, opacité, contours | `setStyle` mesuré ; rendu présent |
| Tirets/pointillés | Compatibles avec les options Leaflet Canvas, mais pas couverts par comparaison pixel |
| Labels et textes | Non inclus dans la matrice ; doivent rester couches DOM dédiées |
| Ordre des calques GeoJSON | Pane par calque conservable |
| Ordre fin des objets DroMap | Non validé pour Canvas partagé |
| Bâtiments | Mesurés aux quatre volumes |
| Masque et zone de travail | Non modifiés |
| Preview/export complet | Mesuré par comptage intégral |

**[Conclusion]** La fidélité du GeoJSON verrouillé est techniquement compatible avec Canvas, mais aucune égalité pixel n’a été mesurée. La fidélité complète des objets DroMap sur Canvas reste une hypothèse et bloque leur migration globale.

## 15. Comparaison qualitative obligatoire

| Architecture | Fluidité | Sélection | Fidélité | Complexité | Risque de régression |
|---|---|---|---|---|---|
| Actuelle | Bonne à petit GeoJSON, chute avec volume et objets DroMap | Référence produit | Référence produit | Faible changement | Risque performance déjà mesuré |
| Culling viewport | Très bon pour GeoJSON ; insuffisant avec panes unitaires objets | Préservation validée dans le prototype | Élevée si mêmes renderers | Moyenne | Apparition tardive, teardown, sélection hors vue |
| Canvas | DOM minimal, mais couches et données complètes restent montées | Faisable dans le harness | Bonne pour paths simples, incomplète pour objets riches | Moyenne | Hitboxes, ordre, Geoman, labels, WYSIWYG |
| Culling + Canvas | Meilleur résultat bâtiments/gros GeoJSON | Verrouillé : non applicable ; objets : prototype positif mais incomplet | Compatible paths simples | Élevée | Risque maîtrisable si limité par famille de rendu |

## 16. Risques

1. Apparition visible si la marge est trop faible ou si le calcul arrive après une longue task.
2. Accumulation de renderers/panes si le teardown ne retire pas à la fois la couche, le renderer Leaflet interne et le pane DOM.
3. Perte d’une sélection hors viewport si l’union d’identifiants privilégiés est calculée après le filtrage.
4. Divergence d’ordre si plusieurs objets partageant un Canvas ne sont pas rejoués dans l’ordre de dessin DroMap.
5. Divergence des hitboxes, flèches, hachures, contours ou labels si les couches dérivées ne suivent pas le même propriétaire.
6. Divergence éditeur/export si une fonction de culling est réutilisée par erreur dans la preview.
7. Scan linéaire de toutes les bornes à chaque `moveend` acceptable à 20 000 dans ce harness, mais potentiellement insuffisant avec géométries complexes et plusieurs calques.
8. Pression mémoire métier inchangée : le store conserve volontairement toutes les données.

## 17. Solution recommandée

### 17.1 Bâtiments GeoJSON verrouillés

**[Recommandation fondée sur mesure]** Implémenter culling 25 % + `L.canvas` partagé par calque dans l’éditeur.

- Conserver le `FeatureCollection` complet dans `editor-test-geojson-layers`.
- Construire un index `featureId -> bbox` lié à l’identité `data + precisionMode + workspace`.
- Maintenir `featureId -> L.Layer` pour le sous-ensemble monté.
- À `moveend`, `zoomend` et `resize`, coalescer une seule mise à jour par frame.
- Ajouter/retirer différentiellement les enfants du groupe plutôt que recréer tout `L.GeoJSON`.
- Garder un renderer Canvas et un pane par calque, pas par feature.
- Continuer à ignorer Geoman et l’interactivité pour le calque verrouillé.

### 17.2 Objets DroMap

**[Hypothèse recommandée pour prototypage Phase 2B]** Architecture hybride :

- culling viewport commun à 25 % ;
- paths ordinaires visibles rendus dans un renderer partagé par calque ou bucket d’ordre ;
- marqueurs, textes et labels conservés dans leurs renderers DOM actuels ;
- objet sélectionné/édité promu dans un overlay SVG dédié avec hitbox, Geoman et couches dérivées ;
- union obligatoire de tous les identifiants sélectionnés, édités ou en drag ;
- restitution dans le renderer partagé au commit/désélection ;
- export toujours sur le chemin complet actuel jusqu’à validation visuelle.

Le prototype Canvas à 5 000 objets montre que cette voie est plausible, mais pas encore qu’elle est fidèle au produit.

## 18. Pourquoi les autres solutions ne sont pas retenues

### Architecture actuelle

Non retenue comme cible : elle monte 20 000 couches pour 20 000 bâtiments GeoJSON et devient inutilisable bien avant 10 000 objets DroMap.

### Culling SVG seul

Bon fallback pour les calques verrouillés, mais conserve des paths DOM. Pour les objets DroMap, le coût de création/destruction des panes unitaires reste de 175,8 à 254,3 ms.

### Canvas seul

Réduit radicalement le DOM, mais ne réduit ni le nombre de couches Leaflet, ni les données hors viewport, ni la mémoire métier. À 20 000 bâtiments, il conserve 20 002 couches.

### Canvas global sur tous les objets DroMap

Non retenu sans étape hybride : sélection et Geoman simples fonctionnent, mais les hitboxes, marqueurs, textes, labels, flèches, hachures, contours et l’ordre exact ne sont pas validés.

## 19. Architecture exacte proposée pour la Phase 2B

1. Ajouter un module éditeur-only de requête viewport, sans dépendance vers preview/export.
2. Indexer les bornes par identité stable de données ; invalider uniquement sur géométrie, précision ou workspace.
3. Exposer une requête `viewport.pad(0.25) + privilegedFeatureIds`.
4. Coalescer `moveend`, `zoomend`, `resize` par `requestAnimationFrame` ; ne jamais recalculer à chaque pixel.
5. Implémenter d’abord le chemin bâtiments GeoJSON verrouillés : ajout/retrait différentiel + un Canvas/pane par calque.
6. Ajouter des compteurs de développement temporaires : total store, candidats viewport, montés, hors viewport montés, couches, panes, DOM et durée de mise à jour.
7. Garder `GeoJsonLayersRenderer` complet dans `ExportLeafletPreview` et tous les exports.
8. Ajouter des tests d’identité visuelle sur couleurs, opacité, contours, tirets, ordre, masque et zone de travail.
9. Prototyper ensuite l’hybride objets DroMap : renderer partagé pour les paths non sélectionnés, overlay SVG pour sélection/édition.
10. Bloquer l’activation objets DroMap tant que marqueur, texte, trait/flèche, zone, hachures, contours, labels, multisélection, pan depuis objet et Geoman ne passent pas ensemble.

## 20. État final de la tâche

- Aucun changement Supabase, migration, UX, format Projet DroMap, sauvegarde, historique ou export permanent.
- Aucune diminution de précision géométrique.
- Les fixtures et l’instrumentation étaient temporaires et non persistées.
- Aucun prototype ne doit rester activé dans le produit après suppression du harness.
- Aucun commit ni push effectué.

La Phase 2A s’arrête à ce rapport. La solution recommandée n’est pas implémentée définitivement.
