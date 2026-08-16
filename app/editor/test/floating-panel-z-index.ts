const INITIAL_FLOATING_PANEL_Z_INDEX = 30_000;

let currentFloatingPanelZIndex = INITIAL_FLOATING_PANEL_Z_INDEX;

export function getInitialFloatingPanelZIndex() {
  return INITIAL_FLOATING_PANEL_Z_INDEX;
}

export function bringFloatingPanelToFront() {
  // Compteur volontairement monotone : le dernier panneau cliqué/ouvert doit
  // toujours passer devant les précédents. Un reset pouvait replacer un
  // panneau récent derrière une ancienne fenêtre encore ouverte.
  currentFloatingPanelZIndex += 1;
  return currentFloatingPanelZIndex;
}
