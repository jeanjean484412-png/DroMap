import type { Metadata } from "next";

import {
  DromapLegalPageShell,
  LegalCallout,
  LegalSection,
} from "@/components/dromap-product/legal-page-shell";
import { DromapLegalContactLink } from "@/components/dromap-product/legal-contact-link";
import { DROMAP_PRIVACY_LAST_UPDATED } from "@/lib/dromap/legal-public";
import { getDromapLegalIdentity } from "@/lib/dromap/server/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité",
  description: "Comment DroMap collecte, utilise, conserve et protège les données personnelles liées aux comptes, projets, paiements, publications, contacts et fonctions d’IA.",
};

function IdentityBlock() {
  const identity = getDromapLegalIdentity();
  return (
    <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
      <div>
        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Service</dt>
        <dd className="mt-1 font-semibold text-slate-900">{identity.brandName}</dd>
      </div>
      <div>
        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Responsable du traitement</dt>
        <dd className="mt-1 font-semibold text-slate-900">{identity.legalName ?? "À renseigner avant la mise en production"}</dd>
      </div>
      {identity.legalForm ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Forme juridique</dt><dd className="mt-1 font-semibold text-slate-900">{identity.legalForm}</dd></div> : null}
      {identity.postalAddress ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Adresse</dt><dd className="mt-1 font-semibold text-slate-900">{identity.postalAddress}</dd></div> : null}
      <div>
        <dt className="text-xs font-black uppercase tracking-wide text-slate-500">Contact confidentialité</dt>
        <dd className="mt-1"><DromapLegalContactLink className="font-bold text-teal-700 hover:underline">{identity.contactEmail}</DromapLegalContactLink></dd>
      </div>
    </dl>
  );
}

export default function PrivacyPage() {
  const identity = getDromapLegalIdentity();

  return (
    <DromapLegalPageShell
      eyebrow="Données personnelles"
      title="Politique de confidentialité"
      intro="Cette politique décrit les traitements réellement nécessaires au fonctionnement de DroMap : compte, sauvegarde de projets, facturation, support, publication de cartes et Assistant IA. Elle distingue les données conservées par DroMap de celles traitées par ses prestataires techniques."
      missingConfiguration={identity.missingRequiredFields}
      lastUpdated={DROMAP_PRIVACY_LAST_UPDATED}
    >
      <LegalCallout>
        <strong>Principe DroMap :</strong> les données de carte restent privées tant que l’utilisateur ne choisit pas explicitement de publier une carte. DroMap n’installe aucun outil publicitaire. La mesure d’audience des pages publiques par Vercel Web Analytics est facultative et activée uniquement après votre acceptation.
      </LegalCallout>

      <LegalSection id="responsable" title="1. Responsable du traitement">
        <p>Le responsable du traitement est l’exploitant de DroMap. Les coordonnées opérationnelles disponibles sont les suivantes :</p>
        <IdentityBlock />
        <p>Pour exercer un droit relatif aux données personnelles, il suffit d’écrire à <DromapLegalContactLink className="font-bold text-teal-700 hover:underline">contact@dromap.fr</DromapLegalContactLink>. Une vérification d’identité peut être demandée uniquement lorsqu’elle est nécessaire pour éviter qu’une demande soit exécutée pour le compte d’une autre personne.</p>
      </LegalSection>

      <LegalSection id="donnees" title="2. Données traitées, finalités et bases légales">
        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-4 py-3">Traitement</th><th className="px-4 py-3">Données concernées</th><th className="px-4 py-3">Pourquoi</th><th className="px-4 py-3">Base légale</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              <tr><td className="px-4 py-4 font-bold text-slate-900">Compte et authentification</td><td className="px-4 py-4">Prénom, nom, adresse e-mail, identifiant utilisateur, préférences, informations de session. Le mot de passe n’est pas stocké en clair par DroMap.</td><td className="px-4 py-4">Créer le compte, sécuriser la connexion, synchroniser les projets et appliquer les droits du compte.</td><td className="px-4 py-4">Exécution du service demandé et mesures précontractuelles.</td></tr>
              <tr><td className="px-4 py-4 font-bold text-slate-900">Projets cartographiques</td><td className="px-4 py-4">Nom de projet, zone de travail, objets, calques, GeoJSON, imports, marqueurs, réglages de rendu, miniature et autres données nécessaires à la carte.</td><td className="px-4 py-4">Sauvegarder, restaurer, modifier, prévisualiser et exporter les cartes.</td><td className="px-4 py-4">Exécution du service.</td></tr>
              <tr><td className="px-4 py-4 font-bold text-slate-900">Assistant IA</td><td className="px-4 py-4">Messages envoyés à l’Assistant, contexte de projet strictement nécessaire à la demande et réponses produites.</td><td className="px-4 py-4">Répondre aux demandes et proposer ou exécuter des plans d’édition lorsque l’utilisateur utilise cette fonction.</td><td className="px-4 py-4">Exécution du service demandé par l’utilisateur.</td></tr>
              <tr><td className="px-4 py-4 font-bold text-slate-900">Facturation</td><td className="px-4 py-4">Formule, identifiants Stripe, statut d’abonnement, droits d’achat à l’unité, dates de paiement et données nécessaires à la facturation. Les numéros complets de carte bancaire ne sont pas stockés par DroMap.</td><td className="px-4 py-4">Gérer les abonnements, achats, accès premium, factures et obligations comptables.</td><td className="px-4 py-4">Exécution du contrat et obligations légales.</td></tr>
              <tr><td className="px-4 py-4 font-bold text-slate-900">Contact et support</td><td className="px-4 py-4">Nom, e-mail, catégorie, sujet, message, pièces jointes facultatives et, si l’utilisateur les choisit, informations techniques ou métadonnées d’un projet.</td><td className="px-4 py-4">Répondre à la demande, diagnostiquer un problème et assurer le suivi du support.</td><td className="px-4 py-4">Intérêt légitime à assurer le support et, selon la demande, exécution du contrat.</td></tr>
              <tr><td className="px-4 py-4 font-bold text-slate-900">Publication publique</td><td className="px-4 py-4">Titre, description, aperçu de carte, nom du créateur affiché selon les réglages, droits de consultation/export/copie et source figée nécessaire aux fonctions autorisées.</td><td className="px-4 py-4">Publier la carte dans la bibliothèque et appliquer les permissions choisies par son auteur.</td><td className="px-4 py-4">Exécution de l’action de publication demandée par l’utilisateur.</td></tr>
              <tr><td className="px-4 py-4 font-bold text-slate-900">Mesure d’audience publique</td><td className="px-4 py-4">Pages publiques consultées, provenance éventuelle, pays, type d’appareil, navigateur et système d’exploitation. DroMap exclut les espaces privés et retire les paramètres de l’URL envoyée. Les statistiques sont agrégées par Vercel Web Analytics.</td><td className="px-4 py-4">Connaître la fréquentation des pages publiques et améliorer le service.</td><td className="px-4 py-4">Consentement facultatif, retirable avec le bouton Confidentialité.</td></tr>
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection id="conservation" title="3. Durées de conservation">
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Compte :</strong> pendant la durée d’utilisation du compte, puis suppression lorsque l’utilisateur supprime son compte, sous réserve des données qui doivent être conservées pour respecter une obligation légale ou défendre un droit.</li>
          <li><strong>Compte inactif :</strong> la politique de DroMap prévoit une revue après 3 ans sans activité, puis une information préalable laissant 30 jours pour réactiver le compte ou récupérer ses données avant suppression. Les droits d’accès à des contenus achetés et les abonnements font l’objet d’un examen spécifique. Le délai de 3 ans est un choix de conservation de DroMap, pas une durée légale applicable à toutes les données.</li>
          <li><strong>Projets :</strong> tant qu’ils sont conservés par l’utilisateur. Un projet placé dans la corbeille est prévu pour rester restaurable pendant 10 jours avant suppression définitive.</li>
          <li><strong>Projet invité et caches locaux :</strong> les données peuvent rester sur l’appareil de l’utilisateur dans le stockage local du navigateur jusqu’à suppression du projet, effacement des données du site ou transfert vers un compte.</li>
          <li><strong>Facturation et pièces comptables :</strong> les pièces comptables et justificatifs nécessaires sont conservés 10 ans à compter de la clôture de l’exercice concerné, avec accès restreint. Cela ne justifie pas de conserver l’intégralité des projets supprimés.</li>
          <li><strong>Demandes de support :</strong> jusqu’à 24 mois après le dernier échange, sauf nécessité de conservation plus longue liée à un litige, une obligation légale ou une demande de l’utilisateur.</li>
          <li><strong>Anti-abus :</strong> les identifiants techniques dérivés d’une adresse IP ou d’une adresse e-mail servent uniquement à limiter les requêtes. Les fenêtres expirées sont destinées à être purgées quotidiennement ; les compteurs techniques IA/GeoJSON après 24 heures. Les journaux d’hébergement ont leurs propres durées, gérées auprès des prestataires.</li>
          <li><strong>Choix de confidentialité :</strong> acceptation et refus de la mesure d’audience sont mémorisés pendant 180 jours sur cet appareil, puis demandés à nouveau.</li>
          <li><strong>Publication publique :</strong> jusqu’au retrait de la publication, à la mise en corbeille du projet source ou à une suppression imposée pour des raisons juridiques ou de sécurité.</li>
        </ul>
      </LegalSection>

      <LegalSection id="prestataires" title="4. Prestataires et destinataires">
        <p>Les données ne sont accessibles qu’aux personnes qui en ont besoin pour exploiter DroMap et aux prestataires nécessaires aux fonctions utilisées :</p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong>Supabase :</strong> authentification, base de données, synchronisation des projets et données de compte.</li>
          <li><strong>Stripe :</strong> paiement, abonnement, portail de facturation et pièces de paiement. Les données de carte bancaire sont traitées par Stripe.</li>
          <li><strong>Infomaniak :</strong> réception des messages adressés à DroMap via le formulaire Contact et la messagerie <span className="font-semibold">@dromap.fr</span>.</li>
          <li><strong>Vercel — Web Analytics :</strong> hébergement de DroMap et mesure agrégée de l’audience des pages publiques. Vercel Web Analytics est configuré par DroMap pour ne pas envoyer les routes privées ou sensibles de l’application.</li>
          <li><strong>Google — API Gemini :</strong> traitement des requêtes adressées à l’Assistant IA et production des réponses. DroMap n’active pas volontairement le partage de journaux à des fins d’amélioration de modèles ; toute modification de ce choix nécessitant une information des utilisateurs entraîne une mise à jour préalable de cette politique.</li>
          <li><strong>Fournisseurs cartographiques et de données :</strong> certains fonds, recherches et imports s’appuient sur des services externes (par exemple IGN, OpenStreetMap/Overpass ou fournisseurs des fonds cartographiques). Selon la fonction, la requête peut être effectuée par le serveur DroMap ou directement par le navigateur.</li>
        </ul>
        <p>DroMap ne vend pas les données personnelles de ses utilisateurs et ne les communique pas à des annonceurs.</p>
      </LegalSection>

      <LegalSection id="transferts" title="5. Hébergement et transferts hors Espace économique européen">
        <p>Certains prestataires techniques internationaux peuvent traiter des données depuis plusieurs régions du monde. Lorsque des données personnelles sont transférées hors de l’Espace économique européen, DroMap doit s’appuyer sur un mécanisme reconnu par le droit applicable (par exemple décision d’adéquation ou clauses contractuelles types) et sur les garanties proposées par le prestataire concerné.</p>
        <p>DroMap tient cette liste et les informations relatives aux garanties de transfert à jour lorsque l’infrastructure ou les prestataires changent.</p>
      </LegalSection>

      <LegalSection id="cookies" title="6. Cookies et stockage local">
        <p>DroMap utilise des cookies techniques nécessaires à l’authentification et à la récupération de session. Ils sont configurés pour le fonctionnement du compte et ne servent pas à la publicité.</p>
        <p>DroMap utilise également le stockage local du navigateur (notamment IndexedDB ou localStorage selon la fonction) pour conserver un projet invité, sécuriser la reprise locale d’un projet, certaines préférences d’interface et des données nécessaires à l’expérience de l’éditeur.</p>
        <p><strong>Vercel Web Analytics est désactivé tant que vous ne l’avez pas accepté.</strong> Bien que Vercel indique fonctionner sans cookie de mesure d’audience, DroMap recueille votre choix pour cette mesure facultative. Refuser ne limite aucune fonction du site. Les pages privées ou sensibles sont exclues de la mesure.</p>
        <p>Vous pouvez accepter, refuser ou retirer votre consentement dans <a href="/settings#confidentialite" className="underline">Paramètres → Confidentialité et cookies → Gérer mes cookies</a>. Le retrait arrête les prochains envois. Les cookies strictement nécessaires à la connexion et le stockage nécessaire aux fonctions demandées ne nécessitent pas d’acceptation facultative. Aucun cookie publicitaire n’est installé par DroMap.</p>
      </LegalSection>

      <LegalSection id="publication" title="7. Cartes publiques et visibilité">
        <p>Un projet privé ne devient pas public automatiquement. La publication résulte d’une action explicite du créateur. Une publication peut rendre visibles le rendu de la carte, son titre, sa description, le nom du créateur et les informations associées aux permissions choisies.</p>
        <p>Si le créateur autorise l’export ou la création d’une copie modifiable, DroMap conserve les données techniques nécessaires pour appliquer ces droits. Les droits d’une publication achetés à l’unité sont gérés séparément de l’achat Export Max d’un projet propriétaire.</p>
      </LegalSection>

      <LegalSection id="droits" title="8. Vos droits">
        <p>Vous pouvez supprimer votre compte depuis <a href="/account" className="underline">Mon compte</a>, et supprimer vos projets depuis le tableau de bord puis la corbeille. La suppression du compte concerne aussi ses projets en ligne et sa bibliothèque personnelle. Les messages de support et les pièces comptables suivent leurs règles de conservation distinctes.</p>
        <p>Selon la situation et la base légale du traitement, une personne peut demander l’accès à ses données, leur rectification, leur effacement, la limitation du traitement, la portabilité des données concernées ou s’opposer à certains traitements fondés sur l’intérêt légitime.</p>
        <p>Les demandes peuvent être envoyées à <DromapLegalContactLink className="font-bold text-teal-700 hover:underline">contact@dromap.fr</DromapLegalContactLink>. Si la réponse apportée n’est pas satisfaisante, la personne conserve le droit de saisir l’autorité de contrôle compétente, notamment la CNIL en France.</p>
      </LegalSection>

      <LegalSection id="securite" title="9. Sécurité et confidentialité">
        <p>DroMap met en œuvre des mesures destinées à limiter les accès non autorisés : sessions d’authentification protégées par des cookies HTTP-only, droits d’accès côté serveur, contrôle des permissions sur les projets et publications, validation des paiements côté serveur et limitation des pièces jointes du formulaire Contact.</p>
        <p>Aucune mesure technique ne peut garantir un risque nul. En cas d’incident affectant des données personnelles, DroMap applique les obligations de documentation et de notification prévues par le droit applicable.</p>
      </LegalSection>

      <LegalSection id="modifications" title="10. Évolution de cette politique">
        <p>Cette politique est mise à jour lorsqu’un traitement, un prestataire, une finalité ou une règle de conservation change de manière significative. La date de mise à jour affichée en haut de page permet d’identifier la version applicable.</p>
      </LegalSection>
    </DromapLegalPageShell>
  );
}
