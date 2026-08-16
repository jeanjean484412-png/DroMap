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
      "Passer du tableau de bord à l’éditeur en choisissant un fond, une zone et une structure de calques.",
    keywords: [
      "nouveau projet",
      "commencer",
      "premiere carte",
      "creation",
      "debutant",
      "parcours",
      "configuration",
    ],
    steps: [
      "Depuis Mes projets, choisis Nouveau projet.",
      "Donne un nom à la carte, ou conserve Projet sans titre. Ce choix pourra être modifié plus tard.",
      "Choisis le fond de carte puis définis la zone de travail. Avec un fond blanc territorial, la zone correspondante peut être proposée automatiquement.",
      "Valide la zone pour obtenir le cadrage de référence du projet.",
      "Choisis un calque vide, un calque enregistré, un GeoJSON ou l’option permettant de commencer sans calque DroMap.",
      "Clique sur Commencer à créer la carte. Le tutoriel de l’éditeur s’affiche automatiquement uniquement lors du premier projet.",
    ],
  },
  {
    id: "basemaps",
    category: "Comprendre DroMap",
    title: "Choisir et changer le fond de carte",
    summary:
      "Utiliser Classique, Clair, Satellite, Plan IGN ou un fond blanc sans déplacer le travail déjà créé.",
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
      "Ouvre Fond de carte dans l’éditeur pour retrouver les fonds disponibles.",
      "Les fonds classiques servent de contexte détaillé ; les fonds blancs sont adaptés aux cartes pédagogiques où tu veux mettre en avant tes propres objets.",
      "Changer de fond avec une zone déjà validée doit conserver la zone, le centre et le zoom du projet.",
      "Sur certains fonds vectoriels, tu peux masquer les écritures et petits symboles depuis Légende & Rendu final.",
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
      "Dans Fond de carte, ouvre la famille Fonds blancs puis le territoire souhaité.",
      "Pour un pays ou un continent, DroMap peut créer automatiquement une zone de travail autour du territoire ; il reste alors à la valider.",
      "Les frontières précises du monde entier et l’Europe entière peuvent être plus lourdes à afficher : un avertissement est prévu avant leur utilisation.",
      "Sur les fonds pays, le contexte des pays voisins peut être affiché sans modifier la zone de travail.",
    ],
  },
  {
    id: "workspace",
    category: "Comprendre DroMap",
    title: "Zone de travail",
    summary:
      "Définir le territoire dans lequel tu édites la carte et comprendre ce qui se passe quand tu le modifies.",
    keywords: [
      "zone",
      "zone de travail",
      "emprise",
      "rectangle",
      "selectionner le monde",
      "cadrage",
      "limites",
    ],
    steps: [
      "La zone de travail est le territoire dans lequel tu construis la carte.",
      "Tu peux la définir par recherche, rectangle manuel, fond blanc territorial ou sélection du monde entier.",
      "Valide toujours la zone : DroMap calcule alors le cadrage de référence et le niveau de détail associé.",
      "Dans l’éditeur, Modifier la zone permet de la reprendre sans supprimer silencieusement les objets situés à l’extérieur.",
    ],
  },
  {
    id: "zoom-precise",
    category: "Comprendre DroMap",
    title: "Zoom précis dans la zone de travail",
    summary:
      "Débloquer temporairement un zoom plus fluide pour rechercher ou placer précisément des éléments sans changer le rendu final.",
    keywords: [
      "zoom",
      "zoom libre",
      "zoom precis",
      "dezoom",
      "detail",
      "niveau de detail",
      "molette",
      "trackpad",
      "fluide",
    ],
    steps: [
      "À côté de Zone de travail, active Zoom précis lorsque tu as besoin de regarder un endroit de très près.",
      "Le zoom se comporte alors comme avant la validation d’une zone : il est continu, fractionnaire et centré sous le curseur.",
      "La zone reste la limite logique du projet : ce mode sert seulement à explorer plus précisément son intérieur.",
      "Le niveau de détail enregistré pour l’aperçu et l’export n’est pas remplacé par ce zoom temporaire.",
    ],
  },
  {
    id: "inspector",
    category: "Comprendre DroMap",
    title: "À quoi sert l’inspecteur ?",
    summary:
      "Modifier ce qui existe déjà sur la carte : sélection, liste des objets et étiquettes.",
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
      "La barre d’outils sert surtout à créer ; l’inspecteur sert surtout à modifier et organiser les éléments déjà présents.",
      "Sélection affiche les propriétés de l’objet ou des objets actuellement sélectionnés : nom, style, visibilité, verrouillage et autres réglages compatibles.",
      "Objets permet de retrouver un élément dans une carte chargée, de le sélectionner et de le recentrer volontairement.",
      "Étiquettes rassemble les réglages des noms affichés près des objets et leur visibilité.",
      "Quand tu cliques directement sur un objet de la carte, DroMap ouvre automatiquement l’inspecteur sur Sélection pour que tu puisses le modifier immédiatement.",
    ],
  },
  {
    id: "layers",
    category: "Comprendre DroMap",
    title: "Calques DroMap et calques GeoJSON",
    summary:
      "Organiser des groupes d’objets ou de données et les afficher, masquer, verrouiller ou réordonner ensemble.",
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
      "Ouvre Calques sous Fond de carte dans l’éditeur.",
      "Le calque actif reçoit les nouveaux objets DroMap créés ensuite.",
      "Tu peux changer l’ordre, la visibilité, l’opacité ou le verrouillage d’un calque sans modifier individuellement chacun de ses objets.",
      "Les calques GeoJSON restent groupés et légers ; les calques DroMap contiennent des objets modifiables individuellement.",
      "Un calque enregistré peut être réutilisé dans d’autres projets depuis la bibliothèque de calques.",
    ],
  },
  {
    id: "markers",
    category: "Outils de carte",
    title: "Poser et modifier des marqueurs",
    summary:
      "Choisir un symbole, préparer son apparence puis le poser plusieurs fois avec une proportion cohérente.",
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
      "Clique sur Marqueur puis sur le petit bouton de choix du symbole.",
      "Recherche un pictogramme par mot-clé. La recherche ignore les majuscules et accents et tolère de petites fautes de frappe.",
      "Choisis ensuite les paramètres du prochain marqueur : taille, couleur, opacité, contour et remplissage lorsque disponible.",
      "Déplace le fantôme sur la carte puis clique pour poser. Sa proportion doit correspondre à l’objet final, quel que soit le zoom utilisé pendant la pose.",
      "Pour modifier un marqueur déjà posé, sélectionne-le sur la carte et utilise l’onglet Sélection de l’inspecteur.",
    ],
  },
  {
    id: "custom-markers",
    category: "Outils de carte",
    title: "Marqueurs personnels : enregistrés, dessinés ou importés",
    summary:
      "Réutiliser tes marqueurs enregistrés puis, si nécessaire, créer un symbole annexe en le dessinant ou en important une image.",
    keywords: [
      "mes marqueurs",
      "marqueur personnel",
      "dessiner marqueur",
      "importer marqueur",
      "image",
      "svg",
      "png",
      "personnalise",
    ],
    steps: [
      "Dans le choix des marqueurs, Mes marqueurs apparaît avant les fonctions de création personnalisée afin de privilégier la réutilisation.",
      "Clique sur un marqueur enregistré pour le sélectionner immédiatement.",
      "Si aucun symbole ne convient, utilise ensuite Dessiner un marqueur pour le construire avec les outils DroMap.",
      "Importer un marqueur accepte PNG, JPEG, WebP ou SVG ; la transparence est conservée lorsque le format le permet.",
      "En mode invité, un marqueur personnel reste dans le projet temporaire. Avec un compte, Mes marqueurs fait partie de ta bibliothèque personnelle et se retrouve sur tes autres appareils après synchronisation.",
    ],
  },
  {
    id: "lines",
    category: "Outils de carte",
    title: "Traits : classique, dessin libre et suivi",
    summary:
      "Choisir la bonne manière de dessiner une ligne selon que tu veux des segments précis, un geste à main levée ou suivre un contour existant.",
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
      "Trait classique : clique point par point pour relier des villes, créer un axe, un itinéraire simplifié, une séparation ou une flèche.",
      "Dessin libre : maintiens la souris et dessine comme avec un crayon pour une courbe ou un tracé approximatif ; le lissage permet de rendre le résultat plus régulier.",
      "Suivi de trait : clique-glisse près d’une frontière, d’un contour ou d’une ligne déjà visible pour que DroMap la suive automatiquement.",
      "Le suivi n’est disponible que si une ligne exploitable est visible, par exemple sur certains fonds blancs ou dans un calque GeoJSON.",
      "Les paramètres du trait préparent les prochaines poses ; un trait existant se modifie en le sélectionnant sur la carte.",
    ],
  },
  {
    id: "zones",
    category: "Outils de carte",
    title: "Zones : classique, libre, remplissage et formes rapides",
    summary:
      "Créer une surface personnalisée, dessiner à main levée, reprendre un territoire existant ou poser une forme simple.",
    keywords: [
      "zone",
      "surface",
      "polygone",
      "remplissage",
      "forme",
      "rectangle",
      "cercle",
      "ellipse",
      "hachure",
      "points",
    ],
    steps: [
      "Zone classique : clique point par point autour d’un espace que tu veux délimiter précisément toi-même.",
      "Zone libre : maintiens la souris pour entourer rapidement une surface à main levée, par exemple une aire approximative ou diffuse.",
      "Remplissage : clique sur un pays, une région, un département ou une zone déjà disponible pour reprendre directement son contour exact.",
      "Forme rapide : utilise rectangle, cercle ou ellipse lorsque tu veux surtout mettre en évidence une partie de la carte sans suivre une frontière réelle.",
      "Dans les paramètres, tu peux régler séparément contour, fond, opacité, hachures et semis de points.",
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
      "Active Texte puis clique à l’endroit où le texte doit apparaître.",
      "Saisis le contenu directement après la pose.",
      "Les paramètres permettent de préparer taille, gras, italique, rotation, contour des lettres, fond et cadre.",
      "Un texte déjà posé se modifie depuis Sélection dans l’inspecteur.",
      "La taille relative doit rester identique dans l’éditeur, l’aperçu et le fichier exporté.",
    ],
  },
  {
    id: "selection",
    category: "Outils de carte",
    title: "Sélectionner et modifier un objet",
    summary:
      "Cliquer un objet pour ouvrir immédiatement ses propriétés dans l’inspecteur.",
    keywords: [
      "selectionner",
      "selection",
      "modifier",
      "poignee",
      "deplacer",
      "dupliquer",
      "supprimer",
      "verrouiller",
    ],
    steps: [
      "Quand aucun outil de création n’est actif, clique sur un objet pour le sélectionner.",
      "L’inspecteur s’ouvre automatiquement sur Sélection afin d’afficher ses propriétés.",
      "Les objets qui le permettent affichent aussi leurs poignées de modification directement sur la carte.",
      "Les actions comme dupliquer, verrouiller, changer l’ordre ou supprimer restent accessibles depuis l’inspecteur et les raccourcis compatibles.",
    ],
  },
  {
    id: "multi-selection",
    category: "Outils de carte",
    title: "Sélection multiple et modification groupée",
    summary:
      "Sélectionner plusieurs objets et appliquer une modification commune sans perdre leurs poignées disponibles.",
    keywords: [
      "selection multiple",
      "plusieurs objets",
      "groupe",
      "modifier ensemble",
      "multi selection",
      "poignees",
    ],
    steps: [
      "Active la sélection multiple depuis l’onglet Sélection de l’inspecteur.",
      "Clique sur les objets de la carte pour les ajouter ou les retirer de la sélection.",
      "Les objets sélectionnés restent surlignés et conservent leurs poignées lorsqu’ils en possèdent.",
      "Applique ensuite une propriété commune compatible : couleur, opacité, taille, épaisseur ou visibilité des étiquettes.",
      "Les objets effectivement verrouillés sont exclus des modifications destructives.",
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
      "Ouvre Étiquettes dans l’inspecteur.",
      "Choisis l’affichage général puis, si nécessaire, force une étiquette particulière visible ou masquée.",
      "Déplace une étiquette directement sur la carte pour ajuster son placement.",
      "Utilise le retour au placement automatique pour annuler un déplacement manuel.",
      "La taille, le retour à la ligne et le contour doivent rester identiques en édition, aperçu et export.",
    ],
  },
  {
    id: "place-search",
    category: "Outils de carte",
    title: "Rechercher un lieu",
    summary:
      "Retrouver rapidement une ville, une adresse, un pays ou un lieu nommé dans la carte.",
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
      "Clique sur Rechercher un lieu à gauche des panneaux Fond de carte et Calques.",
      "Saisis une ville, une adresse, un pays ou un lieu connu, puis lance la recherche.",
      "Choisis un résultat si plusieurs propositions existent.",
      "Dans l’éditeur, vérifie toujours les conséquences sur une zone de travail existante avant de la modifier.",
    ],
  },
  {
    id: "geojson",
    category: "Données",
    title: "Importer un GeoJSON",
    summary:
      "Choisir entre un calque léger pour la fluidité et des objets DroMap pour l’édition individuelle.",
    keywords: [
      "geojson",
      "json geo",
      "donnees",
      "import",
      "entites",
      "precision",
      "leger",
      "convertir",
      "500 objets",
    ],
    steps: [
      "Clique sur Ajouter / Importer dans la barre supérieure.",
      "Sélectionne le fichier puis vérifie le nombre d’entités, le poids et la complexité annoncée.",
      "Choisis Calque GeoJSON pour conserver les données groupées et rapides à afficher.",
      "Choisis Objets DroMap si tu as besoin de sélectionner et modifier chaque entité individuellement.",
      "En mode GeoJSON, adapte la précision d’affichage si le calque est très lourd ; les données originales restent conservées.",
    ],
    note:
      "Transformer plusieurs centaines ou milliers d’entités en objets DroMap peut ralentir fortement le navigateur. Utilise cette conversion uniquement si l’édition individuelle est réellement nécessaire.",
  },
  {
    id: "project-import",
    category: "Données",
    title: "Importer un Projet DroMap",
    summary:
      "Réouvrir une carte complète contenant son fond, sa zone, ses objets, ses calques, sa légende et ses réglages de rendu.",
    keywords: [
      "projet dromap",
      "import projet",
      "ouvrir sauvegarde",
      "json projet",
      "restaurer projet",
      "fusion",
    ],
    steps: [
      "Depuis le tableau de bord, Importer un Projet DroMap crée un nouveau projet à partir du fichier.",
      "Le fichier peut contenir le fond, la zone, les objets, les calques, les étiquettes, la légende, l’échelle, le nord et les réglages de rendu.",
      "Les anciens projets qui ne possèdent pas certains champs récents reçoivent des valeurs par défaut compatibles.",
      "Dans l’éditeur, DroMap analyse d’abord le fichier puis ajoute son contenu au projet courant. Le fond et la zone actuels sont conservés par défaut ; tu peux choisir explicitement d’utiliser ceux du projet importé.",
    ],
  },
  {
    id: "buildings",
    category: "Données",
    title: "Importer des bâtiments",
    summary:
      "Ajouter les bâtiments d’une zone entière comme données légères ou sélectionner quelques bâtiments comme objets DroMap.",
    keywords: [
      "batiment",
      "batiments",
      "building",
      "immeuble",
      "maison",
      "ign",
      "overture",
      "ville",
    ],
    steps: [
      "Le bouton Bâtiments n’est disponible qu’avec une zone de travail réellement validée et pour les comptes autorisés.",
      "Tous les bâtiments est adapté à une zone dense : ils restent regroupés dans un calque GeoJSON plus léger.",
      "Sélectionner certains permet de choisir quelques bâtiments précis et de les transformer en objets DroMap individuellement éditables.",
      "Les bâtiments ciblés gardent une géométrie fixe afin d’éviter les déformations accidentelles.",
    ],
  },
  {
    id: "ai",
    category: "Assistant IA",
    title: "Utiliser l’Assistant IA",
    summary:
      "Poser une question, demander une modification ou préparer une carte tout en gardant les objets DroMap éditables.",
    keywords: [
      "ia",
      "ai",
      "assistant",
      "intelligence artificielle",
      "generer carte",
      "modifier automatiquement",
      "plan",
    ],
    steps: [
      "Ouvre Assistant IA depuis l’éditeur lorsque ton compte y a accès.",
      "Pour une question simple, demande directement comment utiliser DroMap ou comment réaliser une opération.",
      "Pour une création ou une modification importante, DroMap peut préparer un plan et un aperçu temporaire avant validation.",
      "Tant que l’aperçu n’est pas validé, tu dois pouvoir abandonner et retrouver exactement la carte précédente.",
      "L’objectif est de créer des objets DroMap structurés et modifiables, pas seulement une image finale.",
    ],
  },
  {
    id: "render",
    category: "Rendu et export",
    title: "Légende & Rendu final",
    summary:
      "Préparer l’aperçu final sans décharger l’éditeur, puis télécharger un fichier fidèle à ce qui est affiché.",
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
      "Clique sur Légende & Rendu final. L’écran s’ouvre au-dessus de l’éditeur déjà chargé.",
      "Règle le titre de la carte, la légende, l’échelle, le nord, les écritures du fond et le niveau de détail.",
      "Si la légende est sur la carte, déplace son bloc ou réordonne séparément ses éléments avec leurs poignées.",
      "Utilise Apparence de la légende pour les tailles, espacements et l’accès à l’édition avancée lorsque cette fonction est autorisée.",
      "Retour à l’éditeur ferme simplement l’écran de rendu : la carte ne doit pas être rechargée.",
    ],
  },
  {
    id: "legend",
    category: "Rendu et export",
    title: "Organiser la légende",
    summary:
      "Modifier le titre, les sous-titres, l’ordre, les éléments masqués et l’apparence des figurés.",
    keywords: [
      "legende",
      "sous titre",
      "sous-legende",
      "figure",
      "figure de legende",
      "ordre",
      "masques",
      "apparence",
      "edition avancee",
    ],
    steps: [
      "Dans Légende & Rendu final, + Titre crée ou réaffiche le titre principal de la légende.",
      "+ Sous-titre crée une nouvelle section pour organiser les figurés.",
      "Masqués apparaît lorsqu’au moins un élément a été caché et permet de le restaurer.",
      "Glisse les éléments pour changer leur ordre ou les déplacer d’un sous-titre à un autre, y compris quand la légende est placée sur la carte.",
      "L’édition avancée permet des réglages plus fins sans modifier l’apparence réelle des objets de la carte.",
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
      "Dans Légende & Rendu final, ouvre Titre de la carte.",
      "Saisis le texte souhaité ; plusieurs lignes sont possibles lorsque le rendu le permet.",
      "Règle sa taille et sa couleur puis déplace-le directement dans l’aperçu.",
      "Ce titre est distinct du titre de la légende et doit être sauvegardé avec le projet et les exports.",
    ],
  },
  {
    id: "scale-north-detail",
    category: "Rendu et export",
    title: "Échelle, nord, écritures et niveau de détail",
    summary:
      "Régler les éléments cartographiques et alléger le fond sans modifier les objets DroMap.",
    keywords: [
      "echelle",
      "nord",
      "fleche nord",
      "ecritures fond",
      "masquer texte fond",
      "arretd bus",
      "metro",
      "pictogrammes fond",
      "detail fond",
    ],
    steps: [
      "Échelle permet d’activer l’échelle, de choisir son style et de la déplacer dans l’aperçu.",
      "Nord permet d’activer la flèche du nord, de choisir son style et sa position.",
      "Masquer les écritures du fond retire, sur les fonds compatibles, les textes, cartouches et petits symboles comme certains arrêts ou points d’intérêt.",
      "Détail du fond augmente ou réduit l’information du fond vectoriel sans changer la taille des marqueurs, textes, lignes, zones ou étiquettes.",
    ],
  },
  {
    id: "save",
    category: "Sauvegarde et dépannage",
    title: "Sauvegarde, fermeture et reprise",
    summary:
      "Comprendre Enregistré, les changements en attente et la restauration du projet après fermeture.",
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
      "Observe l’état de sauvegarde dans la barre du projet : Enregistrement…, Enregistré, Synchronisation en attente ou Hors ligne.",
      "Chaque geste terminé reçoit rapidement une copie locale de sécurité. La synchronisation en ligne est déclenchée après cinq changements significatifs, lors d’un enregistrement manuel ou avant une sortie prévisible.",
      "Si la connexion disparaît, continue à travailler : DroMap conserve les changements sur cet appareil puis reprend la synchronisation au retour du réseau.",
      "Clique sur Enregistrer avant une opération importante si tu veux déclencher immédiatement l’enregistrement et la synchronisation disponibles.",
      "À la réouverture, le projet doit restaurer le fond, la zone, les objets, les calques, la légende, le niveau de détail, les écritures, le titre, l’échelle et le nord.",
    ],
  },
  {
    id: "undo",
    category: "Sauvegarde et dépannage",
    title: "Annuler et rétablir avec Ctrl+Z",
    summary:
      "Utiliser un historique adapté à la fenêtre dans laquelle tu travailles.",
    keywords: [
      "ctrl z",
      "annuler",
      "undo",
      "retablir",
      "ctrl y",
      "historique",
      "erreur",
    ],
    steps: [
      "Dans l’éditeur, Ctrl+Z annule uniquement les actions de la carte et des objets.",
      "Dans Légende & Rendu final, Ctrl+Z annule uniquement les modifications réalisées dans cet espace de rendu.",
      "Ctrl+Y ou Ctrl+Maj+Z rétablit l’action dans le même contexte.",
      "Quand tu écris dans un champ texte, l’annulation native de la saisie reste prioritaire.",
    ],
  },
  {
    id: "guest",
    category: "Compte et accès",
    title: "Mode invité et fonctions réservées",
    summary:
      "Créer une carte sans compte tout en comprenant ce qui reste local et les fonctions nécessitant un compte.",
    keywords: [
      "invite",
      "sans compte",
      "compte",
      "restriction",
      "png standard",
      "ia bloquee",
      "batiments bloques",
      "legende avancee",
    ],
    steps: [
      "Un invité peut créer un projet temporaire, utiliser les outils manuels, importer un GeoJSON et un marqueur personnalisé, puis obtenir un PNG Standard.",
      "L’Assistant IA, les bâtiments, l’édition avancée de la légende, les qualités supérieures et plusieurs formats nécessitent un compte selon les droits configurés.",
      "Lorsqu’une fonction est réservée, DroMap doit expliquer son intérêt et conserver le projet courant si l’utilisateur crée ensuite un compte.",
    ],
  },
  {
    id: "cloud-sync",
    category: "Compte et accès",
    title: "Synchronisation en ligne et mode hors ligne",
    summary:
      "Comprendre ce qui est enregistré sur l’appareil, ce qui est synchronisé avec le compte et comment DroMap reprend après une coupure réseau.",
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
      "Avec un compte, le dashboard charge d’abord les informations légères des projets ; le contenu complet est récupéré seulement quand tu ouvres un projet.",
      "Une fois ouvert, le projet complet est conservé sur l’appareil pour permettre une réouverture rapide et servir de filet de sécurité.",
      "Hors ligne, continue à modifier un projet déjà disponible sur l’appareil. DroMap affiche Hors ligne et garde les changements localement.",
      "Quand la connexion revient, DroMap compare la copie locale et la version en ligne puis reprend la synchronisation.",
      "Si plusieurs projets restent en attente, clique sur l’indicateur de synchronisation pour relancer l’envoi.",
    ],
  },
  {
    id: "single-device",
    category: "Sauvegarde et dépannage",
    title: "Passer DroMap sur un autre appareil",
    summary:
      "DroMap autorise un seul appareil actif à la fois pour éviter les sauvegardes concurrentes et choisit automatiquement la version la plus récente connue.",
    keywords: [
      "autre appareil",
      "ordinateur",
      "session",
      "version recente",
      "synchronisation",
      "compte deja utilise",
    ],
    steps: [
      "Avant de changer d’ordinateur, laisse l’indicateur passer à Enregistré ou Synchronisé puis ferme DroMap sur le premier appareil.",
      "Connecte ensuite le même compte sur le second appareil. Si le premier appareil est encore actif, DroMap bloque temporairement la seconde session au lieu de laisser deux éditions concurrentes.",
      "À l’ouverture d’un projet, DroMap compare les dates locales et en ligne puis utilise automatiquement la version la plus récente qu’il connaît.",
      "Si le premier appareil a été fermé brutalement, attends quelques instants puis réessaie : son verrou d’activité expire automatiquement.",
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
      "Avec un compte, les marqueurs personnels et les calques enregistrés sont rattachés à ta bibliothèque personnelle.",
      "Un ajout effectué sur un appareil apparaît sur les autres après synchronisation ou lorsque DroMap revient au premier plan.",
      "Supprimer un élément de la bibliothèque le retire également des autres appareils après synchronisation.",
      "La définition d’un ancien marqueur peut rester conservée en arrière-plan pour afficher correctement des objets déjà posés, sans pour autant réapparaître dans Mes marqueurs ni être comptée comme marqueur personnel actif.",
    ],
  },
  {
    id: "trash",
    category: "Compte et accès",
    title: "Corbeille, restauration et suppression définitive",
    summary:
      "Comprendre la conservation de 10 jours et la différence entre mettre à la corbeille et supprimer définitivement.",
    keywords: [
      "corbeille",
      "supprimer projet",
      "restaurer",
      "10 jours",
      "suppression definitive",
      "vider corbeille",
    ],
    steps: [
      "Mettre un projet à la corbeille ne le détruit pas : il reste restaurable pendant 10 jours.",
      "La corbeille affiche la date prévue de suppression définitive pour chaque projet.",
      "Restaurer remet le projet dans Mes projets et annule son échéance de suppression.",
      "Supprimer définitivement ou vider la corbeille retire le projet et ses données en ligne ; cette action n’est pas annulable.",
      "Une fois les 10 jours écoulés, le nettoyage automatique supprime également les projets expirés qui n’ont pas été restaurés.",
    ],
  },
  {
    id: "account-security",
    category: "Compte et accès",
    title: "Profil, adresse e-mail et sécurité du compte",
    summary:
      "Modifier ton identité, ton adresse e-mail ou ton mot de passe et supprimer le compte en connaissance de cause.",
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
      "Dans Compte, modifie ton prénom, ton nom et les préférences qui doivent te suivre sur les autres appareils.",
      "Changer d’adresse e-mail demande ton mot de passe actuel puis une confirmation envoyée par e-mail.",
      "Changer de mot de passe depuis le compte demande également le mot de passe actuel. Si tu l’as oublié, utilise le parcours Mot de passe oublié.",
      "La suppression du compte demande le mot de passe actuel et une confirmation explicite. Elle supprime le profil, les projets en ligne et la bibliothèque personnelle associée.",
    ],
  },
  {
    id: "performance",
    category: "Sauvegarde et dépannage",
    title: "Carte lente ou projet lourd",
    summary:
      "Réduire les ralentissements liés aux gros GeoJSON, aux bâtiments, aux frontières détaillées ou aux exports lourds.",
    keywords: [
      "lent",
      "ralentissement",
      "lag",
      "performance",
      "rame",
      "bloque",
      "geojson lourd",
      "frontieres precises",
      "batiments",
      "memoire",
    ],
    steps: [
      "Pour un gros GeoJSON, conserve-le comme calque léger et réduis la précision d’affichage si nécessaire.",
      "Évite de transformer des milliers d’entités ou de bâtiments en objets DroMap si tu n’as pas besoin de les modifier individuellement.",
      "Les fonds Monde avec frontières précises et Europe entière peuvent demander davantage de calculs.",
      "Ferme les panneaux lourds inutiles et teste d’abord le rendu Standard avant une très haute qualité.",
      "Si une opération reste bloquée, enregistre le projet, recharge la page puis vérifie si le même problème se reproduit sur une carte plus légère.",
    ],
  },
  {
    id: "tour",
    category: "Démarrage rapide",
    title: "Relancer le tutoriel de l’éditeur",
    summary:
      "Le tutoriel s’ouvre automatiquement une seule fois puis reste disponible à tout moment avec le bouton ?.",
    keywords: [
      "tutoriel",
      "aide point interrogation",
      "visite guidee",
      "explications detaillees",
      "revoir aide",
      "bouton question",
    ],
    steps: [
      "Lors du premier projet, le tutoriel de l’éditeur s’affiche automatiquement une seule fois.",
      "Il ne s’ouvrira plus automatiquement pour les projets suivants.",
      "Pour le relancer, clique sur le bouton ? dans la barre du projet.",
      "Chaque grande étape propose Explications détaillées pour encadrer les boutons un par un et expliquer comment les utiliser.",
      "Précédent, Suivant et Quitter le tutoriel restent fixes en bas de l’écran pour faciliter la navigation.",
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
  batiment: ["building", "immeuble", "maison", "overture", "ign"],
  carte: ["projet", "map", "rendu"],
  calque: ["layer", "couche", "geojson", "bibliotheque"],
  couche: ["calque", "layer"],
  detail: ["niveau", "zoom", "fond"],
  ecrire: ["texte", "annotation", "titre"],
  export: ["telecharger", "png", "pdf", "svg", "jpeg", "webp", "rendu"],
  fleche: ["trait", "ligne", "nord"],
  fond: ["basemap", "classique", "satellite", "ign", "blanc"],
  frontiere: ["limite", "pays", "territoire", "suivi", "remplissage"],
  geojson: ["donnees", "calque", "import", "json"],
  ia: ["assistant", "intelligence", "ai"],
  icone: ["marqueur", "symbole", "pictogramme"],
  image: ["marqueur", "importer", "png", "svg"],
  import: ["ajouter", "geojson", "projet", "donnees"],
  inspecteur: ["selection", "objet", "etiquette", "proprietes"],
  layer: ["calque", "couche"],
  legende: ["figure", "sous titre", "rendu", "preview"],
  ligne: ["trait", "fleche", "dessin", "suivi"],
  map: ["carte", "projet"],
  marqueur: ["symbole", "icone", "pictogramme", "point"],
  monde: ["global", "world", "frontieres"],
  objet: ["selection", "marqueur", "trait", "zone", "texte"],
  pictogramme: ["marqueur", "symbole", "icone"],
  preview: ["previsualisation", "rendu", "legende"],
  projet: ["carte", "sauvegarde", "dashboard", "synchronisation"],
  recherche: ["trouver", "lieu", "mots cles"],
  sauvegarde: ["enregistrer", "autosave", "reprise", "restaurer", "synchronisation", "hors ligne"],
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
  zone: ["surface", "polygone", "remplissage", "workspace", "emprise"],
  zoom: ["detail", "molette", "trackpad", "precis", "libre"],
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
          <span className="text-[11px] font-black uppercase tracking-wide text-indigo-600">
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
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-600 text-[11px] font-black text-white">
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
          className="inline-flex h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-black text-white transition hover:bg-indigo-500"
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
          Que veux-tu faire ?
        </label>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          Tape quelques mots, même sans accents, sans majuscules ou avec une petite
          faute. Par exemple : « legnde », « geojson lourd », « zoom precis »,
          « marqueur perso » ou « ctrl z ».
        </p>
        <input
          id="help-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Ex. comment suivre une frontière, importer des bâtiments, titre carte…"
          className="mt-3 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
        />

        {suggestions.length > 0 ? (
          <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
            <div className="text-xs font-black uppercase tracking-wide text-indigo-700">
              Suggestions les plus pertinentes
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {suggestions.map(({ article }) => (
                <button
                  key={`suggestion-${article.id}`}
                  type="button"
                  onClick={() => openSuggestion(article.id)}
                  className="rounded-xl border border-indigo-100 bg-white px-3 py-2 text-left transition hover:border-indigo-300 hover:bg-indigo-50"
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
                  ? "border-indigo-600 bg-indigo-600 text-white"
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
            {query.trim() ? " correspondant à ta recherche" : " disponible(s)"}.
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
            Aucun article n’est assez proche de cette recherche. Essaie avec un mot
            principal comme « marqueur », « zone », « calque », « légende »,
            « export », « bâtiments » ou « sauvegarde ».
          </div>
        ) : null}
      </div>

      <div className="mt-6 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 text-sm leading-6 text-indigo-950">
        <strong className="font-black">Besoin d’aide directement dans l’éditeur ?</strong>{" "}
        Le bouton <strong>?</strong> relance à tout moment la visite guidée. Les
        Explications détaillées encadrent ensuite les commandes une par une et
        peuvent ouvrir temporairement les panneaux nécessaires sans modifier ton
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
