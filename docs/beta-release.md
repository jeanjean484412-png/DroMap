# Mode bêta DroMap

Un seul projet Vercel et une seule base Supabase. Aucun nouveau type de compte.

## Réglage

`NEXT_PUBLIC_DROMAP_RELEASE_MODE=beta` active la bêta au moment de la compilation.
Sans cette variable, le comportement complet reste actif. Après un changement,
redémarrer le serveur local ou reconstruire le déploiement Vercel.

En local, pour examiner la bêta dans PowerShell :

```powershell
$env:NEXT_PUBLIC_DROMAP_RELEASE_MODE = "beta"
npm run dev
```

Après Ctrl+C, revenir au mode complet :

```powershell
Remove-Item Env:NEXT_PUBLIC_DROMAP_RELEASE_MODE
npm run dev
```

Ne pas enregistrer ce réglage dans `.env.local` si le mode complet doit rester le défaut local.

## Comportements

- Messages bêta sur l’accueil et les pages de gestion, retour Contact dans l’éditeur.
- IA désactivée dans l’interface et sur son API ; achats refusés par le serveur.
- Trois projets actifs : création, duplication, import et restauration comptent dans cette limite.
- Les projets existants au-delà de la limite restent accessibles et modifiables.
- Le mode complet conserve ses règles de compte existantes.
- Les suppressions faites dans la bêta reçoivent une échéance individuelle d’une heure.
- Les anciennes suppressions et les suppressions en mode complet gardent dix jours.
- Un changement de mode ne remet pas à zéro les échéances déjà attribuées.

## Base partagée

La migration `20261102203608_dromap_beta_release.sql` est additive. Elle ne purge
aucun projet lors de son installation. Le nouvel appel de sauvegarde bêta est
réservé au serveur et sérialise les sauvegardes bêta d’un même propriétaire.
Le nettoyage des corbeilles bêta passe chaque minute. L’ancienne tâche reste en place.
Les contrôles d’identité et la mesure de la taille des données restent dans l’API.

Les données sont partagées : modifier ou supprimer une carte depuis un mode
agit sur cette même carte dans l’autre. Le mode local complet n’est pas un bac
à sable de données. Ne pas exposer un serveur complet non protégé aux testeurs.

## Contact

Le formulaire commun aux deux modes utilise `DROMAP_SMTP_USER` et
`DROMAP_SMTP_PASSWORD`, exclusivement côté serveur. Les secrets sont nécessaires
sur chaque environnement Vercel qui doit recevoir des retours. Un redéploiement
est nécessaire après leur ajout. Ne jamais les committer ni les afficher dans un rapport.

## Mise en ligne et retour au mode complet

Vérifier les deux modes, puis configurer le mode bêta pour l’environnement
Vercel destiné aux testeurs et déployer le code validé. Pour revenir au mode
complet, retirer la variable et reconstruire. Conserver la migration et les
échéances existantes : ne pas supprimer des colonnes ou des données pour changer de mode.

La copie avant bêta reste dans Téléchargements. Une copie du code ne constitue
pas une sauvegarde des cartes Supabase.
