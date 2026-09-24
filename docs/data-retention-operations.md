# Conservation et suppression — mise en service

État au 17 septembre 2026. Ce document définit les opérations à configurer ; il
ne prouve pas leur activation sur les comptes des prestataires.

## Déploiement

1. Déployer le code : mesure d'audience uniquement après acceptation ; refus et
   acceptation mémorisés 180 jours, retrait par le bouton Confidentialité.
2. Appliquer `supabase/migrations/20260917_dromap_retention.sql` après les anciennes
   migrations. Contrôler les deux jobs dans `cron.job` puis leurs résultats dans
   `cron.job_run_details`. Un push Vercel n'applique pas une migration Supabase.
3. Vérifier en préproduction la suppression d'un compte de test : profil,
   projets, morceaux, bibliothèque, publications, droits et sessions. Les clés
   étrangères du dépôt utilisent ON DELETE CASCADE ; vérifier aussi le schéma réel.
   Contrôler séparément la fin des abonnements Stripe avant suppression : effacer
   le compte Supabase ne résilie pas un abonnement Stripe.

## Calendrier de conservation

- Comptes actifs : durée du service ; effacement à la demande via Mon compte.
- Comptes inactifs : revue mensuelle après 3 ans sans activité. Ce seuil est un
  choix DroMap, pas un délai légal universel. Consulter la vue privée
  `public.dromap_inactive_accounts_review`. Vérifier les connexions et activités
  récentes, informer l'utilisateur et lui laisser 30 jours pour conserver ou
  exporter ses données. Réévaluer l'activité juste avant toute suppression via
  l'API Admin Supabase. Ne pas effacer un accès acheté ou un abonnement sur le seul
  motif d'inactivité ; documenter le motif et la date de prochaine revue (annuelle).
  Cette revue et les notifications sont des opérations manuelles à organiser.
- Corbeille : 10 jours, puis purge quotidienne (délai technique maximal : 24 h).
- Anciennes révisions et morceaux orphelins : 24 h de marge, puis purge quotidienne.
- Limitation anti-abus : fenêtre expirée, puis purge quotidienne ; compteurs IA et
  GeoJSON : 24 h, puis purge quotidienne. Ce ne sont pas les journaux des hébergeurs.
- Support Infomaniak : 24 mois après clôture / dernier échange ; revue mensuelle
  de réception, messages envoyés, pièces jointes et corbeille. Archiver séparément
  uniquement les éléments nécessaires à un litige, avec échéance et accès restreint.
- Pièces comptables et justificatifs : 10 ans depuis la clôture de l'exercice.
  Exporter et archiver les factures nécessaires ; la présence d'un compte Stripe
  n'est pas une politique d'archivage. Ne pas conserver toute la carte pour ce motif.
- Projet invité : stockage local à la demande de l'utilisateur, supprimable dans
  l'application ou par l'effacement des données du site. Ne pas effacer silencieusement
  sa seule copie sur la base d'une durée arbitraire.

## Points à vérifier dans les consoles externes

- Supabase : région, sauvegardes/PITR, durée effective d'expiration, suppression
  des sauvegardes exportées, journaux et contrats. Une restauration ne doit pas
  remettre en service des comptes déjà effacés : rejouer les demandes d'effacement.
- Vercel : durée réelle des événements Analytics (viser au plus 25 mois), logs,
  éventuels drains et destinataires. L'identifiant journalier Analytics de 24 h
  n'est pas la durée de conservation de tous les événements.
- Infomaniak : activer/organiser la purge et inclure sauvegardes et pièces jointes.
- OpenAI API : vérifier le contrat et les durées selon l'offre effectivement utilisée. Les appels DroMap utilisent `store: false` ; contrôler séparément les journaux et les éventuelles fonctions de recherche web.
- Les demandes RGPD sont traitées sous un mois en principe ; les prolongations
  prévues par le RGPD doivent être justifiées et annoncées dans ce premier mois.

## Sources

- https://www.cnil.fr/fr/passer-laction/les-durees-de-conservation-des-donnees
- https://www.cnil.fr/fr/achat-de-contenus-numeriques-quelle-duree-de-conservation-des-comptes-inactifs
- https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi
- https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience
- https://vercel.com/docs/analytics/privacy-policy
- https://www.service-public.gouv.fr/entreprendre/vosdroits/F10029
