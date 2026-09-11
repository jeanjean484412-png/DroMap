# Nettoyage structurel des noms DroMap

Date : 2026-09-10

## Renommages appliqués

### Moteur de l’éditeur

- `app/editor/test/<module>` → `editor/<module>` pour les 110 modules du moteur.
- L’éditeur autonome est maintenant servi par `app/editor/page.tsx` sur `/editor`.
- La redirection permanente de l’ancienne URL `/editor/test` vers `/editor` est déclarée dans `next.config.ts`, sans conserver de dossier `test` dans le code source.
- `app/editor/test/test-map.tsx` → `editor/editor-map.tsx`.
- `TestMap` → `EditorMap`.
- `TestMapProps` → `EditorMapProps`.
- `EditorTestPage` → `StandaloneEditorPage`.

Tous les imports statiques, imports dynamiques, réexports et commentaires techniques qui désignaient ces modules ont été mis à jour. Les imports internes relatifs entre modules du moteur restent relatifs et conservent la même résolution.

### Stores Zustand

- `stores/editor-test-basemap.ts` → `stores/editor-basemap.ts`
- `stores/editor-test-custom-markers.ts` → `stores/editor-custom-markers.ts`
- `stores/editor-test-drawing-options.ts` → `stores/editor-drawing-options.ts`
- `stores/editor-test-export.ts` → `stores/editor-export.ts`
- `stores/editor-test-features.ts` → `stores/editor-features.ts`
- `stores/editor-test-geojson-layers.ts` → `stores/editor-geojson-layers.ts`
- `stores/editor-test-graphic-zoom.ts` → `stores/editor-graphic-zoom.ts`
- `stores/editor-test-history-coordinator.ts` → `stores/editor-history-coordinator.ts`
- `stores/editor-test-layer-commands.ts` → `stores/editor-layer-commands.ts`
- `stores/editor-test-layers.ts` → `stores/editor-layers.ts`
- `stores/editor-test-map-labels.ts` → `stores/editor-map-labels.ts`
- `stores/editor-test-map-view.ts` → `stores/editor-map-view.ts`
- `stores/editor-test-mode.ts` → `stores/editor-mode.ts`
- `stores/editor-test-selection.ts` → `stores/editor-selection.ts`
- `stores/editor-test-text-edit.ts` → `stores/editor-text-edit.ts`
- `stores/editor-test-tool.ts` → `stores/editor-tool.ts`
- `stores/editor-test-workspace.ts` → `stores/editor-workspace.ts`
- `stores/editor-test-world-snapshot.ts` → `stores/editor-world-snapshot.ts`

Dans ces modules et dans tous leurs consommateurs :

- `useEditorTest*Store` → `useEditor*Store`
- `EditorTest*State` → `Editor*State`
- `EditorTestActiveTool` → `EditorActiveTool`
- `EditorTestWorldSnapshotStatus` → `EditorWorldSnapshotStatus`

Ces identifiants TypeScript/Zustand ne sont pas sérialisés dans les projets enregistrés.

### Autres vestiges de phase

- `.env.dromap-p0.example` → `.env.dromap.example`
- événement interne `dromap:p1-open-project-info` → `dromap:open-project-info`
- événement interne `dromap:p1-start-tour` → `dromap:start-editor-tour`

Les émetteurs et écouteurs de ces deux événements internes ont été modifiés ensemble.

## Noms conservés pour compatibilité ou exactitude

- Route historique `/editor/test` : conservée dans `next.config.ts` comme redirection permanente afin que les anciens favoris et liens rejoignent `/editor` sans rupture.
- Clés `localStorage` `dromap-editor-test-*`, `dromap-p1-*`, clés suffixées `v1`/`v2`/`v3` : conservées pour relire les bibliothèques, préférences, conversations et projets existants.
- `dromap-product-p0-v1` et base IndexedDB `dromap-product-p0` : conservées pour ne pas rendre les données locales existantes invisibles.
- Valeur de plan `tester` : conservée car elle participe aux contrats de compte, permissions, API et données Supabase.
- Noms de migrations Supabase datés, `p0` et `repair_v18_12` : conservés car ils constituent l’historique d’application de la base.
- Variables d’environnement historiques encore acceptées et code marqué `legacy` : conservés lorsqu’ils assurent explicitement une migration ou une compatibilité.
- `legacy` dans le mode autonome de l’éditeur et `LegacySaveLoadControls` : conservés car ils distinguent réellement la route autonome du runtime produit.
- `phase` dans l’Assistant IA et les imports guidés : conservé car il décrit un workflow multi-étapes toujours actif.
- `temporary` dans les variables de calcul/import : conservé car les valeurs sont réellement transitoires.
- `testMode` Stripe et clés `sk_test_` : conservés car ils décrivent le mode Stripe réel.
- `editor/debug-panel.tsx` / `DebugPanel` : conservés ; le fichier est un stub inutilisé et le renommer sans fonction réelle serait arbitraire. Sa suppression relève d’un nettoyage de code mort, hors périmètre.
- Textes visibles contenant « test » : conservés conformément à l’interdiction de modifier les textes ou l’apparence.
- Routes publiques, routes API, formats JSON, clés de snapshots, paramètres Stripe, schémas Supabase et URLs de redirection : inchangés.

## Vérifications

- Recherche globale des anciens imports `@/app/editor/test/*`, `../app/editor/test/*` et `@/stores/editor-test-*` : aucune occurrence restante.
- Recherche globale des anciens symboles `EditorTest*`, `useEditorTest*` et `TestMap*` : aucune occurrence restante.
- Recherche des anciens événements `dromap:p1-open-project-info` et `dromap:p1-start-tour` : aucune occurrence restante.
- Vérification de collision de casse/nom dans `editor/` : aucune collision.
- `git diff --check` : aucune erreur d’espace ou de patch.
- `pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation` exécuté avec succès.
- `pnpm build` exécuté avec succès : compilation, contrôle TypeScript et génération des 54 pages terminés.

## Corrections complémentaires validées

- Favicon DroMap déplacé vers `public/favicon.ico` et déclaré avec une URL versionnée pour invalider l’ancien cache Vercel.
- Résumé de publication complété avec les valeurs contractuelles par défaut manquantes.
- Ancien bouton de compte de test redirigé vers l’inscription au lieu d’appeler une action Zustand supprimée.
- Quatre handlers de curseur de la légende adaptés à la signature React sans changer l’enregistrement de l’historique.
