"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DromapProductBootstrap } from "./product-bootstrap";
import { DromapProductShell } from "./product-shell";

type HelpArticle = {
  id: string;
  category: string;
  title: string;
  summary: string;
  keywords: string[];
  steps: string[];
  note?: string;
};

type RankedHelpArticle = {
  article: HelpArticle;
  score: number;
};

const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "first-map",
    category: "Démarrage rapide",
    title: "Créer une première carte",
    summary:
      "Passer du tableau de bord à l’éditeur avec le parcours guidé ou le démarrage rapide défini dans Paramètres.",
    keywords: [
      "nouveau projet",
      "commencer",
      "premiere carte",
      "creation",
      "debutant",
      "parcours",
      "demarrage rapide",
      "passer les etapes",
    ],
    steps: [
      "Depuis Mes projets, sélectionner Nouveau projet.",
      "Avec le parcours guidé, DroMap propose successivement le nom, le fond de carte, la zone de travail puis les calques et données.",
      "Lorsque le parcours guidé est désactivé dans Paramètres, le projet s’ouvre directement avec les choix de démarrage rapide enregistrés.",
      "Le démarrage rapide ne crée pas silencieusement une zone de travail : la définir avant d’utiliser les fonctions qui en ont besoin.",
      "Avec un compte déjà connecté, la création est effectuée dans le contexte de ce compte et le projet peut être synchronisé normalement.",
    ],
  },
  {
    id: "connected-home",
    category: "Démarrage rapide",
    title: "Revenir à l’accueil DroMap avec un compte connecté",
    summary:
      "Consulter la présentation du produit sans se déconnecter et continuer à créer des projets avec le compte actif.",
    keywords: [
      "accueil",
      "logo dromap",
      "menu principal",
      "compte connecte",
      "mon compte",
      "creer une carte",
      "creer un projet",
    ],
    steps: [
      "Depuis l’espace connecté, sélectionner DroMap pour ouvrir la page d’accueil et la présentation du produit.",
      "Lorsqu’une session est active, l’accès Connexion est remplacé par Mon compte.",
      "Le bouton de création démarre un nouveau projet avec le compte déjà connecté ; aucune nouvelle connexion n’est demandée.",
      "Une arrivée normale sur DroMap avec une session active peut conduire directement à Mes projets, tandis qu’un clic volontaire sur DroMap permet toujours de revoir l’accueil.",
    ],
  },
  {
    id: "basemaps",
    category: "Comprendre DroMap",
    title: "Choisir et changer le fond de carte",
    summary:
      "Utiliser un fond classique, clair, satellite, IGN ou blanc sans déplacer le travail déjà créé.",
    keywords: [
      "fond",
      "fond de carte",
      "basemap",
      "classique",
      "clair",
      "satellite",
      "ign",
      "carte blanche",
      "fond blanc",
    ],
    steps: [
      "Ouvrir Fond de carte dans l’éditeur pour afficher les fonds disponibles.",
      "Les fonds classiques et satellite servent de contexte détaillé ; les fonds blancs mettent davantage en avant les objets DroMap.",
      "Changer de fond avec une zone déjà validée conserve autant que possible la zone, le centre et le zoom du projet.",
      "Sur les fonds vectoriels compatibles, les écritures et petits symboles peuvent être masqués depuis Légende & Rendu final.",
    ],
  },
  {
    id: "white-basemaps",
    category: "Comprendre DroMap",
    title: "Fonds blancs, pays, continents et frontières",
    summary:
      "Créer une carte épurée à partir du monde, d’un continent, d’un pays ou de subdivisions administratives.",
    keywords: [
      "fond blanc",
      "frontiere",
      "frontieres precises",
      "pays",
      "continent",
      "europe",
      "region",
      "departement",
      "monde entier",
    ],
    steps: [
      "Dans Fond de carte, ouvrir la famille Fonds blancs puis sélectionner le territoire souhaité.",
      "Pour certains pays ou continents, DroMap peut préparer automatiquement une zone de travail autour du territoire ; la valider avant de poursuivre.",
      "Les frontières précises du monde entier et l’Europe entière peuvent être plus lourdes à afficher ; un avertissement est prévu avant leur utilisation.",
      "Sur les fonds pays, le contexte des territoires voisins peut être affiché sans modifier la zone de travail.",
    ],
  },
  {
    id: "workspace",
    category: "Comprendre DroMap",
    title: "Zone de travail",
    summary:
      "Définir le territoire de la carte et comprendre ce qui se passe lors d’une modification de l’emprise.",
    keywords: [
      "zone",
      "zone de travail",
      "emprise",
      "rectangle",
      "selectionner le monde",
      "cadrage",
      "limites",
      "deux clics",
    ],
    steps: [
      "La zone de travail correspond au territoire utilisé pour construire et cadrer la carte.",
      "Il est possible de modifier la zone en deux clics ou de sélectionner le monde entier lorsque le fond de carte le permet.",
      "Après validation, DroMap calcule le cadrage de référence et le niveau de détail associé.",
      "Modifier la zone ne doit pas supprimer silencieusement les objets déjà présents à l’extérieur de la nouvelle emprise.",
    ],
  },
  {
    id: "zoom-precise",
    category: "Comprendre DroMap",
    title: "Zoom précis et zoom contraint",
    summary:
      "Débloquer temporairement un zoom continu à l’intérieur de la zone puis revenir au cadrage contraint du projet.",
    keywords: [
      "zoom",
      "zoom contraint",
      "zoom precis",
      "dezoom",
      "detail",
      "niveau de detail",
      "molette",
      "trackpad",
      "fluide",
    ],
    steps: [
      "Activer Zoom précis pour explorer l’intérieur de la zone avec un zoom continu et fluide.",
      "Ce mode sert à rechercher ou placer un élément avec davantage de précision sans remplacer le cadrage du rendu final.",
      "Revenir à Zoom contraint pour retrouver le comportement normal lié à la zone de travail.",
      "Le niveau de détail enregistré pour l’aperçu et l’export reste indépendant de ce zoom temporaire.",
    ],
  },
  {
    id: "inspector",
    category: "Comprendre DroMap",
    title: "À quoi sert l’inspecteur ?",
    summary:
      "Modifier ce qui existe déjà sur la carte : sélection, liste des objets, sélection multiple et étiquettes.",
    keywords: [
      "inspecteur",
      "selection",
      "modifier objet",
      "proprietes",
      "objets",
      "etiquettes",
      "panneau droite",
    ],
    steps: [
      "La barre d’outils sert principalement à créer ; l’inspecteur sert à modifier et organiser les éléments déjà présents.",
      "Sélection affiche les propriétés de l’objet ou des objets actuellement sélectionnés : nom, légende, style, taille, couleurs, verrouillage et réglages compatibles.",
      "Objets permet de retrouver un élément dans une carte chargée, de le sélectionner et, lorsque prévu, de recentrer la carte dessus.",
      "Étiquettes rassemble les réglages des noms et informations affichés près des objets.",
      "Sélectionner directement un objet sur la carte ouvre automatiquement l’inspecteur sur Sélection.",
    ],
  },
  {
    id: "layers",
    category: "Comprendre DroMap",
    title: "Calques DroMap et calques GeoJSON",
    summary:
      "Organiser des groupes d’objets ou de données et gérer leur ordre, leur visibilité, leur opacité et leur verrouillage.",
    keywords: [
      "calque",
      "calques",
      "layer",
      "couche",
      "ordre",
      "opacite",
      "verrouiller",
      "masquer",
      "geojson",
    ],
    steps: [
      "Ouvrir Calques sous Fond de carte dans l’éditeur.",
      "Le calque actif reçoit les nouveaux objets DroMap créés ensuite.",
      "Modifier l’ordre, la visibilité, l’opacité ou le verrouillage d’un calque agit sur l’ensemble concerné sans devoir modifier chaque objet séparément.",
      "Les calques GeoJSON restent groupés et légers ; les calques DroMap contiennent des objets modifiables individuellement.",
      "Un calque enregistré peut être réutilisé dans d’autres projets depuis Mes calques enregistrés.",
    ],
  },
  {
    id: "markers",
    category: "Outils de carte",
    title: "Poser et modifier des marqueurs",
    summary:
      "Choisir un symbole, préparer son apparence puis le poser avec une proportion cohérente.",
    keywords: [
      "marqueur",
      "marqueurs",
      "symbole",
      "icone",
      "pictogramme",
      "point",
      "taille",
      "ville",
      "repere",
    ],
    steps: [
      "Activer Marqueur puis ouvrir le bouton de choix du symbole.",
      "Rechercher un pictogramme par mot-clé ; la recherche ignore les majuscules et accents et tolère de petites fautes de frappe.",
      "Préparer la taille, la couleur, l’opacité, le contour et le remplissage lorsque le symbole le permet.",
      "Déplacer le fantôme sur la carte puis cliquer pour poser le marqueur.",
      "Pour modifier un marqueur déjà posé, le sélectionner sur la carte puis utiliser l’onglet Sélection de l’inspecteur.",
    ],
  },
  {
    id: "custom-markers",
    category: "Outils de carte",
    title: "Marqueurs personnels et concepteur de marqueurs",
    summary:
      "Réutiliser Mes marqueurs, dessiner un symbole ou importer une image tout en conservant un rendu SVG net.",
    keywords: [
      "mes marqueurs",
      "marqueur personnel",
      "dessiner marqueur",
      "concepteur",
      "fabric",
      "importer marqueur",
      "image",
      "svg",
      "png",
      "personnalise",
      "rotation",
      "redimensionner",
    ],
    steps: [
      "Dans la bibliothèque de symboles, Bibliothèque DroMap regroupe les pictogrammes intégrés et Mes marqueurs les symboles personnels enregistrés.",
      "Le concepteur permet de sélectionner, déplacer, redimensionner et faire pivoter les éléments, avec multi-sélection, formes, lignes, flèches, polygones, dessin libre et texte.",
      "Le symbole enregistré reste une définition DroMap/SVG afin de conserver un rendu net sur la carte, dans la légende et à l’export.",
      "L’import accepte PNG, JPEG, WebP ou SVG lorsque l’offre autorise les marqueurs personnalisés.",
      "La suppression d’un symbole de Mes marqueurs ne doit pas casser les instances déjà placées dans les projets existants.",
    ],
    note:
      "Les marqueurs personnalisés sont réservés aux droits premium dans la matrice commerciale actuelle.",
  },
  {
    id: "lines",
    category: "Outils de carte",
    title: "Traits : classique, dessin libre et suivi",
    summary:
      "Choisir entre des segments précis, un tracé à main levée ou le suivi d’une ligne déjà visible.",
    keywords: [
      "trait",
      "ligne",
      "fleche",
      "itineraire",
      "axe",
      "dessin libre",
      "suivi de trait",
      "frontiere",
      "tracer",
    ],
    steps: [
      "Trait classique : cliquer point par point pour créer une ligne nette ; un double-clic au point d’arrivée termine le trait.",
      "Dessin libre : maintenir le clic et déplacer la souris pour dessiner une courbe ou un tracé approximatif, puis relâcher pour terminer.",
      "Suivi de trait : cliquer-glisser près d’une frontière, d’un contour ou d’une ligne visible pour que DroMap la suive automatiquement.",
      "Le suivi n’est disponible que si une ligne exploitable est visible, par exemple sur certains fonds blancs ou dans un calque GeoJSON.",
      "Les paramètres du trait préparent les prochaines poses ; un trait existant se modifie depuis l’inspecteur.",
    ],
  },
  {
    id: "zones",
    category: "Outils de carte",
    title: "Zones : classique, libre, remplissage et formes rapides",
    summary:
      "Créer une surface personnalisée, dessiner à main levée, reprendre une géométrie existante ou utiliser une forme simple.",
    keywords: [
      "zone",
      "surface",
      "polygone",
      "remplissage",
      "mer",
      "ocean",
      "ligne fermee",
      "forme",
      "rectangle",
      "cercle",
      "ellipse",
      "hachure",
      "points",
    ],
    steps: [
      "Zone classique : cliquer point par point autour de la surface à délimiter.",
      "Zone libre : maintenir le clic et dessiner le contour à main levée ; le lissage permet de régulariser le tracé.",
      "Remplissage : reprendre une surface vectorielle déjà présente, par exemple un pays, une région, un département ou certaines zones GeoJSON.",
      "Sur un fond blanc avec frontières vectorielles, un clic dans la mer peut créer une zone Mers et océans à partir de l’espace marin de la zone de travail.",
      "Forme rapide : utiliser rectangle, cercle ou ellipse pour mettre en évidence une partie de la carte en deux clics.",
      "Les paramètres permettent de régler séparément contour, fond, couleurs, opacité, hachures et semis de points.",
    ],
  },
  {
    id: "texts",
    category: "Outils de carte",
    title: "Ajouter du texte sur la carte",
    summary:
      "Placer un texte libre, régler son apparence et conserver une taille cohérente entre édition et export.",
    keywords: [
      "texte",
      "annotation",
      "ecrire",
      "police",
      "gras",
      "italique",
      "rotation",
      "contour blanc",
    ],
    steps: [
      "Activer Texte puis cliquer à l’endroit où le texte doit apparaître.",
      "Saisir le contenu après la pose.",
      "Préparer la taille, le gras, l’italique, la rotation, le contour des lettres, le fond et le cadre dans les paramètres.",
      "Un texte déjà posé se modifie depuis Sélection dans l’inspecteur.",
      "La taille relative reste identique dans l’éditeur, l’aperçu et le fichier exporté.",
    ],
  },
  {
    id: "selection",
    category: "Outils de carte",
    title: "Sélectionner et modifier un objet",
    summary:
      "Sélectionner un objet pour afficher immédiatement ses propriétés dans l’inspecteur.",
    keywords: [
      "selectionner",
      "selection",
      "modifier",
      "poignee",
      "deplacer",
      "dupliquer",
      "supprimer",
      "verrouiller",
      "deselectionner",
    ],
    steps: [
      "Lorsqu’aucun outil de création n’est actif, cliquer sur un objet pour le sélectionner.",
      "L’inspecteur s’ouvre automatiquement sur Sélection afin d’afficher ses propriétés.",
      "Les objets compatibles affichent leurs poignées de modification directement sur la carte.",
      "Cliquer une fois dans le vide de la carte désélectionne l’objet courant.",
      "Les actions comme dupliquer, verrouiller, changer l’ordre ou supprimer restent accessibles depuis l’inspecteur et les raccourcis compatibles.",
    ],
  },
  {
    id: "multi-selection",
    category: "Outils de carte",
    title: "Sélection multiple, rectangle et modification groupée",
    summary:
      "Sélectionner plusieurs objets un par un ou dans une zone rectangulaire, puis modifier les propriétés communes.",
    keywords: [
      "selection multiple",
      "plusieurs objets",
      "rectangle selection",
      "selectionner par zone",
      "groupe",
      "modifier ensemble",
      "multi selection",
      "opacite fond",
    ],
    steps: [
      "Activer la sélection multiple depuis l’onglet Sélection de l’inspecteur.",
      "Sélectionner les objets un par un ou utiliser Sélectionner par zone puis tracer un rectangle sur la carte.",
      "Un marqueur ou un texte est retenu si son point est dans le rectangle ; un trait peut être retenu s’il le traverse ; une zone ou un bâtiment est retenu si sa géométrie touche, traverse ou contient le rectangle.",
      "Les calques masqués ne participent pas à la sélection par zone. Le mode rectangle s’arrête après le tracé mais la sélection multiple reste active.",
      "Pour des zones sélectionnées, Opacité du fond modifie uniquement le remplissage sans changer les contours ni les autres types d’objets.",
    ],
  },
  {
    id: "labels",
    category: "Outils de carte",
    title: "Étiquettes des objets",
    summary:
      "Afficher, masquer, déplacer ou remettre automatiquement les noms placés près des objets.",
    keywords: [
      "etiquette",
      "etiquettes",
      "label",
      "nom",
      "afficher noms",
      "masquer noms",
      "placement",
      "contour",
    ],
    steps: [
      "Ouvrir Étiquettes dans l’inspecteur.",
      "Choisir l’affichage général puis, si nécessaire, forcer une étiquette particulière visible ou masquée.",
      "Déplacer une étiquette directement sur la carte pour ajuster son placement.",
      "Utiliser le retour au placement automatique pour annuler un déplacement manuel.",
      "La taille, le retour à la ligne et le contour restent identiques en édition, aperçu et export.",
    ],
  },
  {
    id: "place-search",
    category: "Outils de carte",
    title: "Rechercher un lieu",
    summary:
      "Rechercher une ville, une adresse, un pays ou un lieu nommé et recentrer la carte.",
    keywords: [
      "rechercher lieu",
      "recherche",
      "adresse",
      "ville",
      "pays",
      "geocodage",
      "aller a",
      "trouver",
    ],
    steps: [
      "Ouvrir Rechercher un lieu dans l’éditeur.",
      "Saisir une ville, une adresse, un pays ou un lieu connu puis lancer la recherche.",
      "Sélectionner le résultat souhaité lorsqu’il existe plusieurs propositions.",
      "La carte est recentrée sur le lieu choisi sans remplacer silencieusement une zone de travail existante.",
    ],
  },
  {
    id: "geojson",
    category: "Données",
    title: "Importer un GeoJSON",
    summary:
      "Choisir entre un calque léger et des objets DroMap modifiables individuellement.",
    keywords: [
      "geojson",
      "json geo",
      "donnees",
      "import",
      "entites",
      "precision",
      "leger",
      "convertir",
      "bibliotheque geojson",
    ],
    steps: [
      "Ouvrir Ajouter / Importer puis sélectionner un fichier GeoJSON local.",
      "Vérifier le nombre d’entités, le poids et la complexité annoncée avant l’import.",
      "Choisir Calque GeoJSON pour conserver les données groupées et rapides à afficher.",
      "Choisir Objets DroMap lorsqu’une édition individuelle de chaque entité est nécessaire.",
      "La Bibliothèque GeoJSON permet aussi d’ajouter des jeux de données préchargés directement depuis DroMap.",
    ],
    note:
      "Convertir plusieurs centaines ou milliers d’entités en objets DroMap peut ralentir fortement le navigateur. Conserver un calque GeoJSON lorsque l’édition individuelle n’est pas nécessaire.",
  },
  {
    id: "project-import",
    category: "Données",
    title: "Importer un Projet DroMap",
    summary:
      "Ajouter à la carte courante le contenu d’un fichier Projet DroMap complet sans remplacer automatiquement son fond ni sa zone.",
    keywords: [
      "projet dromap",
      "import projet",
      "ouvrir sauvegarde",
      "json projet",
      "restaurer projet",
      "fusion",
      "ajouter importer",
    ],
    steps: [
      "Dans Ajouter / Importer, sélectionner un fichier Projet DroMap complet.",
      "DroMap vérifie le contenu avant d’ajouter les objets, calques, GeoJSON et éléments de légende au projet courant.",
      "Le fond de carte et la zone de travail actuels restent conservés par défaut.",
      "Depuis le tableau de bord, l’import d’un Projet DroMap peut aussi servir à créer un nouveau projet à partir d’un fichier complet.",
    ],
  },
  {
    id: "cartographic-imports",
    category: "Données",
    title: "Imports cartographiques",
    summary:
      "Ouvrir le menu Imports du rail gauche pour accéder aux données récupérées directement dans la zone de travail.",
    keywords: [
      "imports",
      "imports cartographiques",
      "rail gauche",
      "barre verticale",
      "batiments",
      "routes",
      "donnees",
      "a venir",
    ],
    steps: [
      "Dans l’éditeur, ouvrir Imports dans la barre verticale de gauche.",
      "Le panneau contient actuellement Bâtiments et Routes. Un emplacement À venir est réservé aux prochains imports cartographiques.",
      "Les imports utilisent la zone de travail validée comme borne de recherche et peuvent être réservés selon les droits du compte.",
      "Pour demander une nouvelle famille d’import, utiliser le formulaire Contact intégré ou écrire à contact@dromap.fr.",
    ],
  },
  {
    id: "routes-import",
    category: "Données",
    title: "Importer les routes de la zone de travail",
    summary:
      "Choisir les niveaux de réseau, analyser la zone puis importer tous les axes ou seulement une sélection.",
    keywords: [
      "route",
      "autoroute",
      "autoroutes",
      "nationale",
      "principale",
      "departementale",
      "secondaire",
      "petites routes",
      "overpass",
      "geojson routes",
      "selection routes",
      "reanalyser routes",
    ],
    steps: [
      "Ouvrir Imports puis Routes.",
      "Sélectionner Autoroutes, Nationales / principales, Départementales / secondaires ou Petites routes. Plusieurs niveaux peuvent être combinés.",
      "La taille maximale dépend du niveau le plus détaillé choisi : environ 1 500 000 km² pour les autoroutes, 750 000 km² pour les nationales/principales, 120 000 km² pour les départementales/secondaires et 10 000 km² pour les petites routes.",
      "Après l’analyse, importer toutes les routes ou ouvrir le sélecteur plein écran pour ne conserver que les axes utiles.",
      "Les routes restent toujours dans un seul calque GeoJSON Routes, y compris après une sélection partielle.",
      "Lors d’une nouvelle analyse, les routes déjà présentes sont présélectionnées ; une route désélectionnée est retirée du même calque et les nouvelles sont ajoutées sans doublon.",
      "DroMap évite les bretelles ordinaires et regroupe prudemment les deux chaussées d’un même grand axe afin de limiter les doubles traits visuels.",
    ],
    note:
      "Les seuils de superficie sont des garde-fous de performance et peuvent évoluer. Les chemins, voies de service, pistes cyclables et voies piétonnes ne sont pas assimilés aux Petites routes.",
  },
  {
    id: "buildings",
    category: "Données",
    title: "Importer et réanalyser des bâtiments",
    summary:
      "Analyser jusqu’à 15 000 bâtiments, importer un calque complet ou sélectionner des bâtiments DroMap individuels.",
    keywords: [
      "batiment",
      "batiments",
      "building",
      "imports",
      "immeuble",
      "maison",
      "ign",
      "overture",
      "selection batiments",
      "reanalyser",
      "desselectionner",
      "noms coordonnees",
    ],
    steps: [
      "Ouvrir Imports puis Bâtiments. Une zone de travail validée est nécessaire.",
      "Une analyse peut aller jusqu’à 15 000 bâtiments ; une zone trop vaste ou trop dense est refusée avant l’import afin de protéger les performances.",
      "Ajouter le calque complet importe tous les bâtiments trouvés dans un calque GeoJSON léger.",
      "Ouvrir la sélection permet de conserver uniquement certains bâtiments ; les bâtiments retenus deviennent des objets DroMap modifiables individuellement.",
      "Lors d’une nouvelle analyse, les bâtiments déjà présents sont présélectionnés. Désélectionner un bâtiment puis valider le retire réellement du projet sans créer de doublon.",
      "Lorsque certains bâtiments sélectionnés n’ont pas de nom, la recherche par coordonnées peut proposer des noms proches. Vérifier les propositions avant de les retenir ; elles ne sont jamais appliquées automatiquement.",
    ],
  },
  {
    id: "ai",
    category: "Assistant IA",
    title: "Utiliser l’Assistant IA conversationnel",
    summary:
      "Poser une question ou construire un plan modifiable, avec une conversation propre à chaque projet.",
    keywords: [
      "ia",
      "ai",
      "assistant",
      "intelligence artificielle",
      "conversation",
      "questions rapides",
      "generer carte",
      "plan",
      "supprimer etape",
      "regler etape",
      "plan applique",
    ],
    steps: [
      "Une discussion appartient au projet courant ; les conversations de projets différents restent séparées.",
      "Une question simple peut recevoir une réponse simple sans imposer un plan.",
      "Lorsque plusieurs choix importants sont ambigus, l’Assistant peut poser quelques questions rapides avant de proposer un plan.",
      "Chaque étape du plan peut être supprimée ou ouverte pour préciser son intention sans réécrire tout le reste.",
      "L’Assistant peut agir sur les objets, le titre, la légende, le rendu, les écritures et le détail du fond, mais il ne change jamais automatiquement le fond de carte.",
      "Une fois le plan réellement exécuté, l’Assistant affiche Plan appliqué et ne présente plus les étapes comme si elles restaient à effectuer.",
    ],
  },
  {
    id: "ai-buildings-routes",
    category: "Assistant IA",
    title: "IA avec imports de bâtiments ou de routes",
    summary:
      "Comprendre les phases zone, chargement, sélection humaine et reprise du plan lorsqu’un import cartographique est nécessaire.",
    keywords: [
      "ia batiments",
      "ia routes",
      "selection ia",
      "zone automatique",
      "chargement plein ecran",
      "voile blanc",
      "routes ia",
      "batiments ia",
      "plan applique",
    ],
    steps: [
      "L’Assistant ne lance un import Bâtiments ou Routes que si la demande en a réellement besoin.",
      "En zone automatique, une zone est d’abord proposée puis validée. Toute zone ajustée et validée devient la référence autoritaire pour l’analyse suivante.",
      "Pendant le chargement ou l’analyse des bâtiments et des routes, un voile blanc recouvre l’écran et bloque les boutons afin d’éviter toute interaction avec l’éditeur.",
      "Lorsqu’une sélection humaine est nécessaire, le sélecteur plein écran s’ouvre et l’Assistant se masque pour laisser la carte utilisable.",
      "Après validation, l’Assistant reprend la suite du plan à partir des bâtiments ou routes réellement conservés.",
      "Après application complète du plan, l’état Plan appliqué remplace la liste des étapes terminées.",
    ],
  },
  {
    id: "render",
    category: "Rendu et export",
    title: "Légende & Rendu final",
    summary:
      "Voir le rendu final, modifier la légende et calibrer les derniers détails avant l’export.",
    keywords: [
      "legende",
      "rendu final",
      "preview",
      "previsualisation",
      "export",
      "telecharger",
      "png",
      "pdf",
      "svg",
      "webp",
      "jpeg",
    ],
    steps: [
      "Ouvrir Légende & Rendu final pour afficher l’aperçu final au-dessus de l’éditeur déjà chargé.",
      "Régler le titre de la carte, la légende, l’échelle, le nord, les écritures du fond et le niveau de détail.",
      "Lorsque la légende est sur la carte, déplacer son bloc ou réordonner séparément ses éléments avec leurs poignées.",
      "Ouvrir Apparence de la légende pour les tailles, espacements et l’édition avancée.",
      "Ouvrir Télécharger pour choisir le format et la qualité d’export disponibles.",
    ],
  },
  {
    id: "legend",
    category: "Rendu et export",
    title: "Organiser et modifier la légende",
    summary:
      "Gérer titre, sous-titres, figurés, éléments masqués, retours à la ligne et position de la légende.",
    keywords: [
      "legende",
      "multiligne",
      "plusieurs lignes",
      "position haut",
      "gauche",
      "droite",
      "bas",
      "sur carte",
      "sous titre",
      "figure",
      "ordre",
      "masques",
      "corbeille rouge",
      "apparence",
      "edition avancee",
      "aligner taille",
    ],
    steps: [
      "La légende peut être placée à gauche, à droite, en haut, en bas ou directement sur la carte.",
      "Les libellés peuvent passer sur plusieurs lignes dans toutes ces positions.",
      "Lorsque la légende est sur la carte, son titre reste dans le bloc de légende ; le Titre de la carte est une fonction séparée.",
      "+ Sous-titre crée une section pour organiser les figurés.",
      "La petite corbeille rouge visible sur un élément sert à le masquer dans la légende sans supprimer l’objet de la carte. Masqués permet ensuite de le réafficher.",
      "Utiliser la poignée d’un figuré pour modifier son ordre ou le déplacer dans un autre sous-titre.",
      "L’édition avancée sert à modifier la légende plus précisément : modifier un seul figuré, aligner la taille des figurés avec celle des objets sur la carte, créer un nouvel élément de légende et régler les espacements.",
    ],
  },
  {
    id: "map-title",
    category: "Rendu et export",
    title: "Ajouter un titre directement sur la carte",
    summary:
      "Créer un titre indépendant de la légende, modifier sa taille et sa couleur puis le déplacer dans le rendu.",
    keywords: [
      "titre carte",
      "titre de la carte",
      "nom sur carte",
      "grand titre",
      "texte export",
    ],
    steps: [
      "Dans Légende & Rendu final, ouvrir Titre de la carte.",
      "Saisir le texte souhaité.",
      "Régler sa taille et sa couleur puis le déplacer directement dans l’aperçu.",
      "Le titre de la carte est distinct du titre de la légende et reste enregistré avec le projet et les exports.",
    ],
  },
  {
    id: "scale-north-detail",
    category: "Rendu et export",
    title: "Échelle, nord, écritures et niveau de détail",
    summary:
      "Régler la taille et la position des éléments cartographiques et alléger le fond sans modifier les objets DroMap.",
    keywords: [
      "echelle",
      "taille echelle",
      "nord",
      "fleche nord",
      "taille nord",
      "ecritures fond",
      "masquer texte fond",
      "pictogrammes fond",
      "detail fond",
    ],
    steps: [
      "Échelle permet d’activer l’échelle, de choisir son style, de la déplacer et de régler sa taille approximativement de 50 % à 200 %.",
      "Nord permet d’activer la flèche du nord, de choisir son style, de la déplacer et de régler sa taille dans la même plage.",
      "Échelle et nord restent des éléments cartographiques indépendants et ne deviennent jamais des entrées de légende.",
      "Masquer les écritures du fond retire, sur les fonds compatibles, les textes, cartouches et petits symboles du fond.",
      "Détail du fond augmente ou réduit l’information du fond vectoriel sans changer la taille des objets DroMap.",
    ],
  },
  {
    id: "satellite-export",
    category: "Rendu et export",
    title: "Fond satellite, crédits et export Très haute qualité",
    summary:
      "Conserver des crédits lisibles sur le satellite et comprendre le traitement spécifique des tuiles en Très haute qualité.",
    keywords: [
      "satellite",
      "ign satellite",
      "credits satellite",
      "attribution",
      "opacite credits",
      "tres haute",
      "4x",
      "carres noirs",
      "tuiles",
      "export satellite",
    ],
    steps: [
      "Avec le fond satellite, les crédits cartographiques affichés en bas de la carte utilisent une opacité de 100 % afin de rester lisibles.",
      "La qualité Très haute augmente la définition du fichier sans changer les proportions, le cadrage ni la taille relative des éléments.",
      "L’export Très haute charge les tuiles satellite de manière contrôlée et retente les tuiles qui échouent afin d’éviter les zones manquantes.",
      "Lorsqu’une tuile Très haute reste indisponible, une couche satellite de secours moins détaillée peut être utilisée localement plutôt qu’un carré noir.",
      "Les attributions obligatoires restent la dernière couche visuelle de la carte afin de ne pas être masquées par les objets.",
    ],
  },
  {
    id: "save",
    category: "Sauvegarde et dépannage",
    title: "Sauvegarde, fermeture et reprise",
    summary:
      "Comprendre l’état Enregistré, les changements en attente et la restauration du projet après fermeture.",
    keywords: [
      "sauvegarde",
      "sauvegarder",
      "enregistrer",
      "enregistre",
      "autosave",
      "fermer",
      "recharger",
      "restaurer",
      "perdu",
    ],
    steps: [
      "Observer l’état de sauvegarde dans la barre du projet : Enregistrement…, Enregistré, Synchronisation en attente ou Hors ligne.",
      "Chaque geste terminé reçoit rapidement une copie locale de sécurité. La synchronisation en ligne est déclenchée après plusieurs changements significatifs, lors d’un enregistrement manuel ou avant une sortie prévisible.",
      "Hors ligne, DroMap conserve les changements disponibles sur l’appareil puis reprend la synchronisation au retour du réseau.",
      "Utiliser Enregistrer avant une opération importante pour déclencher immédiatement l’enregistrement disponible.",
      "À la réouverture, le projet restaure le fond, la zone, les objets, les calques, la légende, le titre, l’échelle, le nord et les réglages de rendu enregistrés.",
    ],
  },
  {
    id: "undo",
    category: "Sauvegarde et dépannage",
    title: "Annuler et rétablir avec Ctrl + Z et Ctrl + Y",
    summary:
      "Utiliser un historique propre au projet sans annuler l’état restauré lors de l’ouverture.",
    keywords: [
      "ctrl z",
      "annuler",
      "undo",
      "retablir",
      "ctrl y",
      "historique",
      "ouverture projet",
      "calque import",
      "zone disparait",
    ],
    steps: [
      "Ouvrir ou recharger un projet établit une nouvelle référence : avant la première action réelle, Ctrl + Z et Ctrl + Y ne modifient rien.",
      "Ctrl + Z annule les actions historisées du projet courant. Un import qui crée un calque doit aussi pouvoir supprimer ce calque lors de l’annulation.",
      "Ctrl + Y ou Ctrl + Maj + Z rétablit l’action dans le même contexte.",
      "Passer d’un projet à un autre ne doit jamais permettre à l’historique du premier projet de modifier le second.",
      "Dans un champ texte, l’annulation native de la saisie reste prioritaire.",
    ],
  },
  {
    id: "guest",
    category: "Compte et accès",
    title: "Mode sans compte et fonctions réservées",
    summary:
      "Comprendre ce qui reste local et quelles fonctions dépendent d’un compte ou d’une offre premium.",
    keywords: [
      "invite",
      "sans compte",
      "gratuit",
      "compte",
      "restriction",
      "png standard",
      "ia bloquee",
      "batiments bloques",
      "routes bloquees",
      "legende avancee",
    ],
    steps: [
      "Sans compte, DroMap conserve un projet temporaire local et donne accès aux outils manuels essentiels avec PNG Standard et watermark.",
      "Un compte Gratuit ajoute notamment la sauvegarde en ligne et l’accès à la bibliothèque GeoJSON.",
      "Assistant IA, imports Bâtiments/Routes, marqueurs personnalisés, légende avancée, formats et qualités supérieures dépendent des droits de l’offre actuelle.",
      "Lorsqu’une fonction est réservée, DroMap indique le droit nécessaire sans supprimer ni modifier le projet courant.",
    ],
  },
  {
    id: "cloud-sync",
    category: "Compte et accès",
    title: "Synchronisation en ligne et mode hors ligne",
    summary:
      "Comprendre ce qui est enregistré sur l’appareil, ce qui est synchronisé avec le compte et la reprise après une coupure réseau.",
    keywords: [
      "synchronisation",
      "synchro",
      "cloud",
      "en ligne",
      "hors ligne",
      "offline",
      "cache",
      "autre appareil",
      "en attente",
    ],
    steps: [
      "Avec un compte, le dashboard charge d’abord les informations légères des projets ; le contenu complet est récupéré lors de l’ouverture du projet.",
      "Une fois ouvert, le projet complet est conservé sur l’appareil pour permettre une réouverture rapide et servir de filet de sécurité.",
      "Hors ligne, un projet déjà disponible sur l’appareil peut continuer à être modifié ; DroMap conserve les changements localement.",
      "Lorsque la connexion revient, DroMap reprend la synchronisation avec la version en ligne.",
      "L’indicateur de synchronisation permet de repérer les projets encore en attente.",
    ],
  },
  {
    id: "single-device",
    category: "Sauvegarde et dépannage",
    title: "Passer DroMap sur un autre appareil",
    summary:
      "Comprendre le fonctionnement prévu pour éviter les sauvegardes concurrentes sur plusieurs appareils.",
    keywords: [
      "autre appareil",
      "ordinateur",
      "session",
      "version recente",
      "synchronisation",
      "compte deja utilise",
    ],
    steps: [
      "Avant de changer d’appareil, attendre l’état Enregistré ou Synchronisé puis fermer DroMap sur le premier appareil.",
      "Se connecter ensuite avec le même compte sur le second appareil.",
      "À l’ouverture d’un projet, DroMap compare les informations disponibles et utilise la version la plus récente connue.",
      "Si le premier appareil a été fermé brutalement, le verrou d’activité finit par expirer automatiquement.",
    ],
  },
  {
    id: "personal-library",
    category: "Compte et accès",
    title: "Mes marqueurs et Mes calques sur plusieurs appareils",
    summary:
      "Retrouver la bibliothèque personnelle du compte et comprendre la synchronisation des ajouts et suppressions.",
    keywords: [
      "bibliotheque personnelle",
      "mes marqueurs",
      "mes calques",
      "calque enregistre",
      "marqueur personnel",
      "synchroniser bibliotheque",
      "autre appareil",
    ],
    steps: [
      "Avec un compte, les marqueurs personnels et les calques enregistrés sont rattachés à la bibliothèque personnelle du compte.",
      "Un ajout effectué sur un appareil apparaît sur les autres après synchronisation.",
      "Supprimer un élément de la bibliothèque le retire également des autres appareils après synchronisation.",
      "La définition d’un ancien marqueur peut rester conservée en arrière-plan pour afficher correctement des objets déjà posés sans réapparaître dans Mes marqueurs.",
    ],
  },
  {
    id: "trash",
    category: "Compte et accès",
    title: "Corbeille, restauration et suppression définitive",
    summary:
      "Comprendre la conservation temporaire et la différence entre mettre à la corbeille et supprimer définitivement.",
    keywords: [
      "corbeille",
      "supprimer projet",
      "restaurer",
      "10 jours",
      "suppression definitive",
      "vider corbeille",
    ],
    steps: [
      "Mettre un projet à la corbeille ne le détruit pas immédiatement ; il reste restaurable pendant la durée indiquée.",
      "La corbeille affiche la date prévue de suppression définitive pour chaque projet.",
      "Restaurer remet le projet dans Mes projets et annule son échéance de suppression.",
      "Supprimer définitivement ou vider la corbeille retire le projet et ses données en ligne ; cette action n’est pas annulable.",
    ],
  },
  {
    id: "account-security",
    category: "Compte et accès",
    title: "Profil, adresse e-mail et sécurité du compte",
    summary:
      "Modifier les informations du profil, l’adresse e-mail ou le mot de passe et gérer la suppression du compte.",
    keywords: [
      "profil",
      "prenom",
      "nom",
      "email",
      "adresse mail",
      "mot de passe",
      "mot de passe oublie",
      "securite",
      "supprimer compte",
    ],
    steps: [
      "Dans Compte, modifier le prénom, le nom et les informations de profil disponibles.",
      "Changer d’adresse e-mail demande le mot de passe actuel puis une confirmation envoyée par e-mail.",
      "Changer de mot de passe depuis le compte demande également le mot de passe actuel. En cas d’oubli, utiliser le parcours Mot de passe oublié.",
      "La suppression du compte demande le mot de passe actuel et une confirmation explicite ; elle supprime le profil, les projets en ligne et la bibliothèque personnelle associée.",
    ],
  },
  {
    id: "settings",
    category: "Compte et accès",
    title: "Paramètres de DroMap",
    summary:
      "Régler le dashboard, les nouveaux projets, les unités et l’aide sans modifier les invariants du produit.",
    keywords: [
      "parametres",
      "settings",
      "tri projets",
      "grille liste",
      "demarrage rapide",
      "fond demarrage",
      "calque 1",
      "unites",
      "metrique",
      "imperial",
      "animations",
      "reinitialiser tutoriel",
    ],
    steps: [
      "Choisir le tri par défaut et l’affichage Grille ou Liste du dashboard.",
      "Pour les nouveaux projets, activer ou désactiver le parcours guidé, choisir le fond de démarrage rapide et la création éventuelle de Calque 1.",
      "Choisir les unités métriques ou impériales pour l’échelle de carte.",
      "Réduire les animations ou réinitialiser le tutoriel lorsque nécessaire.",
      "Les préférences Format préféré et Qualité préférée ont été supprimées ; le format et la qualité se choisissent au moment de l’export.",
    ],
  },
  {
    id: "public-library-publication",
    category: "Publication publique",
    title: "Bibliothèque publique et publication d’une carte",
    summary:
      "Consulter les cartes publiques et publier une version figée d’une carte avec les droits nécessaires.",
    keywords: [
      "bibliotheque publique",
      "cartes publiques",
      "publication",
      "publier",
      "depublier",
      "mettre a jour publication",
      "lecture seule",
      "copie modifiable",
    ],
    steps: [
      "La bibliothèque publique et les pages de cartes publiées sont consultables gratuitement.",
      "La publication d’une carte est réservée aux comptes disposant des droits nécessaires.",
      "Publier crée une version figée : les modifications du projet privé ne remplacent pas automatiquement la version publique.",
      "Le créateur peut choisir Lecture seule, Lecture + export ou Lecture + modification + export.",
      "Mettre un projet publié à la corbeille retire sa publication.",
    ],
  },
  {
    id: "public-map-rights",
    category: "Publication publique",
    title: "Exporter ou copier une carte publique",
    summary:
      "Comprendre les permissions du créateur, l’achat éventuel et le crédit du créateur dans un export ou une copie.",
    keywords: [
      "carte publique",
      "export public",
      "acheter carte",
      "3 euros",
      "copie modifiable",
      "credit createur",
      "attribution",
    ],
    steps: [
      "La consultation reste gratuite. L’export ou la copie n’est disponible que si le créateur l’a autorisé.",
      "Le droit d’export ou de copie peut provenir d’un abonnement actif ou de l’achat de la publication lorsque cette possibilité est proposée.",
      "L’achat d’une carte publique est distinct d’Export Max et ne verrouille pas la zone de travail d’une copie.",
      "Une copie modifiable devient un projet personnel complet et conserve une attribution vers la publication d’origine.",
      "Le crédit exporté affiche uniquement le nom et le prénom du créateur. Lorsqu’il ne peut pas être supprimé, il reste visible mais peut être déplacé dans une copie modifiable. En téléchargement public direct, DroMap choisit automatiquement un coin peu occupé tant qu’aucune position manuelle n’a été définie.",
    ],
  },
  {
    id: "plans-export-max",
    category: "Compte et accès",
    title: "Formules, Export Max et verrou de zone",
    summary:
      "Distinguer abonnement premium, Export Max d’un projet propriétaire et achat d’une carte publique.",
    keywords: [
      "plus",
      "pro",
      "formule",
      "abonnement",
      "export max",
      "achat projet",
      "verrou zone",
      "premier telechargement",
      "rachat",
    ],
    steps: [
      "Plus et Pro donnent les fonctions premium de l’offre pendant la période d’abonnement active.",
      "Export Max est un achat rattaché à un projet propriétaire précis et ne se transmet pas automatiquement à une duplication.",
      "Sans abonnement premium, le premier téléchargement utilisant uniquement Export Max avertit puis peut verrouiller la modification de la zone de ce projet.",
      "Racheter Export Max sur le même projet redonne la modification de la zone jusqu’au prochain premier téléchargement.",
      "Lorsqu’un abonnement Plus, Pro ou un accès tester est actif, le verrou Export Max est ignoré et aucun nouvel export ne recrée ce verrou pendant l’abonnement.",
      "L’achat d’une carte publique est un droit séparé et n’utilise pas cette mécanique de verrouillage.",
    ],
  },
  {
    id: "contact-support",
    category: "Compte et accès",
    title: "Contacter DroMap sans quitter l’application",
    summary:
      "Envoyer une question, un bug, une suggestion ou une demande à contact@dromap.fr avec le formulaire intégré.",
    keywords: [
      "contact",
      "support",
      "envoyer message",
      "bug",
      "suggestion",
      "paiement",
      "confidentialite",
      "piece jointe",
      "contact dromap",
    ],
    steps: [
      "Ouvrir Contact dans la navigation DroMap. Le formulaire s’affiche dans l’application sans lancer Gmail, Outlook ou un autre logiciel de messagerie.",
      "Sélectionner la catégorie de la demande puis renseigner le nom, l’adresse de réponse, le sujet et le message.",
      "Il est possible de joindre jusqu’à 3 fichiers dans les formats autorisés, pour un total maximal de 3 Mo.",
      "Les informations techniques générales et le contexte d’un projet restent optionnels et ne sont transmis que s’ils sont ajoutés explicitement.",
      "Envoyer à DroMap transmet le message directement au support et affiche une confirmation lorsque l’envoi a réussi.",
    ],
  },
  {
    id: "performance",
    category: "Sauvegarde et dépannage",
    title: "Carte lente, import lourd ou projet volumineux",
    summary:
      "Réduire les ralentissements liés aux gros GeoJSON, aux bâtiments, aux routes détaillées, aux frontières ou aux exports lourds.",
    keywords: [
      "lent",
      "ralentissement",
      "lag",
      "performance",
      "rame",
      "bloque",
      "geojson lourd",
      "routes lourdes",
      "petites routes",
      "frontieres precises",
      "batiments",
      "memoire",
      "satellite",
    ],
    steps: [
      "Pour un gros GeoJSON, le conserver comme calque léger et réduire la précision d’affichage si nécessaire.",
      "Pour les routes, ne sélectionner que les niveaux réellement utiles ; la limite de zone diminue lorsque le réseau demandé devient plus détaillé.",
      "Pour les bâtiments, préférer le calque GeoJSON complet lorsqu’une édition individuelle des emprises n’est pas nécessaire.",
      "Éviter de transformer des milliers d’entités en objets DroMap lorsque l’édition individuelle n’est pas utile.",
      "Les fonds Monde avec frontières précises et certains exports Très haute qualité demandent davantage de calculs.",
      "Enregistrer le projet avant une opération particulièrement lourde.",
    ],
  },
  {
    id: "tour",
    category: "Démarrage rapide",
    title: "Tutoriel, informations de la carte et centre d’aide",
    summary:
      "Relancer le tutoriel avec ?, ouvrir les informations de la carte avec ! ou accéder au centre d’aide.",
    keywords: [
      "tutoriel",
      "aide point interrogation",
      "point exclamation",
      "informations carte",
      "visite guidee",
      "explications detaillees",
      "revoir aide",
      "bouton question",
    ],
    steps: [
      "Le tutoriel automatique est présenté lors du premier passage dans l’éditeur puis reste relançable avec le bouton ?.",
      "Le bouton ! ouvre les informations liées à la carte et le bouton Aide ouvre le centre d’aide.",
      "Les Explications détaillées encadrent les commandes une par une et peuvent afficher des reproductions non interactives des fenêtres Bâtiments, Routes ou Ajouter / Importer.",
      "Pendant le tutoriel, les interactions avec l’éditeur derrière sont bloquées ; seuls les contrôles du tutoriel restent actifs.",
      "Les séquences Bâtiments et Routes s’enchaînent directement après Imports sans demander un second clic Explications.",
    ],
  },
];

const CATEGORIES = Array.from(
  new Set(HELP_ARTICLES.map((article) => article.category)),
);

const HELP_SEARCH_SYNONYMS: Record<string, string[]> = {
  aide: ["tutoriel", "visite", "explication", "documentation"],
  annotation: ["texte", "etiquette", "label"],
  arret: ["bus", "metro", "transport", "pictogramme"],
  autosave: ["sauvegarde", "enregistrer", "enregistre", "synchronisation"],
  batiment: ["building", "immeuble", "maison", "overture", "ign", "imports"],
  carte: ["projet", "map", "rendu"],
  calque: ["layer", "couche", "geojson", "bibliotheque"],
  couche: ["calque", "layer"],
  detail: ["niveau", "zoom", "fond"],
  ecrire: ["texte", "annotation", "titre"],
  export: ["telecharger", "png", "pdf", "svg", "jpeg", "webp", "rendu"],
  fleche: ["trait", "ligne", "nord"],
  fond: ["basemap", "classique", "satellite", "ign", "blanc", "credits"],
  frontiere: ["limite", "pays", "territoire", "suivi", "remplissage"],
  geojson: ["donnees", "calque", "import", "json"],
  ia: ["assistant", "intelligence", "ai", "conversation", "plan", "questions", "routes", "batiments", "plan applique", "voile blanc"],
  icone: ["marqueur", "symbole", "pictogramme"],
  image: ["marqueur", "importer", "png", "svg"],
  import: ["ajouter", "geojson", "projet", "donnees", "routes", "batiments", "imports cartographiques"],
  inspecteur: ["selection", "objet", "etiquette", "proprietes"],
  layer: ["calque", "couche"],
  legende: ["figure", "sous titre", "rendu", "preview", "corbeille", "masques", "edition avancee"],
  ligne: ["trait", "fleche", "dessin", "suivi"],
  map: ["carte", "projet"],
  marqueur: ["symbole", "icone", "pictogramme", "point", "fabric", "concepteur"],
  monde: ["global", "world", "frontieres"],
  objet: ["selection", "marqueur", "trait", "zone", "texte"],
  pictogramme: ["marqueur", "symbole", "icone"],
  preview: ["previsualisation", "rendu", "legende"],
  projet: ["carte", "sauvegarde", "dashboard", "synchronisation"],
  recherche: ["trouver", "lieu", "mots cles"],
  sauvegarde: ["enregistrer", "autosave", "reprise", "restaurer", "synchronisation", "hors ligne", "ctrl z"],
  selection: ["inspecteur", "objet", "modifier", "poignee"],
  surface: ["zone", "polygone", "remplissage"],
  symbole: ["marqueur", "icone", "pictogramme"],
  texte: ["annotation", "titre", "etiquette"],
  trait: ["ligne", "fleche", "itineraire", "dessin", "suivi"],
  tuto: ["tutoriel", "visite", "aide"],
  tutoriel: ["visite", "aide", "explication"],
  undo: ["annuler", "ctrl z", "historique"],
  cloud: ["synchronisation", "en ligne", "compte", "hors ligne"],
  appareil: ["ordinateur", "synchronisation", "compte", "session"],
  corbeille: ["supprimer", "restaurer", "10 jours", "suppression definitive"],
  horsligne: ["hors ligne", "offline", "synchronisation", "cache"],
  securite: ["mot de passe", "email", "compte", "profil"],
  synchro: ["synchronisation", "en ligne", "hors ligne", "compte"],
  zone: ["surface", "polygone", "remplissage", "workspace", "emprise", "mer", "ocean"],
  zoom: ["detail", "molette", "trackpad", "precis", "contraint"],
  route: ["routes", "autoroute", "nationale", "principale", "departementale", "secondaire", "petites routes", "geojson"],
  routes: ["route", "autoroute", "nationale", "principale", "departementale", "secondaire", "imports"],
  publication: ["bibliotheque publique", "carte publique", "publier", "export public", "copie"],
  satellite: ["ign", "fond", "orthophoto", "credits", "tres haute", "tuiles", "export"],
  accueil: ["dromap", "menu principal", "compte connecte", "mon compte", "creer projet"],
  contact: ["support", "message", "bug", "suggestion", "confidentialite"],
  parametres: ["settings", "demarrage rapide", "unites", "tutoriel", "dashboard"],
};

const HELP_SEARCH_STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "comment",
  "dans",
  "de",
  "des",
  "du",
  "et",
  "faire",
  "la",
  "le",
  "les",
  "mon",
  "ma",
  "mes",
  "pour",
  "que",
  "qui",
  "sur",
  "un",
  "une",
  "je",
  "veux",
]);

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSearchTokens(value: string) {
  return normalizeSearchText(value)
    .split(/[\s-]+/)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 1 && !HELP_SEARCH_STOP_WORDS.has(token),
    );
}

function getWordVariants(word: string) {
  const variants = new Set<string>([word]);

  if (word.length > 4 && word.endsWith("s")) variants.add(word.slice(0, -1));
  if (word.length > 5 && word.endsWith("es")) variants.add(word.slice(0, -2));
  if (word.length > 5 && word.endsWith("x")) variants.add(word.slice(0, -1));

  for (const synonym of HELP_SEARCH_SYNONYMS[word] ?? []) {
    for (const token of getSearchTokens(synonym)) variants.add(token);
  }

  return Array.from(variants);
}

function damerauLevenshtein(a: string, b: string, maxDistance = 2) {
  if (Math.abs(a.length - b.length) > maxDistance) return maxDistance + 1;

  const rows = a.length + 1;
  const columns = b.length + 1;
  const matrix = Array.from({ length: rows }, () =>
    Array.from({ length: columns }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) matrix[i][0] = i;
  for (let j = 0; j < columns; j += 1) matrix[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    let rowMinimum = maxDistance + 1;

    for (let j = 1; j < columns; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );

      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        matrix[i][j] = Math.min(matrix[i][j], matrix[i - 2][j - 2] + 1);
      }

      rowMinimum = Math.min(rowMinimum, matrix[i][j]);
    }

    if (rowMinimum > maxDistance && i > maxDistance + 2) {
      return maxDistance + 1;
    }
  }

  return matrix[a.length][b.length];
}

function fuzzyTokenScore(queryToken: string, candidateToken: string) {
  if (queryToken === candidateToken) return 120;
  if (candidateToken.startsWith(queryToken)) return 95;
  if (queryToken.startsWith(candidateToken) && candidateToken.length >= 4) {
    return 80;
  }
  if (candidateToken.includes(queryToken) || queryToken.includes(candidateToken)) {
    return 70;
  }

  if (queryToken.length < 4 || candidateToken.length < 4) return 0;

  const maxDistance =
    Math.max(queryToken.length, candidateToken.length) >= 9 ? 3 : 2;
  const distance = damerauLevenshtein(
    queryToken,
    candidateToken,
    maxDistance,
  );

  if (distance > maxDistance) return 0;
  return 58 - distance * 12;
}

function getArticleSearchText(article: HelpArticle) {
  return normalizeSearchText(
    [
      article.title,
      article.category,
      article.summary,
      ...article.keywords,
      ...article.steps,
      article.note ?? "",
    ].join(" "),
  );
}

function scoreHelpArticle(article: HelpArticle, rawQuery: string) {
  const normalizedQuery = normalizeSearchText(rawQuery);
  const queryTokens = getSearchTokens(rawQuery);
  if (!normalizedQuery || queryTokens.length === 0) return 1;

  const normalizedTitle = normalizeSearchText(article.title);
  const normalizedSummary = normalizeSearchText(article.summary);
  const normalizedKeywords = normalizeSearchText(article.keywords.join(" "));
  const fullText = getArticleSearchText(article);
  const candidateTokens = fullText.split(/[\s-]+/).filter(Boolean);

  let score = 0;
  let matchedGroups = 0;

  for (const queryToken of queryTokens) {
    const variants = getWordVariants(queryToken);
    let best = 0;

    for (const variant of variants) {
      if (normalizedTitle.includes(variant)) best = Math.max(best, 145);
      if (normalizedKeywords.includes(variant)) best = Math.max(best, 125);
      if (normalizedSummary.includes(variant)) best = Math.max(best, 105);
      if (fullText.includes(variant)) best = Math.max(best, 85);

      for (const candidateToken of candidateTokens) {
        best = Math.max(best, fuzzyTokenScore(variant, candidateToken));
      }
    }

    if (best > 0) {
      matchedGroups += 1;
      score += best;
    }
  }

  if (normalizedTitle.includes(normalizedQuery)) score += 320;
  if (normalizedKeywords.includes(normalizedQuery)) score += 220;
  if (fullText.includes(normalizedQuery)) score += 120;

  const requiredMatches =
    queryTokens.length <= 2 ? queryTokens.length : Math.ceil(queryTokens.length * 0.6);

  if (matchedGroups < requiredMatches) {
    score *= matchedGroups / Math.max(1, requiredMatches) * 0.45;
  }

  return score;
}

function HelpArticleCard({
  article,
  open,
  onToggle,
}: {
  article: HelpArticle;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <article
      id={`help-article-${article.id}`}
      className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
        aria-expanded={open}
      >
        <span>
          <span className="text-[11px] font-black uppercase tracking-wide text-teal-600">
            {article.category}
          </span>
          <span className="mt-1 block font-black text-slate-950">
            {article.title}
          </span>
          <span className="mt-1 block text-sm leading-6 text-slate-600">
            {article.summary}
          </span>
        </span>
        <span className="mt-1 text-xl font-black text-slate-400">
          {open ? "−" : "+"}
        </span>
      </button>

      {open ? (
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
          <ol className="space-y-3">
            {article.steps.map((step, index) => (
              <li
                key={`${article.id}-${index}`}
                className="flex gap-3 text-sm leading-6 text-slate-700"
              >
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-600 text-[11px] font-black text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
          {article.note ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
              {article.note}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function HelpContent() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Toutes");
  const [openArticleId, setOpenArticleId] = useState<string | null>("first-map");

  const rankedArticles = useMemo<RankedHelpArticle[]>(() => {
    return HELP_ARTICLES.map((article) => ({
      article,
      score: scoreHelpArticle(article, query),
    }))
      .filter(({ article, score }) => {
        if (category !== "Toutes" && article.category !== category) return false;
        return query.trim() ? score >= 22 : true;
      })
      .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title, "fr"));
  }, [category, query]);

  const suggestions = useMemo(
    () => (query.trim() ? rankedArticles.slice(0, 4) : []),
    [query, rankedArticles],
  );

  function openSuggestion(articleId: string) {
    setOpenArticleId(articleId);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`help-article-${articleId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <DromapProductShell
      title="Centre d’aide"
      description="Comprendre DroMap, retrouver rapidement une fonction et apprendre à créer, modifier ou exporter une carte."
      actions={
        <Link
          href="/dashboard"
          className="inline-flex h-10 items-center rounded-xl bg-teal-600 px-4 text-sm font-black text-white transition hover:bg-teal-500"
        >
          Retour aux projets
        </Link>
      }
    >
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label
          className="block text-sm font-black text-slate-950"
          htmlFor="help-search"
        >
          Rechercher une aide
        </label>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Saisir quelques mots, même sans accents, sans majuscules ou avec une petite
          faute. Par exemple : « legnde », « geojson lourd », « zoom precis »,
          « marqueur perso » ou « ctrl z ».
        </p>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ex. comment suivre une frontière, importer des bâtiments, titre carte…"
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
        />

        {suggestions.length > 0 ? (
          <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50/70 p-3">
            <div className="text-xs font-black uppercase tracking-wide text-teal-700">
              Suggestions les plus pertinentes
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {suggestions.map(({ article }) => (
                <button
                  key={`suggestion-${article.id}`}
                  type="button"
                  onClick={() => openSuggestion(article.id)}
                  className="rounded-xl border border-teal-100 bg-white px-3 py-2 text-left transition hover:border-teal-300 hover:bg-teal-50"
                >
                  <span className="block text-sm font-black text-slate-950">
                    {article.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                    {article.summary}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {["Toutes", ...CATEGORIES].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-bold transition",
                category === item
                  ? "border-teal-600 bg-teal-600 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              ].join(" ")}
            >
              {item}
            </button>
          ))}
        </div>
      </section>

      <div className="mt-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-slate-950">
            {query.trim() ? "Résultats proposés" : "Toutes les rubriques"}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {rankedArticles.length} article{rankedArticles.length > 1 ? "s" : ""}
            {query.trim() ? " correspondant à la recherche" : " disponible(s)"}.
          </p>
        </div>
        {query.trim() ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
          >
            Effacer la recherche
          </button>
        ) : null}
      </div>

      <div className="mt-3 grid gap-3">
        {rankedArticles.map(({ article }) => (
          <HelpArticleCard
            key={article.id}
            article={article}
            open={openArticleId === article.id}
            onToggle={() =>
              setOpenArticleId((current) =>
                current === article.id ? null : article.id,
              )
            }
          />
        ))}

        {rankedArticles.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm leading-6 text-slate-600">
            Aucun article n’est assez proche de cette recherche. Essayer avec un mot
            principal comme « marqueur », « zone », « calque », « légende »,
            « export », « bâtiments » ou « sauvegarde ».
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-5 text-sm leading-6 text-teal-950">
        <strong className="font-black">Besoin d’aide directement dans l’éditeur ?</strong>{" "}
        Le bouton <strong>?</strong> relance à tout moment la visite guidée. Les
        Explications détaillées encadrent ensuite les commandes une par une et
        peuvent ouvrir temporairement les panneaux nécessaires sans modifier le
        projet.
      </div>
    </DromapProductShell>
  );
}

export function DromapHelpClient() {
  return (
    <DromapProductBootstrap>
      <HelpContent />
    </DromapProductBootstrap>
  );
}
