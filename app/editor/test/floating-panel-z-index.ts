const INITIAL_FLOATING_PANEL_Z_INDEX = 3000;
const MAX_FLOATING_PANEL_Z_INDEX = 9000;

let currentFloatingPanelZIndex = INITIAL_FLOATING_PANEL_Z_INDEX;

export function getInitialFloatingPanelZIndex() {
  return INITIAL_FLOATING_PANEL_Z_INDEX;
}

export function bringFloatingPanelToFront() {
  if (currentFloatingPanelZIndex >= MAX_FLOATING_PANEL_Z_INDEX) {
    currentFloatingPanelZIndex = INITIAL_FLOATING_PANEL_Z_INDEX;
  }

  currentFloatingPanelZIndex += 1;
  return currentFloatingPanelZIndex;
}
