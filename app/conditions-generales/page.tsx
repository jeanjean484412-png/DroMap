import type { Metadata } from "next";
import Link from "next/link";

import {
  DromapLegalPageShell,
  LegalCallout,
  LegalSection,
} from "@/components/dromap-product/legal-page-shell";
import { DromapLegalContactLink } from "@/components/dromap-product/legal-contact-link";
import { DROMAP_PLAN_DEFINITIONS } from "@/lib/dromap/plans";
import { createDromapPublicMetadata } from "@/lib/dromap/seo";
import { getDromapLegalIdentity } from "@/lib/dromap/server/legal";

export const metadata: Metadata = createDromapPublicMetadata({
  title: "Conditions générales d’utilisation et de vente",
  description: "Conditions d’utilisation de DroMap et conditions applicables aux abonnements, achats Export Max et achats de cartes publiques.",
  path: "/conditions-generales",
});

function euro(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}

export default function TermsPage() {
  const identity = getDromapLegalIdentity();
  const plus = DROMAP_PLAN_DEFINITIONS.find((plan) => plan.id === "plus");
  const pro = DROMAP_PLAN_DEFINITIONS.find((plan) => plan.id === "pro");
  const singleMap = DROMAP_PLAN_DEFINITIONS.find((plan) => plan.id === "single-map");

  return (
    <DromapLegalPageShell
      eyebrow="Contrat de service"
      title="Conditions générales d’utilisation et de vente"
      intro="Ces conditions encadrent l’accès à DroMap, les comptes, la création et la publication de cartes ainsi que les abonnements et achats à l’unité. Elles sont rédigées pour correspondre aux fonctions réellement présentes dans le produit et aux droits appliqués côté serveur."
      missingConfiguration={identity.missingRequiredFields}
    >
      <LegalCallout>
        <strong>Important :</strong> les prix et droits affichés au moment de la commande font foi. Les paiements sont traités par Stripe et les droits premium ne sont accordés qu’après validation du paiement côté serveur.
      </LegalCallout>

      <LegalSection id="editeur" title="1. Éditeur et contact">
        <p>DroMap est un service d’édition cartographique en ligne exploité sous la marque <strong>DroMap</strong>.</p>
        <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
          <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Exploitant</dt><dd className="mt-1 font-semibold text-slate-900">{identity.legalName ?? "À renseigner avant la mise en production"}</dd></div>
          {identity.legalForm ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Forme juridique</dt><dd className="mt-1 font-semibold text-slate-900">{identity.legalForm}</dd></div> : null}
          {identity.registrationNumber ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Immatriculation</dt><dd className="mt-1 font-semibold text-slate-900">{identity.registrationNumber}</dd></div> : null}
          {identity.vatNumber ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">TVA</dt><dd className="mt-1 font-semibold text-slate-900">{identity.vatNumber}</dd></div> : null}
          {identity.postalAddress ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Adresse</dt><dd className="mt-1 font-semibold text-slate-900">{identity.postalAddress}</dd></div> : null}
          {identity.phone ? <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">Téléphone</dt><dd className="mt-1 font-semibold text-slate-900">{identity.phone}</dd></div> : null}
          <div><dt className="text-xs font-black uppercase tracking-wide text-slate-500">E-mail</dt><dd className="mt-1"><DromapLegalContactLink className="font-bold text-teal-700 hover:underline">{identity.contactEmail}</DromapLegalContactLink></dd></div>
        </dl>
      </LegalSection>

      <LegalSection id="objet" title="2. Objet du service">
        <p>DroMap permet de créer, modifier, sauvegarder, importer, mettre en forme, prévisualiser, exporter et, selon les droits du compte, publier des cartes. Le service comprend notamment des outils graphiques, des calques, des données GeoJSON, des imports cartographiques, une légende liée aux objets, des fonctions de rendu et un Assistant IA.</p>
        <p>DroMap est un éditeur cartographique généraliste. Il n’est pas présenté comme un système d’information géographique certifié, un service de navigation, un outil de sécurité civile ou une source officielle de données géographiques.</p>
      </LegalSection>

      <LegalSection id="acceptation" title="3. Acceptation et compte">
        <p>La création d’un compte nécessite l’acceptation de la version en vigueur des présentes conditions et la prise de connaissance de la <Link href="/confidentialite" className="font-bold text-teal-700 hover:underline">Politique de confidentialité</Link>. DroMap enregistre la version acceptée dans les métadonnées du compte lors de l’inscription.</p>
        <p>L’utilisateur doit fournir des informations exactes, protéger ses identifiants et signaler rapidement tout accès non autorisé. Un achat doit être réalisé par une personne juridiquement capable de contracter ou, pour un mineur, sous la responsabilité et avec l’autorisation de son représentant légal lorsque celle-ci est requise.</p>
      </LegalSection>

      <LegalSection id="offres" title="4. Offres et prix">
        <p>Les offres commerciales actuellement prévues sont les suivantes. Les montants affichés dans DroMap au moment de la commande prévalent si une évolution tarifaire intervient ultérieurement.</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Offre</th><th className="px-4 py-3">Prix actuel</th><th className="px-4 py-3">Principe</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              <tr><td className="px-4 py-4 font-bold">Gratuit</td><td className="px-4 py-4">0 €</td><td className="px-4 py-4">Compte et fonctions gratuites selon la matrice de droits du produit.</td></tr>
              <tr><td className="px-4 py-4 font-bold">Plus</td><td className="px-4 py-4">{plus?.monthlyPriceEur != null ? `${euro(plus.monthlyPriceEur)} / mois` : "—"}{plus?.yearlyPriceEur != null ? ` ou ${euro(plus.yearlyPriceEur)} / an` : ""}</td><td className="px-4 py-4">Abonnement premium avec les fonctions indiquées sur la page Formules.</td></tr>
              <tr><td className="px-4 py-4 font-bold">Pro</td><td className="px-4 py-4">{pro?.monthlyPriceEur != null ? `${euro(pro.monthlyPriceEur)} / mois` : "—"}{pro?.yearlyPriceEur != null ? ` ou ${euro(pro.yearlyPriceEur)} / an` : ""}</td><td className="px-4 py-4">Abonnement premium destiné aux usages plus intensifs ; les droits effectivement actifs sont ceux affichés dans DroMap au moment de la commande.</td></tr>
              <tr><td className="px-4 py-4 font-bold">Export Max</td><td className="px-4 py-4">{singleMap?.oneTimePriceEur != null ? euro(singleMap.oneTimePriceEur) : "3 €"} par projet propriétaire</td><td className="px-4 py-4">Achat à l’unité rattaché à un projet précis, distinct d’un abonnement.</td></tr>
              <tr><td className="px-4 py-4 font-bold">Carte publique</td><td className="px-4 py-4">3 € lorsqu’un achat est proposé</td><td className="px-4 py-4">Achat distinct donnant les droits d’export ou de copie autorisés par le créateur au moment du paiement.</td></tr>
            </tbody>
          </table>
        </div>
        <p>Les prix sont affichés en euros. Le prix total dû, taxes comprises lorsqu’elles sont applicables, est présenté à l’utilisateur avant la validation définitive du paiement.</p>
      </LegalSection>

      <LegalSection id="paiement" title="5. Commande et paiement">
        <p>Les paiements sont réalisés via Stripe Checkout. L’acceptation des conditions applicables à la commande est demandée directement sur la page de paiement Stripe, avant que le paiement puisse être validé. DroMap associe la version en vigueur des présentes conditions à la session de paiement afin d’identifier le texte contractuel correspondant à la commande.</p>
        <p>Une redirection de navigateur ne suffit jamais à accorder un droit premium : DroMap vérifie le paiement côté serveur et applique les droits correspondant à la commande confirmée.</p>
      </LegalSection>

      <LegalSection id="abonnements" title="6. Abonnements Plus et Pro">
        <p>Un abonnement mensuel ou annuel est reconduit selon la périodicité choisie tant qu’il n’est pas résilié. La prochaine échéance et l’état de la formule sont présentés dans l’espace Compte.</p>
        <p>L’utilisateur peut gérer son moyen de paiement, ses factures, un changement de formule disponible et la résiliation via le portail de facturation accessible depuis DroMap. Lorsqu’une résiliation est prévue en fin de période, les avantages restent disponibles jusqu’à la date de fin indiquée.</p>
        <p>En cas d’échec de paiement, d’expiration du moyen de paiement ou de situation imposant une authentification supplémentaire, l’accès premium peut être suspendu ou limité conformément à l’état communiqué par le prestataire de paiement et aux règles affichées dans le compte.</p>
      </LegalSection>

      <LegalSection id="export-max" title="7. Export Max à l’unité">
        <p>L’Export Max est rattaché au couple compte propriétaire + projet. Une duplication du projet ne reçoit pas automatiquement le droit acheté.</p>
        <p>Hors abonnement Plus, Pro ou accès de test équivalent, le premier téléchargement réalisé uniquement grâce à l’Export Max peut verrouiller la modification de la zone de travail de ce projet. DroMap avertit l’utilisateur avant ce premier téléchargement. Un nouvel achat de l’Export Max sur la même carte peut réouvrir la modification de la zone jusqu’au prochain premier téléchargement.</p>
        <p>Lorsqu’un abonnement premium actif donne déjà ces droits, le verrou lié à l’achat unitaire est ignoré pendant la durée de cet abonnement.</p>
      </LegalSection>

      <LegalSection id="cartes-publiques" title="8. Cartes publiques, achats et copies">
        <p>La consultation d’une carte publiée est gratuite. Le créateur choisit si sa publication est en lecture seule, autorise l’export ou autorise également la création d’une copie modifiable.</p>
        <p>Lorsqu’un achat d’une carte publique est proposé, il est distinct de l’Export Max propriétaire. Les droits acquis correspondent aux permissions autorisées au moment du paiement. Un changement ultérieur des réglages de la publication ne retire pas rétroactivement un droit déjà acquis dans les limites prévues par le produit.</p>
        <p>Une copie modifiable conserve l’attribution du créateur d’origine selon les règles de crédit définies par la publication.</p>
      </LegalSection>

      <LegalSection id="retractation" title="9. Droit de rétractation des consommateurs">
        <p>Lorsque le droit de la consommation applicable prévoit un droit de rétractation pour une vente à distance, le consommateur dispose en principe d’un délai de 14 jours à compter de la conclusion du contrat pour l’exercer, sous réserve des exceptions prévues par la loi.</p>
        <p>DroMap peut rendre les droits numériques disponibles immédiatement après confirmation du paiement. Cette disponibilité immédiate ne supprime pas, à elle seule, un droit légal de rétractation. Lorsqu’une règle permet de commencer l’exécution avant la fin du délai ou de constater la perte du droit après exécution complète, les conditions légales correspondantes doivent être réunies et l’accord requis doit avoir été recueilli.</p>
        <p>Une demande de rétractation peut être adressée à <DromapLegalContactLink className="font-bold text-teal-700 hover:underline">contact@dromap.fr</DromapLegalContactLink> en indiquant le compte et la commande concernés. DroMap applique alors les règles légales correspondant à la nature de la prestation et à son état d’exécution.</p>
      </LegalSection>

      <LegalSection id="contenus" title="10. Contenus, données et droits de l’utilisateur">
        <p>L’utilisateur conserve les droits qu’il détient sur les cartes, textes, données, images, SVG, GeoJSON et autres contenus qu’il importe ou crée. Il accorde à DroMap une autorisation technique limitée à ce qui est nécessaire pour stocker, synchroniser, transformer, prévisualiser, exporter et, lorsqu’il le demande, publier ces contenus.</p>
        <p>L’utilisateur garantit qu’il dispose des droits ou autorisations nécessaires sur les contenus qu’il importe, publie ou distribue. Il doit respecter les licences des sources de données utilisées et ne pas retirer les mentions d’attribution lorsque leur maintien est obligatoire.</p>
        <p>Les licences et crédits des principaux composants et sources intégrés au produit sont détaillés sur la page <Link href="/credits" className="font-bold text-teal-700 hover:underline">Crédits</Link>.</p>
      </LegalSection>

      <LegalSection id="ia" title="11. Assistant IA">
        <p>L’Assistant IA peut proposer des réponses, des plans, des modifications et des imports. Ses résultats peuvent être incomplets, approximatifs ou erronés. L’utilisateur reste responsable de vérifier les informations, données, géométries, crédits et conséquences d’une modification avant de les utiliser ou de les publier.</p>
        <p>L’Assistant ne remplace pas une source officielle, une expertise juridique, une expertise de sécurité, ni une validation scientifique ou cartographique adaptée au contexte.</p>
      </LegalSection>

      <LegalSection id="usage" title="12. Utilisation acceptable">
        <p>Il est interdit d’utiliser DroMap pour enfreindre la loi, porter atteinte aux droits d’autrui, diffuser sciemment des contenus illicites, contourner les restrictions d’accès ou de paiement, perturber le service, introduire du code malveillant, exploiter abusivement les API ou tenter d’accéder à des données auxquelles l’utilisateur n’est pas autorisé.</p>
        <p>DroMap peut limiter ou suspendre un compte lorsqu’une mesure est raisonnablement nécessaire pour protéger le service, les autres utilisateurs, les données ou respecter une obligation légale. Lorsque la situation le permet, l’utilisateur est informé du motif et des moyens de régularisation.</p>
      </LegalSection>

      <LegalSection id="disponibilite" title="13. Disponibilité, sauvegarde et évolution du service">
        <p>DroMap cherche à maintenir le service disponible et à préserver les projets, mais une disponibilité ininterrompue ne peut pas être garantie. Des interruptions peuvent résulter d’une maintenance, d’une panne d’un prestataire ou d’un incident indépendant de DroMap.</p>
        <p>Le produit utilise une sauvegarde distante pour les comptes et un filet de sécurité local lorsque cela est possible. Pour les travaux importants, l’utilisateur reste invité à conserver ses exports ou fichiers DroMap lorsque la fonction est disponible.</p>
        <p>Les fonctions peuvent évoluer. Une modification substantielle affectant un abonnement en cours est communiquée dans des conditions compatibles avec les droits de l’utilisateur et la réglementation applicable.</p>
      </LegalSection>

      <LegalSection id="responsabilite" title="14. Responsabilité">
        <p>DroMap répond des obligations qui lui incombent selon le droit applicable. Aucune clause des présentes conditions ne vise à exclure une garantie ou une responsabilité qui ne pourrait légalement être exclue à l’égard d’un consommateur.</p>
        <p>L’utilisateur reste responsable de la pertinence de ses choix cartographiques, de la licéité des contenus qu’il importe et des décisions prises à partir d’une carte. Les fonds et données externes peuvent contenir des erreurs, des décalages ou des informations obsolètes.</p>
      </LegalSection>

      <LegalSection id="suppression" title="15. Résiliation, suppression du compte et données">
        <p>L’utilisateur peut résilier un abonnement depuis les outils de facturation mis à sa disposition et peut demander la suppression de son compte depuis l’espace Compte, sous réserve des vérifications de sécurité prévues par le produit.</p>
        <p>La suppression du compte entraîne la suppression des données qui n’ont plus à être conservées. Certaines informations de facturation, de preuve ou de litige peuvent être conservées pendant la durée imposée ou permise par la loi. Les modalités relatives aux données personnelles sont détaillées dans la <Link href="/confidentialite" className="font-bold text-teal-700 hover:underline">Politique de confidentialité</Link>.</p>
      </LegalSection>

      <LegalSection id="mediation" title="16. Réclamations et médiation de la consommation">
        <p>Une réclamation doit d’abord être adressée à DroMap à <DromapLegalContactLink className="font-bold text-teal-700 hover:underline">contact@dromap.fr</DromapLegalContactLink>.</p>
        {identity.mediatorName && identity.mediatorAddress && identity.mediatorUrl ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="font-bold text-slate-900">Médiateur de la consommation</div>
            <div className="mt-2">{identity.mediatorName}</div>
            <div>{identity.mediatorAddress}</div>
            <a href={identity.mediatorUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-bold text-teal-700 hover:underline">{identity.mediatorUrl}</a>
          </div>
        ) : (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><strong>Préproduction :</strong> le médiateur de la consommation doit être désigné et ses coordonnées renseignées avant l’ouverture commerciale réelle.</p>
        )}
      </LegalSection>

      <LegalSection id="droit" title="17. Droit applicable et litiges">
        <p>Les présentes conditions sont régies par le droit français, sans priver un consommateur résidant dans un autre État des protections impératives dont il bénéficie en vertu de la loi qui lui est applicable.</p>
        <p>À défaut d’accord amiable ou de médiation lorsqu’elle est applicable, le litige peut être porté devant la juridiction compétente selon les règles de procédure applicables. Aucune attribution exclusive de juridiction contraire aux droits d’un consommateur n’est imposée par ces conditions.</p>
      </LegalSection>

      <LegalSection id="evolution" title="18. Version et évolution des conditions">
        <p>La version applicable à une commande est celle présentée et acceptée sur Stripe au moment du paiement. Pour la création d’un compte, la version des conditions d’utilisation en vigueur est associée à l’inscription. Une nouvelle version peut être proposée lorsque le service ou la réglementation évolue.</p>
      </LegalSection>
    </DromapLegalPageShell>
  );
}
