"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useDromapProductStore } from "@/stores/dromap-product";
import { DromapContactDialog } from "./contact-dialog";
import { DromapLogoMark } from "./dromap-brand";

const LINKS = [
  { href: "/dashboard", label: "Mes projets", icon: "projects" },
  { href: "/library", label: "Cartes publiques", icon: "public" },
  { href: "/trash", label: "Corbeille", icon: "trash" },
  { href: "/help", label: "Centre d’aide", icon: "help" },
  { href: "/pricing", label: "Formules", icon: "pricing" },
  { href: "/account", label: "Compte", icon: "account" },
  { href: "/settings", label: "Paramètres", icon: "settings" },
] as const;

type NavigationIconKind = (typeof LINKS)[number]["icon"] | "contact";

function NavigationIcon({ kind }: { kind: NavigationIconKind }) {
  if (kind === "public") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M3.5 9h17M3.5 15h17" />
        <path d="M12 3c2.2 2.4 3.4 5.4 3.4 9S14.2 18.6 12 21c-2.2-2.4-3.4-5.4-3.4-9S9.8 5.4 12 3Z" />
      </svg>
    );
  }

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

  if (kind === "settings") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
        <path d="M14 4v6M8 14v6" />
        <circle cx="14" cy="7" r="2" />
        <circle cx="8" cy="17" r="2" />
      </svg>
    );
  }

  if (kind === "contact") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 5h16v14H4z" />
        <path d="m4 7 8 6 8-6" />
      </svg>
    );
  }

  if (kind === "pricing") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18" />
        <path d="M7 15h4" />
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

function NavigationLink({
  href,
  label,
  icon,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: NavigationIconKind;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
    >
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10" aria-hidden="true">
        <NavigationIcon kind={icon} />
      </span>
      {label}
    </Link>
  );
}

export function DromapProductNavigation() {
  const pathname = usePathname();
  const userMode = useDromapProductStore((state) => state.userMode);
  const accountName = useDromapProductStore((state) => state.accountName);
  const accountEmail = useDromapProductStore((state) => state.accountEmail);
  const [contactOpen, setContactOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[3000] flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm lg:hidden">
        <Link href="/accueil" className="flex items-center gap-2" aria-label="Accueil DroMap">
          <span className="grid h-10 w-10 place-items-center rounded-xl border border-[#b9ddd7] bg-[#e9f6f3]">
            <DromapLogoMark className="h-8 w-8 object-contain" />
          </span>
          <span className="font-black tracking-tight text-[#123a59]">DroMap</span>
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-xl font-black text-slate-800"
          aria-label="Ouvrir la navigation"
          aria-expanded={mobileOpen}
        >
          ☰
        </button>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[3100] bg-slate-950/55 backdrop-blur-[1px] lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Fermer la navigation"
        />
      ) : null}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-[3200] flex w-[min(20rem,calc(100vw-3rem))] shrink-0 flex-col border-r border-slate-200 bg-slate-950 text-white shadow-2xl transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:translate-x-0 lg:shadow-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <Link href="/accueil" onClick={() => setMobileOpen(false)} className="flex items-center gap-3" aria-label="Accueil DroMap">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#b9ddd7] bg-[#e9f6f3]">
                <DromapLogoMark className="h-11 w-11 object-contain" />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-black tracking-tight text-white">DroMap</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-slate-400">Éditeur cartographique</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/15 text-xl text-white lg:hidden"
              aria-label="Fermer la navigation"
            >
              ×
            </button>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Navigation principale">
          {LINKS.slice(0, 4).map((link) => (
            <NavigationLink key={link.href} {...link} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          ))}

          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              setContactOpen(true);
            }}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${contactOpen ? "bg-white text-slate-950" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/10" aria-hidden="true">
              <NavigationIcon kind="contact" />
            </span>
            Contact
          </button>

          {LINKS.slice(4).map((link) => (
            <NavigationLink key={link.href} {...link} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          ))}
        </nav>

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-400">
            <Link href="/confidentialite" className="transition hover:text-white">Confidentialité</Link>
            <span aria-hidden="true">·</span>
            <Link href="/conditions-generales" className="transition hover:text-white">Conditions</Link>
          </div>
          <Link
            href="/credits"
            className={`mb-3 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${
              pathname === "/credits" || pathname.startsWith("/credits/")
                ? "border-white bg-white text-slate-950"
                : "border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10 hover:text-white"
            }`}
          >
            <span aria-hidden="true" className="text-[13px] leading-none">©</span>
            Crédits
          </Link>
          <div className="truncate text-sm font-semibold">{accountName}</div>
          <div className="mt-1 text-xs text-slate-400">
            {userMode === "guest" ? "Projet temporaire sur cet appareil" : accountEmail ?? "Compte DroMap"}
          </div>
        </div>
      </aside>

      <DromapContactDialog
        open={contactOpen}
        pathname={pathname}
        onClose={() => setContactOpen(false)}
      />
    </>
  );
}
