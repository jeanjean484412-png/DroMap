# DroMap — document de contextualisation pour reprendre dans une nouvelle discussion

Date : 14 septembre 2026  
Projet local : `C:\Users\asson\dromap`  
Branche Git active au moment de la rédaction : `main`  
Dernier commit : `b4ff9e8` — `Autoriser le mode pre-lancement sans infos juridiques`

Ce document sert de point de reprise. Il décrit les modifications réellement présentes dans le dépôt, les incidents rencontrés pendant le déploiement, les actions qui restent externes au code et les précautions à conserver. **Ne jamais y ajouter de clé, de mot de passe, de jeton ou de valeur de variable d’environnement.**

## Situation produit et déploiement

DroMap est une application Next.js 16 / React 19 hébergée sur Vercel, avec :

- Supabase pour les comptes, les données et les politiques d’accès ;
- Stripe pour les abonnements et l’achat de carte ;
- un éditeur cartographique dont le code est dans `editor/` ;
- le nom de domaine acheté chez Infomaniak : `dromap.fr`.

Le projet a été mis en ligne sur Vercel. L’URL Vercel temporaire de type `*.vercel.app` est normale ; le domaine personnalisé doit être ajouté dans **Vercel > Settings > Domains**, puis relié dans la zone DNS Infomaniak avec les valeurs exactes affichées par Vercel. Ne pas supprimer les enregistrements de messagerie Infomaniak (MX, DKIM, DMARC, SRV, etc.).

Le déploiement de production doit provenir de la branche `main`. Une branche Git est une ligne de travail parallèle ; elle ne crée pas deux copies durables de l’application une fois fusionnée dans `main`. Les fichiers à publier ont été fusionnés dans `main` avant ce point de reprise.

## Corrections structurelles et d’image de marque effectuées

### Dossier `/editor/test`

Le dossier moteur précédemment situé dans `app/editor/test/` a été renommé vers `editor/`. Les imports, exports, types et stores ont été adaptés. C’était un renommage structurel : aucun comportement de l’éditeur ne devait changer.

- La vraie route de l’éditeur est maintenant `/editor`, servie par `app/editor/page.tsx`.
- L’ancienne URL publique `/editor/test` est volontairement conservée sous forme de **redirection permanente 308** vers `/editor` dans `next.config.ts`.
- Il ne doit donc plus exister de dossier source `app/editor/test` dans l’état actuel du projet. Si un explorateur affiche encore un ancien dossier, actualiser l’explorateur ou vérifier que l’on est bien sur la branche `main` à jour.

Les anciens noms `EditorTest*`, `useEditorTest*`, `TestMap` et les chemins d’import `app/editor/test` ont été remplacés. En revanche, certaines clés de stockage local comportant encore `test`, `p0` ou une version (`v1`, `v2`, `v3`) sont conservées : elles permettent de relire les projets et préférences déjà créés dans le navigateur.

### Icône de navigateur

L’icône DroMap a été ajoutée/déclarée afin de remplacer l’icône Vercel :

- `public/favicon.ico`
- `app/icon.png`
- `app/apple-icon.png`
- `app/manifest.ts`
- métadonnées de `app/layout.tsx`

Le favicon est versionné (`/favicon.ico?v=20260910`) pour contourner le cache. Si un navigateur montre encore l’ancienne icône, effectuer un rechargement forcé ou fermer/réouvrir l’onglet ; les favicons sont souvent très fortement mis en cache.

### Interface et mobile

Une étape de responsive a été engagée sur la navigation et les pages publiques : navigation mobile, colonnes repliables, espacements adaptés et CTA mobile sur la landing lorsque pertinent. Aucun CTA fixe n’a été ajouté dans l’éditeur. Toute nouvelle modification visuelle doit être testée à 360, 390 et 430 px de large.

## Sécurité — travaux réalisés dans le code

Un audit complet a été mené, puis les constats critiques, élevés, moyens et faibles ont été réanalysés et traités dans le dépôt. Les rapports détaillés déjà présents sont :

- `SECURITY_HIGH_FIXES_2026-09-10.md`
- `SECURITY_MEDIUM_FIXES_2026-09-11.md`
- `SECURITY_LOW_FIXES_2026-09-11.md`

### Correctifs importants intégrés

- Vérification serveur de l’authentification Supabase sur les routes sensibles.
- Contrôles de propriétaire pour empêcher de remplacer un `user_id`, `project_id` ou identifiant de publication afin d’accéder aux données d’un autre compte.
- Cloisonnement du cache IndexedDB par utilisateur et purge à la déconnexion.
- Protection du flux IA : compte autorisé, droits de plan, quota atomique et refus sécurisé si le contrôle est indisponible.
- Anti-abus distribué pour connexion, inscription, récupération du mot de passe et contact.
- Contrôle CSRF/origine sur les mutations navigateur et réponses privées marquées non-cacheables.
- Limites de taille, de délai et de type de contenu pour les corps API, imports et pièces jointes.
- Réduction des risques SSRF sur l’import GeoJSON (IP privées, rebinding DNS, redirections, taille et compression).
- Sanitation des SVG/HTML de marqueurs pour réduire le risque XSS.
- Filtrage des données privées avant publication/copie publique.
- Preuve liée au compte et à la publication pour les copies achetées ; protection contre le rejeu Stripe.
- En-têtes HTTP de sécurité et suppression de `X-Powered-By`.
- Cookie de renouvellement ramené à 30 jours glissants, avec `HttpOnly`, `Secure` en production et `SameSite=Lax`.
- Mise à jour du lockfile ; l’audit pnpm réalisé lors des correctifs ne signalait plus de vulnérabilité connue.

### Vérifications déjà réalisées localement

Au moment des lots de sécurité :

- `pnpm test:security` : 61 tests réussis, aucun échec ;
- `pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation` : réussi ;
- `pnpm build` : réussi (53 pages générées à ce moment-là) ;
- `pnpm audit --json` : aucune vulnérabilité connue signalée ;
- tests de migration PostgreSQL via PGlite, tests de CSRF, limites, quotas, isolation de compte, SVG, SSRF, publication, Stripe et cache local.

Ces résultats sont des vérifications locales au moment où elles ont été exécutées. Après une modification ultérieure, relancer au minimum :

```powershell
pnpm test:security
pnpm exec tsc -p tsconfig.json --noEmit --pretty false --noErrorTruncation
pnpm build
```

### Limite connue volontairement non résolue

Le stockage local du navigateur (IndexedDB/localStorage) n’est pas chiffré contre une personne ayant accès au profil du navigateur ou au disque. Le cloisonnement et la purge réduisent l’exposition entre comptes, mais ne constituent pas du chiffrement.

Le corriger proprement demanderait un choix fonctionnel explicite : coffre chiffré avec mot de passe distinct, ou clé fournie après connexion avec impact sur le mode hors-ligne. Ce changement n’a pas été imposé car il modifierait l’expérience produit.

## Migrations Supabase indispensables

Les protections de sécurité au niveau de la base reposent sur les migrations SQL suivantes :

1. `supabase/migrations/20260815_dromap_p0_accounts_projects.sql`
2. `supabase/migrations/20260816_dromap_p0_cloud_foundation.sql`
3. `supabase/migrations/20260816_dromap_p0_single_device.sql`
4. `supabase/migrations/20260816_dromap_p0_trash_lifecycle.sql`
5. `supabase/migrations/20260818_dromap_billing_stripe.sql`
6. `supabase/migrations/20260818_dromap_single_map_download_lock.sql`
7. `supabase/migrations/20260820_dromap_publications.sql`
8. `supabase/migrations/20260820_dromap_publications_repair_v18_12.sql`
9. `supabase/migrations/20260820_dromap_publication_permissions.sql`
10. `supabase/migrations/20260910_dromap_security_hardening.sql`
11. `supabase/migrations/20260911_dromap_medium_security.sql`

Les deux dernières sont essentielles aux protections récemment ajoutées. Elles doivent être exécutées dans **Supabase > SQL Editor**, dans cet ordre et après les migrations dont elles dépendent. Elles sont conçues pour être transactionnelles et testées en réexécution.

### Incident de connexion déjà rencontré

Le message :

> « Le service est momentanément indisponible. Réessaie dans quelques instants. »

vient de `lib/dromap/server/abuse-limit.ts`. Il apparaît volontairement (HTTP 503) lorsque le compteur anti-abus sécurisé ne peut pas utiliser Supabase. Les causes à vérifier sont :

- `SUPABASE_SECRET_KEY` ou l’ancien nom compatible `SUPABASE_SERVICE_ROLE_KEY` absent/invalide sur Vercel ;
- `NEXT_PUBLIC_SUPABASE_URL` ou la clé publique Supabase absent/invalide ;
- migration `20260911_dromap_medium_security.sql` non appliquée, donc RPC `dromap_take_abuse_request` introuvable ou inaccessible ;
- variables configurées dans le mauvais environnement Vercel.

Le symptôme a été signalé comme résolu par l’utilisateur après configuration. **Dans une prochaine discussion, ne pas désactiver la protection anti-abus pour “faire fonctionner” la connexion.** Si le problème revient, vérifier la configuration/migration ci-dessus, sans partager de secret dans le chat.

Test SQL sans donnée sensible, après migration :

```sql
select public.dromap_take_abuse_request(repeat('a', 64), 10, 600);
```

La requête doit retourner `true` la première fois.

## Variables Vercel/Supabase à vérifier, sans jamais coller leurs valeurs

### Nécessaires aux comptes Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (ou ancien nom compatible `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `SUPABASE_SECRET_KEY` (ou ancien nom compatible `SUPABASE_SERVICE_ROLE_KEY`) — **serveur uniquement, jamais préfixé par `NEXT_PUBLIC_`**

La clé `anon`/publishable Supabase est normale côté navigateur. La clé `service_role`/secret est sensible et ne doit jamais arriver dans le bundle navigateur.

### Nécessaires à Stripe

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_PLUS_MONTHLY`
- `STRIPE_PRICE_PLUS_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_SINGLE_MAP`
- le cas échéant `STRIPE_AUTOMATIC_TAX`
- la clé publique Stripe si le client Stripe du projet l’exige (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`)

Pour des paiements de test, utiliser exclusivement les clés et Price IDs Stripe de **mode test** (`sk_test_…`, `pk_test_…`) dans Vercel, puis redéployer. Carte test classique : `4242 4242 4242 4242`, date future, CVC à trois chiffres, code postal quelconque. Aucun argent réel n’est prélevé avec les clés de test. Vérifier le résultat dans le tableau de bord Stripe en mode test, puis configurer séparément les clés live avant tout vrai encaissement.

### URL et juridique

- `NEXT_PUBLIC_DROMAP_SITE_URL=https://dromap.fr` quand le domaine est prêt ;
- `DROMAP_ALLOW_INCOMPLETE_LEGAL_IN_PRODUCTION=true` a été ajouté temporairement sur Vercel afin d’autoriser le pré-lancement sans informations juridiques complètes.

Le dernier point contourne intentionnellement le blocage de build dans `lib/dromap/server/legal.ts`. Il doit être retiré et remplacé par les vraies informations lorsque l’entreprise est prête à être publiquement exploitée : `DROMAP_LEGAL_NAME`, `DROMAP_LEGAL_FORM`, `DROMAP_LEGAL_ADDRESS`, `DROMAP_LEGAL_REGISTRATION`, `DROMAP_LEGAL_PHONE`, `DROMAP_MEDIATOR_NAME`, `DROMAP_MEDIATOR_ADDRESS`, `DROMAP_MEDIATOR_URL` (et éventuellement TVA).

## Vercel, domaine et accès des amis

1. Dans Vercel, ouvrir le projet DroMap, puis **Settings > Domains**.
2. Ajouter `dromap.fr`, puis `www.dromap.fr` si souhaité.
3. Vercel affiche exactement les enregistrements DNS nécessaires. Les reproduire dans Infomaniak, sans modifier les enregistrements email existants.
4. Définir `dromap.fr` comme domaine principal dans Vercel quand la vérification est terminée.
5. Mettre `NEXT_PUBLIC_DROMAP_SITE_URL=https://dromap.fr` dans les variables Vercel de production et redéployer.
6. Si les amis voient une page de connexion Vercel au lieu de DroMap, vérifier **Vercel > Settings > Deployment Protection** : la protection doit autoriser les visiteurs de production, sinon seul le propriétaire Vercel peut accéder au site.

La propagation DNS peut prendre de quelques minutes à 24/48 h selon les caches, même si Vercel valide généralement assez vite.

## Git et secrets

`.env.local` est protégé par `.gitignore` (`.env*`). Les contrôles déjà faits ont montré qu’il n’était pas suivi par Git et qu’aucun historique Git ne le contenait. Pour revérifier dans PowerShell :

```powershell
git check-ignore -v .env.local
git ls-files --error-unmatch .env.local
git log --all -- .env.local
```

Le deuxième doit répondre que le chemin n’est pas connu de Git ; le troisième ne doit rien afficher. Ne jamais faire `git add -f .env.local` et ne jamais envoyer son contenu dans une discussion.

Avant une mise en ligne :

```powershell
git status
git add <fichiers-voulus>
git commit -m "Description du changement"
git push origin main
```

Vercel redéploie généralement automatiquement après le `git push` vers la branche de production configurée (`main`). Un bouton **Redeploy** ne peut publier que le commit déjà présent sur Vercel : il ne téléverse pas les changements non commités ou non poussés depuis le PC.

## Points de reprise recommandés pour le prochain agent

1. Commencer par `git status`, `git branch --show-current` et `git log --oneline -5` ; ne pas écraser un travail local existant.
2. Demander quel sujet est prioritaire : domaine, Stripe de test, fonctionnalité, responsive ou autre.
3. Pour tout incident de compte, vérifier d’abord les variables Vercel et les migrations Supabase ; ne pas affaiblir les contrôles de sécurité.
4. Pour une modification de code, relancer les tests de sécurité, TypeScript et build avant de conclure.
5. Ne jamais modifier les secrets, les prix Stripe, les politiques RLS Supabase ou les URLs publiques sans expliquer l’impact et préserver la compatibilité.

## Fichiers de référence rapide

- Configuration Next / en-têtes / redirection historique : `next.config.ts`
- Identité juridique et garde de pré-lancement : `lib/dromap/server/legal.ts`
- Auth Supabase et cookies : `lib/dromap/server/supabase-rest.ts`
- Limitation d’abus : `lib/dromap/server/abuse-limit.ts`
- RPC de sécurité Supabase : `lib/dromap/server/security-rpc.ts`
- Stripe serveur : `lib/dromap/server/stripe.ts`
- Migrations SQL : `supabase/migrations/`
- Rapports de sécurité : `SECURITY_*_FIXES_2026-09-*.md`
- Rapport de renommage : `DROMAP_STRUCTURAL_RENAMING_REPORT.md`

