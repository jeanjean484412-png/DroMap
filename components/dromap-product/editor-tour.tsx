"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { DroMapFeature } from "@/lib/dromap/feature";
import { DEFAULT_DROMAP_LAYER_ID, useEditorTestLayersStore } from "@/stores/editor-test-layers";
import { useEditorTestExportStore } from "@/stores/editor-test-export";
import { useEditorTestFeaturesStore } from "@/stores/editor-test-features";
import { useEditorTestSelectionStore } from "@/stores/editor-test-selection";
import {
  type EditorTestActiveTool,
  useEditorTestToolStore,
} from "@/stores/editor-test-tool";
import { useEditorTestWorkspaceStore } from "@/stores/editor-test-workspace";

const TOUR_STORAGE_KEY = "dromap-p1-editor-tour-completed-v1";
const TOUR_AUTO_PRESENTED_KEY = "dromap-p1-editor-tour-auto-presented-v1";
let autoTourPresentedInMemory = false;

type TourTargetQuery = {
  selector?: string;
  text?: string;
  ariaLabel?: string;
  title?: string;
};

type TourToolSettings = "marker" | "line" | "zone" | "text";

type TourDetail = {
  label: string;
  explanation: string;
  target: TourTargetQuery;
  additionalTargets?: TourTargetQuery[];
  ghost?: "render" | "import" | "inspector";
  openToolSettings?: TourToolSettings;
};

type TourStep = {
  selector: string;
  title: string;
  description: string;
  details: TourDetail[];
};

const TOUR_STEPS: TourStep[] = [
  {
    selector: '[data-dromap-tour="topbar"]',
    title: "La barre du projet",
    description:
      "Retrouve ici le nom de la carte, l’état de sauvegarde, Annuler/Rétablir, les imports et l’accès à Légende & Rendu final.",
    details: [],
  },
  {
    selector: '[data-dromap-tour="tools"]',
    title: "Les outils de création",
    description:
      "Choisis ici ce que tu veux poser sur la carte : marqueur, trait, zone ou texte. Les petits boutons placés à droite règlent l’apparence des prochains objets avant leur pose ; les objets déjà créés se modifient ensuite dans l’inspecteur.",
    details: [
      {
        label: "Marqueur",
        explanation:
          "Active l’outil Marqueur. Choisis ensuite un symbole puis clique sur la carte pour le poser. Le fantôme affiché avant le clic utilise la même proportion que l’objet final.",
        target: { title: "Marqueur" },
      },
      {
        label: "Choisir le type de marqueur",
        explanation:
          "Ce petit bouton ouvre la bibliothèque de symboles : pictogrammes DroMap, formes simples et marqueurs personnalisés. Il sert à choisir le symbole ; l’autre petit bouton règle son apparence.",
        target: { ariaLabel: "Choisir le type de marqueur" },
      },
      {
        label: "Traits",
        explanation:
          "Ouvre les trois façons de dessiner une ligne. Trait classique sert à relier des points proprement, Dessin libre sert à dessiner à la main en maintenant la souris, et Suivi de trait sert à longer automatiquement une frontière ou une ligne déjà visible sur la carte. Les explications détaillées montrent chaque mode séparément avec des exemples simples.",
        target: { text: "Traits" },
      },
      {
        label: "Zones",
        explanation:
          "Ouvre les différentes façons de créer une surface. Tu peux dessiner une zone point par point, la dessiner à main levée, reprendre directement le contour d’un territoire déjà visible, ou poser rapidement un rectangle, un cercle ou une ellipse. Les explications détaillées indiquent quand utiliser chaque mode.",
        target: { text: "Zones" },
      },
      {
        label: "Texte",
        explanation:
          "Active l’outil Texte. Clique ensuite sur la carte pour placer un texte. Son contenu et son apparence restent modifiables après la pose dans l’inspecteur.",
        target: { title: "Texte" },
      },
      {
        label: "Paramètres des objets à poser",
        explanation:
          "Ces quatre petits boutons de paramètres règlent les prochains objets avant leur pose. Ils définissent par exemple taille, couleur, opacité, épaisseur, remplissage, flèches, hachures ou apparence du texte selon l’outil. Un réglage reste appliqué aux prochaines poses jusqu’à ce que tu le modifies ou le réinitialises. Ils ne servent pas à modifier un objet déjà posé : pour cela, sélectionne l’objet et utilise l’inspecteur.",
        target: { ariaLabel: "Paramètres du marqueur" },
        additionalTargets: [
          { ariaLabel: "Choisir le type de trait et régler son style" },
          { ariaLabel: "Choisir le type de zone et régler son style" },
          { ariaLabel: "Paramètres Texte" },
        ],
      },
      {
        label: "Réglages du prochain marqueur",
        explanation:
          "DroMap ouvre temporairement les paramètres du marqueur pour te les montrer. Cette fenêtre prépare le prochain marqueur : taille visuelle, couleur, opacité, épaisseur du contour et remplissage lorsque le symbole le permet. Le symbole lui-même se choisit avec le bouton de bibliothèque juste au-dessus. Fermer cette fenêtre ne supprime pas les réglages déjà choisis.",
        target: { selector: '[data-dromap-tool-settings-panel="true"]' },
        openToolSettings: "marker",
      },
      {
        label: "Réglages des prochains traits",
        explanation:
          "Cette fenêtre permet d’abord de choisir le type de trait, puis son apparence : couleur, opacité, épaisseur, trait plein/tireté/pointillé, flèche au début ou à la fin et, pour les outils concernés, les paramètres propres au dessin libre ou au suivi. Les valeurs choisies servent aux prochains traits posés.",
        target: { selector: '[data-dromap-tool-settings-panel="true"]' },
        openToolSettings: "line",
      },
      {
        label: "Trait classique",
        explanation:
          "À utiliser quand tu veux une ligne nette composée de segments : relier plusieurs villes, montrer un axe, tracer un itinéraire simplifié, une séparation ou une flèche. Clique successivement aux endroits où la ligne doit passer. Chaque clic ajoute un point et DroMap relie ces points. C’est le mode le plus simple quand tu veux contrôler précisément le trajet de la ligne.",
        target: { text: "Trait classique" },
        openToolSettings: "line",
      },
      {
        label: "Dessin libre",
        explanation:
          "À utiliser quand une ligne doit suivre ton geste plutôt qu’une suite de segments droits : contour approximatif, trajet dessiné rapidement, ligne courbe ou annotation. Maintiens le bouton de la souris et déplace-la comme avec un crayon, puis relâche pour terminer. Le réglage de lissage permet ensuite de rendre le geste plus ou moins régulier.",
        target: { text: "Dessin libre" },
        openToolSettings: "line",
      },
      {
        label: "Suivi de trait",
        explanation:
          "À utiliser quand tu veux suivre précisément une ligne qui existe déjà sur la carte, par exemple une frontière, le contour d’une région ou une ligne provenant d’un fichier GeoJSON. Clique et fais glisser près de la ligne : DroMap s’y accroche et la suit. Ce mode n’est disponible que si la carte contient une ligne exploitable ; s’il est grisé, choisis un fond blanc avec frontières ou affiche un calque contenant des lignes ou des contours.",
        target: { text: "Suivi de trait" },
        openToolSettings: "line",
      },
      {
        label: "Réglages des prochaines zones",
        explanation:
          "Cette fenêtre permet de choisir le type de zone puis de préparer son rendu : contour, fond, couleurs, opacité, épaisseur, hachures, semis de points et options spécifiques aux formes ou au remplissage. Ces paramètres s’appliquent aux prochaines zones et restent ensuite éditables objet par objet.",
        target: { selector: '[data-dromap-tool-settings-panel="true"]' },
        openToolSettings: "zone",
      },
      {
        label: "Zone classique",
        explanation:
          "À utiliser pour dessiner toi-même une surface avec des angles précis : zone d’influence, espace contrôlé, quartier, secteur d’étude ou toute forme personnalisée. Clique point par point autour de la surface à délimiter. DroMap relie les points pour former la zone. Choisis ce mode quand aucun contour existant ne correspond exactement à ce que tu veux montrer.",
        target: { text: "Zone classique" },
        openToolSettings: "zone",
      },
      {
        label: "Zone libre",
        explanation:
          "À utiliser pour entourer rapidement une surface à main levée : aire approximative, zone de risque, espace diffus ou contour volontairement irrégulier. Maintiens le bouton de la souris et dessine le contour comme avec un crayon. Le lissage permet de rendre ensuite le contour plus propre sans devoir poser chaque angle un par un.",
        target: { text: "Zone libre" },
        openToolSettings: "zone",
      },
      {
        label: "Remplissage",
        explanation:
          "À utiliser quand le territoire que tu veux colorer existe déjà sur la carte. Par exemple, sur un fond blanc avec frontières, tu peux cliquer directement sur un pays, une région ou un département pour reprendre son contour exact ; cela fonctionne aussi avec certaines zones provenant d’un calque GeoJSON. Si le bouton est grisé, la carte ne contient actuellement aucune surface dont DroMap peut reprendre automatiquement le contour.",
        target: { text: "Remplissage" },
        openToolSettings: "zone",
      },
      {
        label: "Forme rapide",
        explanation:
          "À utiliser quand tu n’as pas besoin d’un contour géographique et veux simplement mettre en évidence une partie de la carte avec une forme propre. Choisis rectangle, cercle ou ellipse, puis pose la forme en deux clics. C’est pratique pour encadrer une ville, entourer une zone d’attention ou créer un repère graphique simple.",
        target: { text: "Forme rapide" },
        openToolSettings: "zone",
      },
      {
        label: "Réglages du prochain texte",
        explanation:
          "Cette fenêtre prépare l’apparence du texte avant sa pose : taille, gras, italique, rotation, contour des lettres, fond et cadre. Après la pose, le contenu et ces propriétés restent modifiables depuis l’onglet Sélection de l’inspecteur.",
        target: { selector: '[data-dromap-tool-settings-panel="true"]' },
        openToolSettings: "text",
      },
    ],
  },
  {
    selector: '[data-dromap-tour="map"]',
    title: "La carte centrale",
    description:
      "Dessine, sélectionne et déplace directement les objets. Le fond, la zone et les données restent accessibles autour de la carte.",
    details: [
      {
        label: "Zone de travail",
        explanation:
          "Ouvre les actions de zone. Tu peux modifier le rectangle ou utiliser un cadrage automatique lorsqu’il est disponible.",
        target: { text: "Zone de travail" },
      },
      {
        label: "Zoom précis / Zoom libre",
        explanation:
          "Débloque temporairement un zoom continu et fluide à l’intérieur de la zone pour rechercher un élément avec davantage de précision, sans modifier le cadrage du rendu final.",
        target: { title: "zoom et le niveau de détail" },
      },
      {
        label: "Fond de carte",
        explanation:
          "Ouvre le catalogue des fonds. Le changement de fond conserve la zone, le centre et le zoom lorsque la zone existe déjà.",
        target: { text: "Fond de carte" },
      },
      {
        label: "Calques",
        explanation:
          "Ouvre la fenêtre des calques pour gérer le calque actif, l’ordre, la visibilité, l’opacité, le verrouillage et les bibliothèques.",
        target: { text: "Calques" },
      },
      {
        label: "Bâtiments",
        explanation:
          "Importe les bâtiments présents dans la zone. Selon le mode, ils restent regroupés dans un calque léger ou deviennent des objets DroMap individuels.",
        target: { text: "Bâtiments" },
      },
      {
        label: "Assistant IA",
        explanation:
          "Ouvre l’assistant pour poser une question ou préparer des créations structurées. Les opérations importantes restent prévisualisables avant validation.",
        target: { text: "Assistant IA" },
      },
      {
        label: "Rechercher un lieu",
        explanation:
          "Recherche une ville, une adresse ou un lieu nommé. Choisis ensuite le résultat voulu pour recadrer la carte.",
        target: { text: "Rechercher un lieu" },
      },
    ],
  },
  {
    selector: '[data-dromap-tour="inspector"]',
    title: "L’inspecteur",
    description:
      "L’inspecteur est le panneau de contrôle de tout ce qui existe déjà sur la carte. Il ne sert pas à créer de nouveaux objets : il sert à modifier précisément la sélection actuelle, retrouver les objets du projet et gérer leurs étiquettes. Quand tu cliques directement sur un objet de la carte, l’inspecteur s’ouvre automatiquement sur Sélection.",
    details: [
      {
        label: "Replier l’inspecteur",
        explanation:
          "Réduit l’inspecteur pour dégager visuellement la carte. La carte reste chargée derrière et ne doit pas être reconstruite.",
        target: { ariaLabel: "Replier l’inspecteur" },
        ghost: "inspector",
      },
      {
        label: "Sélection",
        explanation:
          "C’est l’onglet principal pour travailler sur ce qui est déjà posé. Dès que tu cliques un objet sur la carte, DroMap revient ici et affiche ses propriétés : nom, légende, style, taille, couleurs, verrouillage et autres réglages compatibles. En sélection multiple, les réglages communs permettent de modifier plusieurs objets ensemble.",
        target: { text: "Sélection" },
        ghost: "inspector",
      },
      {
        label: "Modifier tous les marqueurs du même type dans ce calque",
        explanation:
          "Quand tu sélectionnes un marqueur, cette option permet d’appliquer les mêmes changements d’apparence à tous les marqueurs du même type présents dans le même calque. Par exemple, changer leur couleur ou leur taille en une seule fois. La même logique existe aussi pour les traits, les zones et les textes du même type dans leur calque. Leur position, leur forme propre, leur nom et leur contenu ne sont pas copiés, et les objets verrouillés restent protégés.",
        target: { selector: '[data-dromap-tour="same-type-edit-control"]' },
        ghost: "inspector",
      },
      {
        label: "Objets",
        explanation:
          "C’est l’inventaire des objets du projet. Utilise-le pour retrouver un élément lorsque la carte est chargée, le rechercher, le sélectionner depuis la liste et, lorsque prévu, recentrer volontairement la carte dessus. Il est particulièrement utile sur les cartes très chargées.",
        target: { text: "Objets" },
        ghost: "inspector",
      },
      {
        label: "Étiquettes",
        explanation:
          "Cet onglet gère les noms et informations affichés près des objets : visibilité globale ou individuelle, taille, contour et placement. Il sert à organiser les étiquettes sans modifier la géométrie des objets. Dès que tu recliques un objet directement sur la carte, DroMap rebascule automatiquement sur Sélection pour éditer cet objet.",
        target: { text: "Étiquettes" },
        ghost: "inspector",
      },
      {
        label: "Sélection multiple",
        explanation:
          "Active la sélection multiple manuelle, puis clique les objets un par un. Ils restent tous sélectionnés et conservent leurs poignées de modification lorsqu’elles existent.",
        target: { selector: '[data-dromap-tour="multi-selection-control"]' },
        ghost: "inspector",
      },
    ],
  },
  {
    selector: '[data-dromap-tour="import"]',
    title: "Ajouter des données",
    description:
      "Importe un Projet DroMap, un GeoJSON ou utilise les bibliothèques. Les explications détaillées ouvrent cette fenêtre temporairement.",
    details: [
      {
        label: "Ajouter un Projet DroMap",
        explanation:
          "Choisis un fichier Projet DroMap complet. DroMap affiche d’abord sa taille et son contenu, puis l’ajoute au projet courant. Le fond et la zone actuels restent conservés par défaut ; tu peux choisir explicitement d’utiliser ceux du fichier importé.",
        target: { text: "Choisir un Projet DroMap" },
        ghost: "import",
      },
      {
        label: "Importer un GeoJSON",
        explanation:
          "Sélectionne un fichier GeoJSON local. DroMap affiche son poids et le nombre d’entités avant de te demander si tu veux le garder comme calque léger ou le transformer en objets modifiables individuellement.",
        target: { text: "Importer GeoJSON depuis mes fichiers" },
        ghost: "import",
      },
      {
        label: "Mes calques enregistrés",
        explanation:
          "Ouvre ta bibliothèque personnelle pour réutiliser un calque DroMap ou GeoJSON déjà enregistré. Avec un compte, cette bibliothèque se synchronise entre tes appareils.",
        target: { text: "Mes calques enregistrés" },
        ghost: "import",
      },
    ],
  },
  {
    selector: '[data-dromap-tour="render"]',
    title: "Légende & Rendu final",
    description:
      "L’aperçu final reste au-dessus de l’éditeur sans le décharger. Les explications détaillées ouvrent cet écran temporairement.",
    details: [
      {
        label: "Titre de la carte",
        explanation:
          "Ouvre les réglages du titre directement posé sur la carte. Saisis le texte, choisis sa taille et sa couleur, puis déplace-le dans l’aperçu.",
        target: { text: "Titre de la carte" },
        ghost: "render",
      },
      {
        label: "+ Titre",
        explanation:
          "Crée ou réaffiche le titre principal de la légende. Il est distinct du titre de la carte.",
        target: { text: "+ Titre" },
        ghost: "render",
      },
      {
        label: "+ Sous-titre",
        explanation:
          "Ajoute une section dans la légende. Tu peux ensuite déplacer des figurés dans ce sous-titre.",
        target: { text: "+ Sous-titre" },
        ghost: "render",
      },
      {
        label: "Masqués",
        explanation:
          "Ouvre la liste des éléments de légende masqués pour les réafficher. Le bouton n’apparaît que s’il existe au moins un élément masqué.",
        target: { text: "Masqués" },
        ghost: "render",
      },
      {
        label: "Échelle",
        explanation:
          "Active ou ouvre les réglages de l’échelle. Dans l’aperçu, tu peux aussi la glisser pour la placer librement.",
        target: { text: "Échelle" },
        ghost: "render",
      },
      {
        label: "Nord",
        explanation:
          "Active ou ouvre les réglages de la flèche du nord. Elle peut être placée librement ou dans une position prédéfinie.",
        target: { text: "Nord" },
        ghost: "render",
      },
      {
        label: "Masquer les écritures du fond",
        explanation:
          "Masque les textes, cartouches, arrêts, pictogrammes et petits symboles du fond vectoriel compatible afin d’alléger la carte.",
        target: { text: "Masquer les écritures du fond" },
        ghost: "render",
      },
      {
        label: "Détail du fond",
        explanation:
          "Déplace ce curseur pour augmenter ou réduire la quantité de détail du fond sans modifier la taille des objets DroMap.",
        target: {
          title:
            "Change la quantité de détails du fond vectoriel sans modifier la zone de travail",
        },
        ghost: "render",
      },
      {
        label: "Édition avancée de la légende",
        explanation:
          "Depuis Apparence de la légende, ouvre l’éditeur avancé pour régler chaque figuré, les espacements et la structure détaillée de la légende.",
        target: { text: "Édition avancée" },
        ghost: "render",
      },
      {
        label: "Déplacer un élément de légende",
        explanation:
          "Utilise la poignée de déplacement d’un figuré pour changer son ordre ou le déplacer dans un autre sous-titre, y compris lorsque la légende est posée sur la carte.",
        target: { title: "Glisser pour réordonner cet élément dans la légende" },
        ghost: "render",
      },
      {
        label: "Télécharger",
        explanation:
          "Ouvre les formats de téléchargement disponibles. La qualité change la définition, jamais les proportions ou le cadrage du rendu.",
        target: { text: "Télécharger" },
        ghost: "render",
      },
      {
        label: "Retour à l’éditeur",
        explanation:
          "Ferme simplement l’écran de rendu. L’éditeur reste monté derrière, donc la carte ne doit pas être rechargée.",
        target: { text: "Retour à l’éditeur" },
        ghost: "render",
      },
    ],
  },
  {
    selector: '[aria-label="Relancer la visite guidée"]',
    title: "Tu peux relancer ce tutoriel à tout moment",
    description:
      "La visite automatique n’apparaît qu’une seule fois, lors de ton premier passage dans l’éditeur. Si tu veux revoir une explication plus tard, appuie simplement sur le bouton ? dans la barre du projet.",
    details: [],
  },
];

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: string;
};

function normalizeText(value: string | null | undefined) {
  return (value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("fr-FR");
}

function isElementVisible(element: HTMLElement) {
  if (element.closest('[data-dromap-editor-tour-overlay="true"]')) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return false;
  }

  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function findTourTarget(query: TourTargetQuery): HTMLElement | null {
  if (query.selector) {
    const direct = document.querySelector<HTMLElement>(query.selector);
    return direct && isElementVisible(direct) ? direct : null;
  }

  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      "button, input, select, textarea, summary, [role='button'], [role='tab']",
    ),
  ).filter(isElementVisible);

  const wantedText = normalizeText(query.text);
  const wantedAria = normalizeText(query.ariaLabel);
  const wantedTitle = normalizeText(query.title);

  return (
    candidates.find((element) => {
      const text = normalizeText(element.textContent);
      const aria = normalizeText(element.getAttribute("aria-label"));
      const title = normalizeText(element.getAttribute("title"));

      if (wantedText && !text.includes(wantedText)) return false;
      if (wantedAria && !aria.includes(wantedAria)) return false;
      if (wantedTitle && !title.includes(wantedTitle)) return false;
      return true;
    }) ?? null
  );
}

/** Le cadre d’un élément reprend exactement les dimensions renvoyées par le navigateur.
 * Pour un groupe de commandes, le cadre englobe uniquement leurs bornes réelles. */
function measureTargets(targets: HTMLElement[]): TargetRect {
  const rects = targets.map((target) => target.getBoundingClientRect());
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  const right = Math.max(...rects.map((rect) => rect.right));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    borderRadius:
      targets.length === 1
        ? window.getComputedStyle(targets[0]).borderRadius || "0px"
        : "12px",
  };
}

function getOpenToolSettingsType(): TourToolSettings | null {
  const panel = document.querySelector<HTMLElement>(
    '[data-dromap-tool-settings-panel="true"]',
  );
  if (!panel || !isElementVisible(panel)) return null;

  const heading = normalizeText(panel.querySelector("strong")?.textContent);
  if (heading.includes("marqueur")) return "marker";
  if (heading.includes("traits")) return "line";
  if (heading.includes("zones")) return "zone";
  if (heading.includes("texte")) return "text";
  return null;
}

function getToolSettingsButtonQuery(tool: TourToolSettings): TourTargetQuery {
  if (tool === "marker") return { ariaLabel: "Paramètres du marqueur" };
  if (tool === "line") {
    return { ariaLabel: "Choisir le type de trait et régler son style" };
  }
  if (tool === "zone") {
    return { ariaLabel: "Choisir le type de zone et régler son style" };
  }
  return { ariaLabel: "Paramètres Texte" };
}

function closeVisibleToolSettingsPanel() {
  const panel = document.querySelector<HTMLElement>(
    '[data-dromap-tool-settings-panel="true"]',
  );
  if (!panel || !isElementVisible(panel)) return;

  const closeButton = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find(
    (button) => normalizeText(button.textContent) === "fermer",
  );
  closeButton?.click();
}

type SelectionSimulationSnapshot = {
  selectedFeatureId: string | null;
  selectedFeatureIds: string[];
  multiSelectionEnabled: boolean;
  selectedFromObjectsPanel: boolean;
  mapSelectionRequestId: number;
};

type ExportSimulationSnapshot = {
  legendTitle: string;
  legendPosition: ReturnType<typeof useEditorTestExportStore.getState>["legendPosition"];
  hiddenLegendFeatureIds: string[];
};

type InspectorUiSnapshot = {
  collapsed: boolean;
  activeTabLabel: string | null;
};

function setTourSimulationFlag(active: boolean) {
  if (typeof document === "undefined") return;

  if (active) {
    document.documentElement.dataset.dromapTourSimulation = "true";
  } else {
    delete document.documentElement.dataset.dromapTourSimulation;
  }
}

function getInspectorActiveTabLabel() {
  const activeTab = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-dromap-product-inspector="true"] [role="tab"][aria-selected="true"]',
    ),
  ).find(isElementVisible);

  return activeTab ? normalizeText(activeTab.textContent) : null;
}

function clickInspectorTab(label: "sélection" | "objets" | "étiquettes") {
  const tab = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-dromap-product-inspector="true"] [role="tab"]',
    ),
  ).find(
    (element) =>
      isElementVisible(element) &&
      normalizeText(element.textContent).includes(label),
  );

  if (tab instanceof HTMLButtonElement) {
    tab.click();
  }
}

function createTutorialMarkerFeature(id: string): DroMapFeature {
  const workspaceState = useEditorTestWorkspaceStore.getState();
  const layersState = useEditorTestLayersStore.getState();
  const bounds = workspaceState.workspaceBounds;
  const lat = bounds
    ? (bounds.southWest.lat + bounds.northEast.lat) / 2
    : 48.8566;
  const lng = bounds
    ? (bounds.southWest.lng + bounds.northEast.lng) / 2
    : 2.3522;
  const referenceZoom =
    workspaceState.workspaceBasemapBaseZoom ??
    workspaceState.workspaceBasemapZoom ??
    7;
  const visibleLayer =
    layersState.layers.find((layer) => layer.visible && layer.opacity > 0) ??
    layersState.layers.find((layer) => layer.id === layersState.activeLayerId) ??
    layersState.layers[0];
  const layerId = visibleLayer?.id ?? layersState.activeLayerId ?? DEFAULT_DROMAP_LAYER_ID;

  return {
    type: "Feature",
    id,
    geometry: {
      type: "Point",
      coordinates: [lng, lat],
    },
    properties: {
      type: "marker",
      label: "Marqueur d’exemple",
      legendLabel: "Marqueur d’exemple",
      symbol: { type: "builtin", id: "circle" },
      style: {
        color: "#111827",
        weight: 7,
        opacity: 1,
        markerSize: 30,
        markerFilled: true,
        visualReferenceZoom: referenceZoom,
      },
      ...(layerId ? { layerId } : {}),
      meta: { version: 1 },
    },
  };
}

export function DromapEditorTour() {
  const [stepIndex, setStepIndex] = useState(-1);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const ghostOpenedExportRef = useRef(false);
  const ghostOpenedImportRef = useRef(false);
  const inspectorUiSnapshotRef = useRef<InspectorUiSnapshot | null>(null);
  const selectionSimulationSnapshotRef =
    useRef<SelectionSimulationSnapshot | null>(null);
  const exportSimulationSnapshotRef = useRef<ExportSimulationSnapshot | null>(null);
  const tutorialFeatureIdRef = useRef<string | null>(null);
  const tutorialFeatureInjectedRef = useRef(false);
  const toolSettingsOriginalRef = useRef<{
    activeTool: EditorTestActiveTool;
    openPanel: TourToolSettings | null;
  } | null>(null);

  const openTour = useCallback(() => {
    setDetailIndex(null);
    setStepIndex(0);
  }, []);

  useEffect(() => {
    function handleStartTour() {
      openTour();
    }

    window.addEventListener("dromap:p1-start-tour", handleStartTour);

    const timeoutId = window.setTimeout(() => {
      let shouldOpenAutomatically = false;

      try {
        const alreadyCompleted =
          window.localStorage.getItem(TOUR_STORAGE_KEY) === "done";
        const alreadyPresented =
          window.localStorage.getItem(TOUR_AUTO_PRESENTED_KEY) === "done";

        if (!alreadyCompleted && !alreadyPresented) {
          // On marque l’affichage AVANT d’ouvrir la visite : même si l’utilisateur
          // quitte la page en plein tutoriel, une seconde création de projet ne
          // relancera jamais automatiquement la visite. Le bouton ? reste disponible.
          window.localStorage.setItem(TOUR_AUTO_PRESENTED_KEY, "done");
          shouldOpenAutomatically = true;
        }
      } catch {
        if (!autoTourPresentedInMemory) {
          autoTourPresentedInMemory = true;
          shouldOpenAutomatically = true;
        }
      }

      if (shouldOpenAutomatically) {
        autoTourPresentedInMemory = true;
        openTour();
      }
    }, 650);

    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("dromap:p1-start-tour", handleStartTour);
    };
  }, [openTour]);

  const currentStep = stepIndex >= 0 ? TOUR_STEPS[stepIndex] : null;
  const currentDetail =
    currentStep && detailIndex !== null
      ? currentStep.details[detailIndex] ?? null
      : null;
  const detailedMode = Boolean(currentStep && currentDetail);

  const restoreToolSettingsAfterTour = useCallback(() => {
    const original = toolSettingsOriginalRef.current;
    if (!original) return;

    closeVisibleToolSettingsPanel();
    toolSettingsOriginalRef.current = null;

    window.setTimeout(() => {
      if (original.openPanel) {
        const originalButton = findTourTarget(
          getToolSettingsButtonQuery(original.openPanel),
        );
        if (originalButton instanceof HTMLButtonElement) {
          originalButton.click();
          return;
        }
      }

      useEditorTestToolStore.getState().setActiveTool(original.activeTool);
    }, 0);
  }, []);

  const captureSelectionSimulation = useCallback(() => {
    if (selectionSimulationSnapshotRef.current) return;

    const state = useEditorTestSelectionStore.getState();
    selectionSimulationSnapshotRef.current = {
      selectedFeatureId: state.selectedFeatureId,
      selectedFeatureIds: [...state.selectedFeatureIds],
      multiSelectionEnabled: state.multiSelectionEnabled,
      selectedFromObjectsPanel: state.selectedFromObjectsPanel,
      mapSelectionRequestId: state.mapSelectionRequestId,
    };
  }, []);

  const ensureTutorialMarker = useCallback(
    (options: { forceSynthetic?: boolean } = {}) => {
      const existingId = tutorialFeatureIdRef.current;
      if (existingId) {
        useEditorTestSelectionStore.setState({
          selectedFeatureId: existingId,
          selectedFeatureIds: [existingId],
          selectedFromObjectsPanel: false,
        });
        return existingId;
      }

      captureSelectionSimulation();

      const featureState = useEditorTestFeaturesStore.getState();
      const reusableMarker = options.forceSynthetic
        ? undefined
        : featureState.features.find(
            (feature) => feature.properties.type === "marker",
          );

      if (reusableMarker) {
        tutorialFeatureIdRef.current = reusableMarker.id;
        tutorialFeatureInjectedRef.current = false;
        useEditorTestSelectionStore.setState({
          selectedFeatureId: reusableMarker.id,
          selectedFeatureIds: [reusableMarker.id],
          selectedFromObjectsPanel: false,
        });
        return reusableMarker.id;
      }

      setTourSimulationFlag(true);
      const id = `__dromap_tour_demo_marker__${
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      }`;
      const demoFeature = createTutorialMarkerFeature(id);

      useEditorTestFeaturesStore.setState((state) => ({
        features: [...state.features, demoFeature],
      }));
      useEditorTestSelectionStore.setState({
        selectedFeatureId: id,
        selectedFeatureIds: [id],
        selectedFromObjectsPanel: false,
      });

      tutorialFeatureIdRef.current = id;
      tutorialFeatureInjectedRef.current = true;
      return id;
    },
    [captureSelectionSimulation],
  );

  const captureExportSimulation = useCallback(() => {
    if (exportSimulationSnapshotRef.current) return;

    const state = useEditorTestExportStore.getState();
    exportSimulationSnapshotRef.current = {
      legendTitle: state.legendTitle,
      legendPosition: state.legendPosition,
      hiddenLegendFeatureIds: [...state.hiddenLegendFeatureIds],
    };
  }, []);

  const restoreSimulatedEditorState = useCallback(() => {
    const exportSnapshot = exportSimulationSnapshotRef.current;
    if (exportSnapshot) {
      useEditorTestExportStore.setState({
        legendTitle: exportSnapshot.legendTitle,
        legendPosition: exportSnapshot.legendPosition,
        hiddenLegendFeatureIds: [...exportSnapshot.hiddenLegendFeatureIds],
      });
      exportSimulationSnapshotRef.current = null;
    }

    const tutorialFeatureId = tutorialFeatureIdRef.current;
    if (tutorialFeatureId && tutorialFeatureInjectedRef.current) {
      useEditorTestFeaturesStore.setState((state) => ({
        features: state.features.filter(
          (feature) => feature.id !== tutorialFeatureId,
        ),
      }));
    }

    tutorialFeatureIdRef.current = null;
    tutorialFeatureInjectedRef.current = false;

    const selectionSnapshot = selectionSimulationSnapshotRef.current;
    if (selectionSnapshot) {
      useEditorTestSelectionStore.setState({
        selectedFeatureId: selectionSnapshot.selectedFeatureId,
        selectedFeatureIds: [...selectionSnapshot.selectedFeatureIds],
        multiSelectionEnabled: selectionSnapshot.multiSelectionEnabled,
        selectedFromObjectsPanel: selectionSnapshot.selectedFromObjectsPanel,
        mapSelectionRequestId: selectionSnapshot.mapSelectionRequestId,
      });
      selectionSimulationSnapshotRef.current = null;
    }

    setTourSimulationFlag(false);
  }, []);

  const captureInspectorUi = useCallback(() => {
    if (inspectorUiSnapshotRef.current) return;

    const inspector = document.querySelector<HTMLElement>(
      '[data-dromap-product-inspector="true"]',
    );
    inspectorUiSnapshotRef.current = {
      collapsed: inspector?.dataset.collapsed === "true",
      activeTabLabel: getInspectorActiveTabLabel(),
    };
  }, []);

  const restoreInspectorUi = useCallback(() => {
    const original = inspectorUiSnapshotRef.current;
    if (!original) return;
    inspectorUiSnapshotRef.current = null;

    const restore = () => {
      const inspector = document.querySelector<HTMLElement>(
        '[data-dromap-product-inspector="true"]',
      );
      const isCollapsed = inspector?.dataset.collapsed === "true";

      if (!original.collapsed && isCollapsed) {
        const expandButton = findTourTarget({
          ariaLabel: "Déployer l’inspecteur",
        });
        if (expandButton instanceof HTMLButtonElement) expandButton.click();
      }

      if (original.collapsed && !isCollapsed) {
        const collapseButton = findTourTarget({
          ariaLabel: "Replier l’inspecteur",
        });
        if (collapseButton instanceof HTMLButtonElement) collapseButton.click();
        return;
      }

      if (original.activeTabLabel && !original.collapsed) {
        window.setTimeout(() => {
          if (original.activeTabLabel?.includes("objets")) {
            clickInspectorTab("objets");
          } else if (original.activeTabLabel?.includes("étiquettes")) {
            clickInspectorTab("étiquettes");
          } else {
            clickInspectorTab("sélection");
          }
        }, 0);
      }
    };

    window.setTimeout(restore, 0);
  }, []);

  const closeGhostPanels = useCallback(() => {
    restoreToolSettingsAfterTour();
    restoreSimulatedEditorState();

    const exportState = useEditorTestExportStore.getState();

    if (ghostOpenedExportRef.current && exportState.isExportPanelOpen) {
      exportState.closeExportPanel();
    }

    if (ghostOpenedImportRef.current && exportState.isImportPanelOpen) {
      exportState.closeImportPanel();
    }

    restoreInspectorUi();

    ghostOpenedExportRef.current = false;
    ghostOpenedImportRef.current = false;
  }, [
    restoreInspectorUi,
    restoreSimulatedEditorState,
    restoreToolSettingsAfterTour,
  ]);

  useEffect(() => {
    const handleRestoreSimulation = () => {
      restoreSimulatedEditorState();
    };

    window.addEventListener(
      "dromap:tour-restore-simulation",
      handleRestoreSimulation,
    );

    return () => {
      window.removeEventListener(
        "dromap:tour-restore-simulation",
        handleRestoreSimulation,
      );
      restoreSimulatedEditorState();
    };
  }, [restoreSimulatedEditorState]);

  useEffect(() => {
    if (!currentStep) {
      return;
    }

    // En visite normale, seul l’inspecteur est ouvert temporairement.
    // Les fenêtres Importer et Légende & Rendu final ne sont ouvertes que
    // dans les explications détaillées.
    const baseGhost: TourDetail["ghost"] =
      !currentDetail &&
      currentStep.selector === '[data-dromap-tour="inspector"]'
        ? "inspector"
        : undefined;

    const ghostContext = currentDetail?.ghost ?? baseGhost;
    const exportState = useEditorTestExportStore.getState();

    if (
      !currentDetail &&
      currentStep.selector === '[data-dromap-tour="render"]' &&
      ghostOpenedExportRef.current &&
      exportState.isExportPanelOpen
    ) {
      restoreSimulatedEditorState();
      exportState.closeExportPanel();
      ghostOpenedExportRef.current = false;
    }

    if (
      !currentDetail &&
      currentStep.selector === '[data-dromap-tour="import"]' &&
      ghostOpenedImportRef.current &&
      exportState.isImportPanelOpen
    ) {
      exportState.closeImportPanel();
      ghostOpenedImportRef.current = false;
    }

    if (ghostContext === "render" && !exportState.isExportPanelOpen) {
      exportState.openExportPanel();
      ghostOpenedExportRef.current = true;
    }

    if (ghostContext === "import" && !exportState.isImportPanelOpen) {
      exportState.openImportPanel();
      ghostOpenedImportRef.current = true;
    }

    if (ghostContext === "inspector") {
      captureInspectorUi();

      const collapsedInspector = document.querySelector<HTMLElement>(
        '[data-dromap-product-inspector="true"][data-collapsed="true"]',
      );

      if (collapsedInspector) {
        const expandButton = findTourTarget({
          ariaLabel: "Déployer l’inspecteur",
        });
        if (expandButton instanceof HTMLButtonElement) {
          expandButton.click();
        }
      }

      if (currentDetail) {
        // Pour les détails de l’inspecteur, on met temporairement l’interface
        // dans un état réaliste : s’il n’y a pas de marqueur, un marqueur
        // d’exemple est posé au centre de la zone. Les vrais contrôles de
        // Sélection / Objets / Étiquettes apparaissent alors à leur vraie place.
        if (currentDetail.label !== "Replier l’inspecteur") {
          ensureTutorialMarker();
        }

        window.setTimeout(() => {
          if (currentDetail.label === "Objets") {
            clickInspectorTab("objets");
          } else if (currentDetail.label === "Étiquettes") {
            clickInspectorTab("étiquettes");
          } else {
            clickInspectorTab("sélection");
          }
        }, 0);
      }
    }

    if (ghostContext === "render" && currentDetail) {
      window.setTimeout(() => {
        if (currentDetail.label === "+ Titre") {
          captureExportSimulation();
          setTourSimulationFlag(true);
          useEditorTestExportStore.setState({ legendTitle: "" });
          return;
        }

        if (currentDetail.label === "Masqués") {
          captureExportSimulation();
          const demoId = ensureTutorialMarker({ forceSynthetic: true });
          setTourSimulationFlag(true);
          useEditorTestExportStore.setState((state) => ({
            hiddenLegendFeatureIds: state.hiddenLegendFeatureIds.includes(demoId)
              ? state.hiddenLegendFeatureIds
              : [...state.hiddenLegendFeatureIds, demoId],
          }));
          return;
        }

        if (currentDetail.label === "Déplacer un élément de légende") {
          captureExportSimulation();
          const demoId = ensureTutorialMarker({ forceSynthetic: true });
          setTourSimulationFlag(true);
          useEditorTestExportStore.setState((state) => ({
            legendPosition: "map",
            hiddenLegendFeatureIds: state.hiddenLegendFeatureIds.filter(
              (featureId) => featureId !== demoId,
            ),
          }));
        }
      }, 40);
    }
  }, [
    captureExportSimulation,
    captureInspectorUi,
    currentDetail,
    currentStep,
    ensureTutorialMarker,
    restoreSimulatedEditorState,
  ]);

  useEffect(() => {
    const requestedToolSettings = currentDetail?.openToolSettings;

    if (!requestedToolSettings) {
      if (toolSettingsOriginalRef.current) {
        restoreToolSettingsAfterTour();
      }
      return;
    }

    if (!toolSettingsOriginalRef.current) {
      toolSettingsOriginalRef.current = {
        activeTool: useEditorTestToolStore.getState().activeTool,
        openPanel: getOpenToolSettingsType(),
      };
    }

    const openRequestedPanel = () => {
      if (getOpenToolSettingsType() === requestedToolSettings) return;

      const button = findTourTarget(
        getToolSettingsButtonQuery(requestedToolSettings),
      );
      if (button instanceof HTMLButtonElement) {
        button.click();
      }
    };

    const currentOpenPanel = getOpenToolSettingsType();
    if (currentOpenPanel && currentOpenPanel !== requestedToolSettings) {
      closeVisibleToolSettingsPanel();
      const timeoutId = window.setTimeout(openRequestedPanel, 0);
      return () => window.clearTimeout(timeoutId);
    }

    openRequestedPanel();
  }, [currentDetail, restoreToolSettingsAfterTour]);

  const activeTargetQueries = useMemo<TourTargetQuery[]>(() => {
    if (!currentStep) return [];
    if (currentDetail) {
      return [currentDetail.target, ...(currentDetail.additionalTargets ?? [])];
    }
    return [{ selector: currentStep.selector }];
  }, [currentDetail, currentStep]);

  useEffect(() => {
    if (activeTargetQueries.length === 0) {
      setTargetRect(null);
      return;
    }

    let frameId = 0;

    const updateTargetRect = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        const targets = activeTargetQueries
          .map((query) => findTourTarget(query))
          .filter((target): target is HTMLElement => target !== null);
        const allTargetsFound = targets.length === activeTargetQueries.length;

        if (allTargetsFound && targets.length > 0 && currentDetail) {
          const groupRect = measureTargets(targets);
          const viewportHeight =
            window.visualViewport?.height ?? window.innerHeight;
          const viewportWidth =
            window.visualViewport?.width ?? window.innerWidth;
          const isOutsideViewport =
            groupRect.top < 8 ||
            groupRect.left < 8 ||
            groupRect.top + groupRect.height > viewportHeight - 8 ||
            groupRect.left + groupRect.width > viewportWidth - 8;

          if (isOutsideViewport) {
            targets[0].scrollIntoView({
              block: "center",
              inline: "nearest",
              behavior: "auto",
            });
          }
        }

        if (allTargetsFound && targets.length > 0) {
          setTargetRect(measureTargets(targets));
          return;
        }

        // Pour les contrôles simulés de l’inspecteur, on attend que le vrai
        // contrôle soit réellement présent à sa place. On n’encadre surtout pas
        // tout l’inspecteur pendant ce délai, sinon le tutoriel donne l’impression
        // que la cible est le panneau entier.
        const requiresExactInspectorTarget =
          currentDetail?.label ===
            "Modifier tous les marqueurs du même type dans ce calque" ||
          currentDetail?.label === "Sélection multiple";

        if (requiresExactInspectorTarget) {
          setTargetRect(null);
          return;
        }

        // Pour les autres commandes, si la cible met quelques millisecondes à
        // apparaître après la mise en scène du tutoriel, on peut encadrer
        // temporairement la vraie zone de l’interface qui la contient.
        if (currentStep) {
          const host = document.querySelector<HTMLElement>(currentStep.selector);
          if (host && isElementVisible(host)) {
            setTargetRect(measureTargets([host]));
            return;
          }
        }

        setTargetRect(null);
      });
    };

    updateTargetRect();

    const mutationObserver = new MutationObserver(updateTargetRect);
    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style", "aria-expanded", "aria-selected"],
    });

    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    window.visualViewport?.addEventListener("resize", updateTargetRect);
    window.visualViewport?.addEventListener("scroll", updateTargetRect);

    const intervalId = window.setInterval(updateTargetRect, 180);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearInterval(intervalId);
      mutationObserver.disconnect();
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
      window.visualViewport?.removeEventListener("resize", updateTargetRect);
      window.visualViewport?.removeEventListener("scroll", updateTargetRect);
    };
  }, [activeTargetQueries, currentDetail, currentStep]);

  const calloutStyle = useMemo(() => {
    const viewportWidth =
      typeof window === "undefined"
        ? 1280
        : window.visualViewport?.width ?? window.innerWidth;
    const viewportHeight =
      typeof window === "undefined"
        ? 800
        : window.visualViewport?.height ?? window.innerHeight;

    if (!targetRect) {
      return {
        left: Math.max(16, viewportWidth / 2 - 210),
        top: Math.max(80, viewportHeight / 2 - 150),
      };
    }

    const width = Math.min(440, viewportWidth - 32);
    const estimatedHeight = detailedMode ? 300 : 285;
    const fixedNavigationReserve = 92;
    const gap = 14;
    const preferredRight = targetRect.left + targetRect.width + gap;
    const preferredLeft = targetRect.left - width - gap;
    const left =
      preferredRight + width <= viewportWidth - 16
        ? preferredRight
        : preferredLeft >= 16
          ? preferredLeft
          : Math.max(16, Math.min(targetRect.left, viewportWidth - width - 16));

    const top = Math.min(
      Math.max(16, targetRect.top),
      Math.max(16, viewportHeight - estimatedHeight - fixedNavigationReserve),
    );

    return { left, top };
  }, [detailedMode, targetRect]);

  if (!currentStep) return null;

  function closeTour(markCompleted: boolean) {
    if (markCompleted) {
      try {
        window.localStorage.setItem(TOUR_STORAGE_KEY, "done");
      } catch {
        // Le projet reste utilisable lorsque le stockage est indisponible.
      }
    }

    closeGhostPanels();
    setDetailIndex(null);
    setStepIndex(-1);
  }

  function nextStep() {
    closeGhostPanels();

    if (stepIndex >= TOUR_STEPS.length - 1) {
      closeTour(true);
      return;
    }

    setDetailIndex(null);
    setStepIndex((current) => current + 1);
  }

  function previousStep() {
    closeGhostPanels();
    setDetailIndex(null);
    setStepIndex((current) => Math.max(0, current - 1));
  }

  function enterDetailedTour() {
    setDetailIndex(0);
  }

  function leaveDetailedTour() {
    restoreSimulatedEditorState();
    setDetailIndex(null);
  }

  function nextDetail() {
    if (detailIndex === null || currentStep === null) return;
    const nextIndex = detailIndex + 1;

    if (nextIndex >= currentStep.details.length) {
      leaveDetailedTour();
      return;
    }

    setDetailIndex(nextIndex);
  }

  function previousDetail() {
    if (detailIndex === null) return;
    setDetailIndex(Math.max(0, detailIndex - 1));
  }

  return (
    <div
      data-dromap-editor-tour-overlay="true"
      className="fixed inset-0 z-[7000]"
      role="dialog"
      aria-modal="true"
      aria-label={
        detailedMode
          ? "Explications détaillées de l’éditeur"
          : "Visite guidée de l’éditeur"
      }
    >
      <div className="absolute inset-0 bg-slate-950/55" />


      {targetRect ? (
        <div
          className="pointer-events-none fixed z-[2] box-border"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            borderRadius: targetRect.borderRadius,
            border: "3px solid white",
            boxShadow: "inset 0 0 0 2px rgba(79,70,229,1)",
          }}
          aria-hidden="true"
        />
      ) : null}

      <section
        className="fixed z-[3] w-[min(27.5rem,calc(100vw-2rem))] rounded-2xl border border-white/30 bg-white p-5 text-slate-950 shadow-2xl"
        style={calloutStyle}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-black text-indigo-700">
            {detailedMode && detailIndex !== null
              ? `Détail ${detailIndex + 1} sur ${currentStep.details.length}`
              : `Étape ${stepIndex + 1} sur ${TOUR_STEPS.length}`}
          </span>
        </div>

        <h2 className="mt-4 text-lg font-black text-slate-950">
          {currentDetail?.label ?? currentStep.title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {currentDetail?.explanation ?? currentStep.description}
        </p>


        <div className="mt-5 flex items-center justify-end gap-2">
          {detailedMode ? (
            <button
              type="button"
              onClick={leaveDetailedTour}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
            >
              Revenir à l’étape
            </button>
          ) : currentStep.details.length > 0 ? (
            <button
              type="button"
              onClick={enterDetailedTour}
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-800 transition hover:bg-indigo-100"
            >
              Explications détaillées
            </button>
          ) : null}
        </div>
      </section>

      <nav
        className="fixed bottom-5 left-1/2 z-[4] flex -translate-x-1/2 items-center gap-2 rounded-2xl border border-white/30 bg-white p-2 shadow-2xl"
        aria-label="Navigation du tutoriel"
      >
        <button
          type="button"
          onClick={detailedMode ? previousDetail : previousStep}
          disabled={detailedMode ? detailIndex === 0 : stepIndex === 0}
          className="min-w-[7.5rem] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Précédent
        </button>
        <button
          type="button"
          onClick={() => closeTour(true)}
          className="min-w-[9.5rem] rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          Quitter le tutoriel
        </button>
        <button
          type="button"
          onClick={detailedMode ? nextDetail : nextStep}
          className="min-w-[7.5rem] rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white transition hover:bg-indigo-500"
        >
          {detailedMode
            ? detailIndex !== null && detailIndex >= currentStep.details.length - 1
              ? "Terminer les détails"
              : "Suivant"
            : stepIndex >= TOUR_STEPS.length - 1
              ? "Terminer"
              : "Suivant"}
        </button>
      </nav>
    </div>
  );
}
