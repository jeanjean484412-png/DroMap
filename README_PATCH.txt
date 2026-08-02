DroMap - Correctif sélection zone monde entier sur fonds classiques

Fichiers remplacés :
- lib/dromap/workspace-bounds.ts
- lib/dromap/workspace-validation.ts

Corrections :
1. Une sélection qui couvre plusieurs copies répétées du monde est ramenée à une seule fenêtre mondiale de 360°.
2. Lorsqu'une sélection mondiale atteint presque les bords nord/sud du Web Mercator, elle est aimantée sur l'étendue complète ±85.05112878°.
3. Les sélections globales très larges disposent d'une tolérance de ratio spécifique, sans assouplir les zones locales anormalement horizontales.
4. Les zones locales, pays, régions et sélections traversant l'antiméridien conservent le comportement existant.

Installation :
- Extraire le ZIP à la racine du projet DroMap.
- Accepter le remplacement des deux fichiers.
- Relancer pnpm dev puis recharger /editor/test avec Ctrl+F5.
