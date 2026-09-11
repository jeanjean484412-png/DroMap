# Correctifs des constats moyens — 11 septembre 2026

Les changements sont appliqués aux fichiers locaux. Aucune migration ni mise en ligne de production n'a été exécutée.

## Correspondance avec l'audit initial

- **7 — Cloisonnement local :** déjà traité dans le lot précédent (cache par propriétaire, purge et sauvegardes liées au compte). Les tests de non-régression restent inclus.
- **8 — Droits de copie et rejeu des paiements :** déjà traités dans le lot précédent. Leurs tests PostgreSQL et applicatifs restent inclus. La migration du 10 septembre reste nécessaire.
- **14 — Entrées et volumes :** les 40 fichiers de routes API passent par une garde commune. Les corps sont limités pendant leur lecture, avant JSON/multipart, même sans `Content-Length`. Délai de lecture maximal de 30 secondes. Les requêtes JSON exigent `application/json`, le contact exige `multipart/form-data`. Le corps signé du webhook est conservé octet pour octet. Le téléchargement geoBoundaries garde son plafond de 300 Mio, vérifié sur le flux, et son délai reste actif pendant le transfert ; les redirections sont vérifiées une à une. La publication modifiable est bornée côté navigateur à 64 Mio avant et après décompression, avec un maximum de 128 fragments. La taille des sauvegardes de projets et bibliothèques est recalculée sur leurs fragments réels et leur contenu décompressé, avec une limite technique de 512 Mio. Une nouvelle migration compte atomiquement le stockage privé, y compris les révisions en cours et les métadonnées des projets.
- **16 — Pièces jointes :** contrôle des signatures et décodage réel pour PNG/JPEG/WebP ; limites de pixels et de durée. Vérification du conteneur PDF. Les fichiers texte sont contrôlés comme UTF-8, sans octets de contrôle binaires, et les JSON sont parsés. Le MIME envoyé par SMTP est déterminé par le serveur et ne reprend plus une chaîne arbitraire du client. Les formats et images publiées du lot critique restent protégés.
- **11 — Tentatives de connexion :** compteur PostgreSQL atomique pour connexion, inscription et récupération, avec limites indépendantes par identité et réseau. Un stockage de sécurité indisponible renvoie 503, sans repli permissif. Les emails/IP ne sont pas enregistrés en clair dans les compteurs : clés HMAC et nettoyage des fenêtres expirées.
- **9 — Cookies et CSRF :** contrôle d'origine sur les mutations, y compris connexion/adoption, et sur la lecture de session susceptible de renouveler les cookies. Les requêtes intersites et de sous-domaines sont refusées. Le webhook Stripe est exempté de ce contrôle navigateur et conserve sa vérification de signature. Les clients non navigateur sans Origin restent compatibles. Les réponses privées sont explicitement non mises en cache. Les attributs HttpOnly/Secure/SameSite existants sont conservés. Les redirections de connexion/inscription rejettent aussi les antislashs et caractères de contrôle.
- **18 — En-têtes :** CSP exécutoire pour `object-src`, `base-uri`, `frame-ancestors` et `form-action` ; anti-encadrement SAMEORIGIN ; nosniff ; politique de référent ; restrictions des permissions inutilisées ; suppression de X-Powered-By. La CSP des scripts est **Report-Only**, conformément à la phase d'observation recommandée par l'audit, et ne bloque pas encore les scripts inline.

Le contact bénéficie aussi du compteur distribué, en complément de son honeypot existant. Les modules REST serveur possèdent maintenant une frontière `server-only` explicite.

## Seuils techniques retenus

- Connexion : 10 tentatives par email et 60 par réseau sur 10 minutes.
- Inscription : 3 par email et 15 par réseau par heure.
- Récupération : 3 par email et 20 par réseau par heure.
- Contact : 5 par identité et 10 par réseau sur 10 minutes.
- Corps des routes : 64 Kio par défaut ; 256 Kio pour un manifeste projet ; 2 710 000 octets par transfert de fragment ; 4 Mio pour contact, IA et recherche de noms de bâtiments ; 5 Mio pour publication ; 1 Mio pour webhook.
- Stockage privé : **2 Gio par compte**, toutes révisions confondues, avec au maximum 10 000 fragments et 10 000 manifestes. Ce plafond de capacité est indépendant des formules commerciales. Il faut garder de la place pour la copie temporaire d'une sauvegarde. Un administrateur peut adapter `byte_limit` et `chunk_limit` dans `dromap_storage_usage` pour un compte ; les utilisateurs ne peuvent pas les modifier.
- Les compteurs de stockage utilisent les octets des fragments Base64 et des manifestes JSON, et non l'espace disque physique PostgreSQL. L'écran d'utilisation affiche maintenant cette mesure contrôlée, incluant les transferts en attente, au lieu d'une taille déclarée par le client.

Les données existantes sont initialement comptées, sans suppression. Un compte déjà au-dessus de la capacité garde ses données et peut réduire/supprimer des contenus. La migration prend un verrou d'écriture temporaire sur les tables concernées pendant l'initialisation des compteurs : prévoir son application à un moment de faible activité si elles sont volumineuses.

Sur Vercel, seule l'IP de `x-vercel-forwarded-for`, réécrite par la plateforme, est utilisée. Hors Vercel, le réseau utilise un compteur partagé `unattributed` : une configuration d'entrée réseau de confiance doit être définie avant un hébergement différent, afin d'éviter de limiter collectivement les visiteurs. Un `x-forwarded-for` librement fourni n'est pas accepté comme identité réseau.

## Activation ultérieure

Quand les corrections seront prêtes à être mises en ligne :

1. Appliquer les migrations DroMap de base déjà requises par le projet.
2. Appliquer `supabase/migrations/20260910_dromap_security_hardening.sql` si ce n'est pas déjà fait.
3. Appliquer `supabase/migrations/20260911_dromap_medium_security.sql`.
4. Déployer le code et le lockfile.
5. Vérifier avec des comptes de recette : connexion, récupération, contact, sauvegarde/conflit, bibliothèque, copie et paiement de test.

Les migrations sont transactionnelles et testées en réexécution. Sans la nouvelle migration, les parcours de connexion/inscription/récupération/contact et le calcul de stockage ne pourront pas utiliser les nouveaux contrôles. Ne pas déployer cette version avant l'installation SQL.

## Vérifications et limites

Résultats finaux : **59 tests réussis**, TypeScript (`pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation`) réussi, `pnpm build` réussi (53 pages), audit pnpm sans vulnérabilité connue signalée. Lint ciblé sans erreur, avec deux avertissements préexistants (`normalizeFreeResearchPlan` et `NOMINATIM_USER_AGENT`).

Les 11 contrôles HTTP locaux passent : accueil/éditeur/logo en 200 ; ancienne URL en 308 ; origine étrangère en 403 ; mauvais type de contenu en 415 ; corps trop volumineux en 413 ; accès anonyme sensible en 401. Une requête de même origine atteint correctement la validation du formulaire. Le contrôle tient compte du Host reçu lorsque Next.js reconstruit une URL interne différente. Les réponses de contenu portent les en-têtes de sécurité ; la redirection historique ne les porte pas elle-même, sa destination les porte.

Tests automatisés : scénarios CSRF, corps surdimensionnés et lents, webhook intact, limites d'authentification, provenance réseau, pièces jointes déguisées, décompression excessive, mesure UTF-8/gzip, redirections geoBoundaries et retours locaux. PostgreSQL/PGlite vérifie l'expiration et la concurrence des compteurs, l'isolation RLS, les quotas, les upserts, la réexécution et les cascades de suppression. Les anciens tests critiques/élevés sont conservés. Les écritures externes sont simulées.

La politique CSP de scripts nécessite encore une recette navigateur complète puis une configuration exécutoire adaptée ; les violations Report-Only apparaissent dans les outils du navigateur et aucun collecteur distant n'a été créé. Le lot faible ultérieur réduit le cookie de renouvellement de 180 à 30 jours (voir `SECURITY_LOW_FIXES_2026-09-11.md`) : rotation, révocation et expiration réelles des sessions Supabase restent à vérifier dans le service. Ces paramètres extérieurs ne sont pas déclarés sécurisés sur la seule base du code.

Les contrôles PDF ne constituent ni un antivirus ni une suppression des scripts PDF. Une pièce jointe reconnue comme PDF peut encore être malveillante pour un lecteur vulnérable. Les fichiers texte transmis au support ne sont pas réécrits (notamment les CSV).

Le quota couvre les projets privés et leurs métadonnées ainsi que les fragments de bibliothèque personnelle. Il ne constitue pas un plafond global de toute la base (publications, Auth, journaux, etc.), ni une protection contre la création distribuée d'un grand nombre de comptes. Les seuils Supabase, la protection anti-robots de production et les budgets globaux d'infrastructure restent à vérifier extérieurement.

Références techniques : [Vercel — en-têtes de requête](https://vercel.com/docs/headers/request-headers), [Next.js — en-têtes HTTP](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers).
