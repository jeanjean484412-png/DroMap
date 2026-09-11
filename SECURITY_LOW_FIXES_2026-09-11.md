# Constats faibles : corrections et points restant ouverts

## Corrections locales

- Les écritures du résumé de compte/projets dans IndexedDB portent désormais une génération. Une ouverture de base retardée ne peut plus écraser un état plus récent (notamment l'état déconnecté) avec les anciennes données du compte. La déconnexion attend aussi la tentative d'enregistrement de cet état avant de terminer la purge du cache attribué au propriétaire.
- Le cookie de renouvellement passe de 180 à **30 jours glissants**. HttpOnly, Secure en production et SameSite=Lax sont conservés. La nouvelle durée prend effet à la prochaine émission/actualisation du cookie après déploiement ; les anciens cookies déjà émis ne sont pas supprimés à distance par ce changement. L'expiration absolue, la rotation et la révocation côté Supabase restent distinctes et doivent être vérifiées dans le service.
- L'audit actuel du lockfile ne signale aucune vulnérabilité connue, y compris faible. Aucune nouvelle dépendance n'a été ajoutée pour ce lot.

## Point 5 de l'audit : stockage local non chiffré — reste ouvert

Les protections de cache par propriétaire et de purge réduisent l'exposition entre comptes. Elles ne chiffrent pas IndexedDB/localStorage. JSON, Base64 et gzip ne constituent pas du chiffrement.

Le navigateur conserve des projets et bibliothèques pour le fonctionnement hors ligne. Les bibliothèques locales et les entrées historiques sans propriétaire identifiable ne sont pas supprimées arbitrairement : elles peuvent contenir du travail non synchronisé. Un accès au profil navigateur, à sa sauvegarde ou du JavaScript exécuté dans l'origine peuvent encore exposer des données locales. Les échecs du stockage restent possibles ; une tentative de purge ne garantit pas l'effacement physique des données sur le disque.

Un chiffrement utile contre la copie du profil navigateur exige une clé qui ne soit pas simplement conservée à côté des données. Deux conceptions possibles nécessitent un choix de fonctionnement :

- un coffre déverrouillé par un mot de passe distinct, avec procédure de récupération et accès hors ligne après déverrouillage ;
- une clé obtenue après authentification auprès du serveur, avec limitation de l'accès hors ligne quand la clé n'est plus en mémoire.

Aucun de ces changements de parcours n'a été ajouté implicitement. Le chiffrement des disques/sauvegardes Supabase et du poste reste impossible à vérifier avec les éléments fournis. Ce lot ne doit donc pas être présenté comme une fermeture complète de tous les constats faibles.

## Vérifications

Le test de confidentialité retarde volontairement l'ouverture IndexedDB contenant les anciennes données privées jusqu'après l'écriture de l'état déconnecté, puis vérifie le contenu réel en base. Le test de cookie vérifie sa durée, ses attributs et sa suppression. La suite complète atteint 61 tests réussis. L'audit pnpm ne rapporte aucune alerte connue.

- `pnpm test:security` : 61 tests réussis, aucun échec.
- `pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation` : réussi.
- `pnpm build` : réussi, 53 pages générées.
- ESLint ciblé sur les quatre fichiers de code/tests de ce lot : aucune erreur ni avertissement.
- `pnpm audit --json` : aucune vulnérabilité connue signalée, toutes gravités confondues. Ce résultat ne prouve pas l'absence de vulnérabilités inconnues.

Pas de nouvelle migration SQL pour ce lot. Les migrations des 10 et 11 septembre des lots précédents restent à appliquer avant le futur déploiement. Aucune modification de production effectuée.
