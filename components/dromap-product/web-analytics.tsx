"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

const PRIVATE_PATH_PREFIXES = [
  "/dashboard",
  "/account",
  "/settings",
  "/trash",
  "/projects",
  "/editor",
  "/confirmation",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
] as const;

function isPrivatePath(pathname: string) {
  return PRIVATE_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function DromapWebAnalytics() {
  return (
    <Analytics
      beforeSend={(event: BeforeSendEvent) => {
        try {
          const pathname = new URL(event.url, window.location.origin).pathname;

          if (isPrivatePath(pathname)) {
            return null;
          }
        } catch {
          return null;
        }

        return event;
      }}
    />
  );
}
