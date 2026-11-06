/** Build-time release setting. An unset value preserves the complete application. */
export const DROMAP_BETA = process.env.NEXT_PUBLIC_DROMAP_RELEASE_MODE === "beta";
/** Show the editor loading notice in beta builds and on localhost for review. */
export const SHOW_BETA_EDITOR_INTRO = DROMAP_BETA || process.env.NODE_ENV === "development";
export const DROMAP_BETA_PROJECT_LIMIT = 3;
export const DROMAP_BETA_NOTICE = "Version de test — DroMap est fonctionnel et continue d’évoluer. Vos retours sont essentiels à l’équipe.";
