"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function FloatingPanelPortal({ active, children }: { active: boolean; children: ReactNode }) {
  return active && typeof document !== "undefined"
    ? createPortal(children, document.body)
    : children;
}
