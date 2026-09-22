# Recette du créateur de marqueurs — 21 septembre 2026

Périmètre : créateur Fabric, tutoriel des traits courbes, SVG des marqueurs dessinés.
Le parcours d’import et la bibliothèque générale n’ont pas été refondus.

## Vérifications dans le navigateur

Réalisées sur l’éditeur autonome existant `/editor`, sans modifier les droits des comptes.

- Création d’un cercle rouge, recherche du pictogramme Croix, insertion et couleur blanche.
- Déplacement, redimensionnement, centrage horizontal/vertical, rotation.
- Ctrl+Z / Ctrl+Y, Ctrl+D, suppression et déplacements précis au clavier.
- Maj-clic et cadre de sélection multiple ; groupement, déplacement, redimensionnement, rotation et dégroupement.
- Premier plan / arrière-plan : résultat visible dans le dessin et les aperçus.
- Texte modifié dans le panneau puis par double-clic sur le canevas ; synchronisation du contenu.
- Ligne à deux clics, tirets, flèche, polygone fermé par le premier point, dessin libre ; Échap annule la création en cours.
- Message d’erreur du marqueur vide.
- Enregistrement dans Mes marqueurs, réouverture, modification, mise à jour des marqueurs déjà placés.
- Fenêtres 1280 × 720, 1536 × 864 et 900 × 650 : canevas utilisable, panneaux défilants, enregistrement accessible.

Le copier-coller utilise le même modèle d’objets que la duplication. Le test des touches Ctrl+C / Ctrl+V a été limité par le presse-papiers virtuel du navigateur d’automatisation ; il ne faut pas le compter comme une validation manuelle de ces deux touches.

## Chaîne de rendu

Une compilation de production locale a également été testée : cercle, texte A1, pictogramme, sauvegarde, réouverture, pose sur la carte, légende, aperçu PNG puis téléchargement PNG haute qualité.
Le fichier téléchargé (3499 × 2470) a été ouvert et inspecté : texte lisible, couleurs, transparence du marqueur, proportions et positions cohérentes.
Le SVG du marqueur contient les chemins vectoriels et la police Geist embarquée ; aucun bitmap Fabric n’est enregistré.

## Vérifications automatisées

```sh
node --test tests/custom-marker-composition.test.mjs tests/curved-line.test.mjs
npx tsc --noEmit
pnpm build
```

ESLint vérifié sur tous les fichiers TypeScript/TSX modifiés par cette refonte.
Les tests couvrent notamment les anciens IDs/SVG, les imports inchangés, les groupes, le débordement du cadre, les alignements, les propriétés de texte, la transparence et la sécurité du SVG.

Aucun push Git ni déploiement Vercel effectué.
