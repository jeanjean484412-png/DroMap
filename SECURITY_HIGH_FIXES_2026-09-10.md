# Correctifs de sécurité élevés — 10 septembre 2026

Modifications locales directes, sans ZIP. Les vérifications locales ne constituent pas une attestation de la configuration de production.

## Constats réanalysés et correctifs

1. **Dépendances vulnérables.** Mise à jour ciblée des dépendances transitives concernées en respectant les plages du projet. L'audit du lockfile après installation ne signale plus de vulnérabilité connue, toutes gravités confondues.
2. **API IA accessible sans contrôle serveur.** Authentification Supabase et droit Plus/Pro/tester vérifiés avant traitement. Limite technique de 30 requêtes par minute et par compte, partagée entre instances via une opération PostgreSQL atomique. L'import URL possède un compteur indépendant et exige un compte, conformément à l'accès aux données GeoJSON. L'indisponibilité de la vérification bloque la requête.
3. **Récupération du mot de passe falsifiable.** Le cookie booléen est remplacé par le JWT Supabase. Il doit correspondre à la session courante, être revérifié auprès de Supabase et porter une preuve OTP/recovery de moins de dix minutes. Le flux implicite Supabase utilise `otp`, le flux PKCE peut utiliser `recovery`. Une session par mot de passe avec `purpose=recovery` n'est plus acceptée. Les anciens cookies `1` ne donnent aucun droit.
4. **XSS par SVG dessiné enregistré.** Sanitation DOMPurify avant insertion dans le DOM. Scripts, événements, HTML embarqué et références externes retirés. Les formes, textes et références internes des hachures sont conservés.
5. **SSRF de l'import GeoJSON.** Contrôle des plages IP avec prise en compte des IPv6 mappées, puis connexion à l'adresse DNS déjà validée en conservant Host/SNI et la vérification TLS. Redirections refusées. Lecture limitée à 25 Mo pendant le transfert et la décompression, y compris sans Content-Length.
6. **Divulgation des données privées dans les copies publiques.** Projection des seuls champs cartographiques nécessaires. La discussion IA et les métadonnées privées du projet ne sont plus copiées. Les nouvelles publications sont filtrées avant écriture ; les anciennes sont aussi filtrées à chaque lecture via les API. Les sauvegardes privées originales ne sont pas réécrites. Limite de décodage des sources publiques : 64 Mo.
7. **Droit d'export accordé à un projet arbitraire.** Le serveur attribue un nouvel identifiant aléatoire et signe une preuve liée au compte, à la publication et à cet identifiant. La finalisation exige cette preuve. Un `projectId` existant sans rapport avec la copie ne peut plus recevoir le droit par cette route. Les copies déjà autorisées gardent leurs droits.
8. **Rejeu des confirmations Stripe.** Reçu de session Checkout et mise à jour du droit dans une même transaction. Un même paiement ne remet plus le verrou à zéro. Un nouvel achat réel conserve le comportement prévu. Les événements anciens ne remplacent pas un achat plus récent. Les achats présents sont pris en compte à l'installation de la migration.
9. **Cache de projets non cloisonné.** Clés IndexedDB par compte, vérification du propriétaire à la lecture, migration des entrées anciennes dont le propriétaire est identifiable et purge du cache attribué au compte à la déconnexion. Les opérations retardées sont contrôlées. Les transferts de projets portent aussi le propriétaire attendu, vérifié côté serveur pour empêcher une sauvegarde de A avec la session de B.

## Activation en production — indispensable

1. Exécuter **uniquement** `supabase/migrations/20260910_dromap_security_hardening.sql` dans la base Supabase du projet, après les migrations DroMap déjà utilisées pour la facturation et les publications. Le fichier est transactionnel et peut être réexécuté.
2. Déployer le code et son `pnpm-lock.yaml`, avec une installation figée (`pnpm install --frozen-lockfile`). Conserver les variables serveur Supabase existantes. Aucun nouveau secret ni changement de prix Stripe n'est demandé.
3. Vérifier en environnement de recette la récupération par email, une demande IA avec compte autorisé, une copie de publication achetée et un paiement Stripe de test avec réémission du même événement.

La migration et le déploiement de production **n'ont pas été exécutés par cet agent**. Si le nouveau code est déployé avant la migration, l'IA et la finalisation des nouveaux achats Max échouent de manière contrôlée ; les webhooks Stripe renvoient une erreur pour permettre leur réessai. Les protections atomiques ne doivent donc pas être annoncées comme actives en production avant cette installation.

Les données privées présentes dans d'anciens fragments publics restent stockées en base, mais les routes les filtrent avant transmission. La migration réaffirme l'interdiction de lire directement ces fragments avec les rôles `anon`/`authenticated`. Un nettoyage physique éventuel de ces anciennes données nécessite une opération séparée ; rien de ce qui aurait déjà été téléchargé ne peut être rappelé.

## Vérifications

- Tests Node : récupération falsifiée/expirée, garde IA, sanitation SVG, IP interdites, rebinding DNS simulé, redirections, flux surdimensionnés, gzip, données publiques filtrées, preuve de copie et cache multicomptes.
- La migration est exécutée dans PostgreSQL local via PGlite : rejeu, ordre des achats, rollback, limite concurrente et interdiction des RPC aux rôles navigateur.
- Les tests d'images du lot critique restent inclus.
- Résultats finaux du 11 septembre 2026 : **38 tests réussis, aucun échec**.
- `pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation` : réussi.
- `pnpm build` : réussi, 53 pages générées.
- Lint ciblé : aucune erreur ; deux avertissements préexistants de symboles inutilisés (`normalizeFreeResearchPlan` et `DromapPublicationAccessMode`).
- `pnpm audit --json` sur le lockfile installé : aucune vulnérabilité connue signalée, toutes gravités confondues.
- Contrôles HTTP sur le serveur local de production : accueil, logo et éditeur en 200 ; `/editor/test` redirige en 308 vers `/editor` ; IA, import GeoJSON et modification du mot de passe refusent les requêtes anonymes en 401.

Les services externes sont simulés dans les tests d'écriture : aucun paiement réel, aucun changement de mot de passe réel et aucune écriture de recette dans Supabase de production.

## Limites

Ce lot traite les constats élevés identifiés et les alertes de dépendances. Il ne remplace pas la vérification des paramètres réels de Supabase/Vercel/Stripe, ni les corrections des autres points de l'audit. Les données cartographiques choisies pour la publication restent publiques ; le cache navigateur n'est pas un stockage chiffré contre une personne disposant d'un accès au profil du navigateur. Les entrées de cache historiques sans propriétaire identifiable ne sont pas exposées par le lecteur du cache, et ne sont pas supprimées automatiquement afin de préserver d'éventuel travail non synchronisé.

Références : [AMR du flux Supabase implicite](https://github.com/supabase/auth/blob/master/internal/api/verify.go), [JWT Supabase](https://supabase.com/docs/guides/auth/jwts), [DOMPurify](https://github.com/cure53/DOMPurify), [mises à jour pnpm](https://pnpm.io/cli/update).
