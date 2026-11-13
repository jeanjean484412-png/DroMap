import { createContext, type RefObject } from "react";

import type { WorkspaceBounds } from "@/lib/dromap/workspace-bounds";

export type PlaceSearchNavigation = (target: {
  lat: number;
  lng: number;
  bounds: WorkspaceBounds;
}) => "marked" | "centered" | "outside-visible" | "outside-hidden";

export const PlaceSearchNavigationContext = createContext<RefObject<PlaceSearchNavigation | null> | null>(null);
