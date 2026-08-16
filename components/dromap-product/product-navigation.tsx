"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDromapProductStore } from "@/stores/dromap-product";

const LINKS = [
  { href: "/dashboard", label: "Mes projets", icon: "projects" },
  { href: "/trash", label: "Corbeille", icon: "trash" },
  { href: "/help", label: "Centre d’aide", icon: "help" },
  { href: "/account", label: "Compte", icon: "account" },
] as const;

function NavigationIcon({ kind }: { kind: (typeof LINKS)[number]["icon"] }) {
  if (kind === "trash") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h16" />
        <path d="M9 7V4h6v3" />
        <path d="m6 7 1 13h10l1-13" />
        <path d="M10 11v5M14 11v5" />
      </svg>
    );
  }

  if (kind === "account") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4.5 21a7.5 7.5 0 0 1 15 0" />
      </svg>
    );
  }

  if (kind === "help") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.8 9a2.3 2.3 0 1 1 3.8 1.75c-.9.7-1.6 1.15-1.6 2.25" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}


export function DromapProductNavigation() {
  const pathname = usePathname();
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountName = useDromapProductStore((state) => state.accountName);
  const accountEmail = useDromapProductStore((state) => state.accountEmail);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-white">
      <div className="border-b border-white/10 px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500 font-black">D</span>
          <span>
            <span className="block font-black tracking-tight">DroMap</span>
            <span className="block text-xs text-slate-400">Éditeur cartographique</span>
          </span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3" aria-label="Navigation principale">
        {LINKS.map((link) => {
          const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10" aria-hidden="true">
                <NavigationIcon kind={link.icon} />
              </span>
              {link.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="truncate text-sm font-semibold">{accountName}</div>
        <div className="mt-1 text-xs text-slate-400">
          {userMode === "guest" ? "Projet temporaire sur cet appareil" : accountEmail ?? "Compte DroMap"}
        </div>
      </div>
    </aside>
  );
}
