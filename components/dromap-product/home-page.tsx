import Link from "next/link";

import { DromapHomeAccountActions } from "@/components/dromap-product/home-account-actions";
import { DromapBrandBlock } from "@/components/dromap-product/dromap-brand";
import type { DromapPublicPublication } from "@/lib/dromap/publications";
import {
  dromapPublicationsConfigured,
  publicationRowToPublicWithImageRoutes,
  publicationsAdminFetch,
  type DromapPublicationRow,
} from "@/lib/dromap/server/publications";

const VALUE_PROPS = [
  {
    title: "Une carte vraiment modifiable",
    description:
      "Marqueurs, textes, traits, zones, calques et données restent des objets éditables — pas une image figée.",
  },
  {
    title: "Des imports utiles, pas du bruit",
    description:
      "GeoJSON, bâtiments, routes et autres données cartographiques s’intègrent à la zone de travail avec sélection et contrôle.",
  },
  {
    title: "Un rendu fidèle",
    description:
      "Titre, légende, échelle, nord et objets gardent leurs proportions entre l’éditeur, l’aperçu et l’export.",
  },
  {
    title: "L’IA reste sous contrôle",
    description:
      "L’Assistant peut proposer un plan et préparer des actions, mais les étapes sensibles restent visibles, ajustables et réversibles.",
  },
] as const;

const FEATURED_PUBLICATION_TITLES = ["Candice", "Coetquiflan", "Test"] as const;

function placeholderPublication(title: string): DromapPublicPublication {
  const now = new Date().toISOString();
  return {
    slug: title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    title,
    description: "Carte publiée dans DroMap.",
    authorName: null,
    tags: [],
    thumbnailDataUrl: "",
    accessMode: "read-only",
    allowCreatorCreditRemoval: false,
    creatorCreditName: null,
    publishedAt: now,
    updatedAt: now,
  };
}

async function readFeaturedPublications() {
  if (!dromapPublicationsConfigured()) {
    return FEATURED_PUBLICATION_TITLES.map((title) => placeholderPublication(title));
  }

  try {
    const response = await publicationsAdminFetch(
      "/dromap_publications?select=slug,title,description,author_name,tags,access_mode,allow_creator_credit_removal,creator_credit_name,published_at,updated_at&order=published_at.desc&limit=120",
      { method: "GET" },
    );

    if (!response.ok) {
      return FEATURED_PUBLICATION_TITLES.map((title) => placeholderPublication(title));
    }

    const rows = (await response.json().catch(() => [])) as DromapPublicationRow[];
    const publications = Array.isArray(rows)
      ? rows
          .map((row) => publicationRowToPublicWithImageRoutes(row))
          .filter((row): row is DromapPublicPublication => row !== null)
      : [];

    return FEATURED_PUBLICATION_TITLES.map((title) => {
      const publication = publications.find(
        (item) => item.title.localeCompare(title, "fr", { sensitivity: "base" }) === 0,
      );
      return publication ?? placeholderPublication(title);
    });
  } catch {
    return FEATURED_PUBLICATION_TITLES.map((title) => placeholderPublication(title));
  }
}

function PublicationVisual({
  publication,
  priority = false,
}: {
  publication: DromapPublicPublication;
  priority?: boolean;
}) {
  if (!publication.thumbnailDataUrl) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#eaf3f1] p-6 text-center">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[#2b8e88]">
            Carte DroMap
          </div>
          <div className="mt-3 text-2xl font-black tracking-tight text-[#123a59]">
            {publication.title}
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            L’aperçu réel apparaîtra ici dès que la carte sera disponible dans la bibliothèque publique.
          </p>
        </div>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={publication.thumbnailDataUrl}
      alt={`Aperçu de ${publication.title}`}
      draggable={false}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      className="h-full w-full object-contain bg-slate-100"
    />
  );
}

function FeaturedMapsShowcase({ publications }: { publications: DromapPublicPublication[] }) {
  const [mainPublication, ...secondaryPublications] = publications;

  return (
    <div className="rounded-2xl border border-[#d7e7e3] bg-white p-4 shadow-sm">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfcfb]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Carte mise en avant
            </div>
            <div className="mt-1 text-lg font-black tracking-tight text-slate-950">
              {mainPublication.title}
            </div>
          </div>
          <Link
            href={mainPublication.thumbnailDataUrl ? `/library/${mainPublication.slug}` : "/library"}
            className="rounded-full border border-[#cfe7e3] bg-[#eff9f7] px-4 py-2 text-xs font-black text-[#123a59] hover:border-[#b8ddd8]"
          >
            Voir la carte
          </Link>
        </div>
        <div className="aspect-[16/8] overflow-hidden bg-slate-100">
          <PublicationVisual publication={mainPublication} priority />
        </div>
        <div className="border-t border-slate-200 px-5 py-4 text-sm leading-6 text-slate-600">
          {mainPublication.description || "Carte publiée dans DroMap."}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {secondaryPublications.map((publication) => (
          <Link
            key={publication.title}
            href={publication.thumbnailDataUrl ? `/library/${publication.slug}` : "/library"}
            className="overflow-hidden rounded-2xl border border-slate-200 bg-[#fbfcfb] transition hover:border-[#b8ddd8]"
          >
            <div className="aspect-[16/9] overflow-hidden border-b border-slate-200 bg-slate-100">
              <PublicationVisual publication={publication} />
            </div>
            <div className="px-4 py-3">
              <div className="text-sm font-black text-slate-950">{publication.title}</div>
              <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                {publication.description || "Carte publiée dans DroMap."}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export async function DromapHomePage() {
  const featuredPublications = await readFeaturedPublications();

  return (
    <main className="min-h-screen bg-[#f7f9f8] pb-[calc(5rem+env(safe-area-inset-bottom))] text-slate-950 sm:pb-0">
      <header className="border-b border-[#d9e7e4] bg-[#fbfcfb]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
          <Link href="/accueil" aria-label="Accueil DroMap">
            <DromapBrandBlock markClassName="h-12 w-auto sm:h-16" titleClassName="text-xl font-black tracking-tight text-[#123a59] sm:text-[1.5rem]" subtitle="Éditeur cartographique" />
          </Link>
          <nav className="flex min-w-0 items-center gap-1 text-sm font-semibold text-slate-600 sm:gap-2 lg:gap-3" aria-label="Navigation publique">
            <Link href="/library" className="hidden rounded-full px-3 py-2 hover:bg-white hover:text-slate-950 md:inline-flex">Cartes publiques</Link>
            <Link href="/pricing" className="hidden rounded-full px-3 py-2 hover:bg-white hover:text-slate-950 md:inline-flex">Formules</Link>
            <Link href="/help" className="hidden rounded-full px-3 py-2 hover:bg-white hover:text-slate-950 lg:inline-flex">Aide</Link>
            <DromapHomeAccountActions />
            <Link
              href="/projects/new"
              className="hidden rounded-full bg-[#123a59] px-5 py-2.5 font-black text-white transition hover:bg-[#0f304a] sm:inline-flex"
            >
              Créer une carte
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-[#d9e7e4] bg-[#f7f9f8]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start xl:gap-14">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#cfe7e3] bg-[#eef9f7] px-3 py-1.5 text-xs font-black text-[#123a59]">
              <span className="h-2 w-2 rounded-full bg-[#2eb7a7]" />
              Cartographie claire, modifiable et exportable
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-black leading-[1.05] tracking-[-0.04em] text-slate-950 sm:mt-6 sm:text-5xl xl:text-6xl">
              Crée une carte sérieuse sans apprendre un logiciel SIG.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:mt-6 sm:text-lg sm:leading-8">
              DroMap réunit les gestes familiers d’un éditeur graphique et les fonctions utiles de la cartographie : zone de travail, calques, imports, légende, rendu fidèle et Assistant IA contrôlable.
            </p>
            <div className="mt-7 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
              <Link
                href="/projects/new"
                className="inline-flex items-center justify-center rounded-full bg-[#123a59] px-6 py-3.5 text-sm font-black text-white transition hover:bg-[#0f304a]"
              >
                Créer une carte
              </Link>
              <Link
                href="/library"
                className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-3.5 text-sm font-black text-slate-800 transition hover:border-slate-400 hover:bg-slate-50"
              >
                Voir les cartes publiques
              </Link>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
              <span>Essai sans compte</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>Projet modifiable</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>Export PNG standard disponible</span>
            </div>
          </div>
          <FeaturedMapsShowcase publications={featuredPublications} />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#2b8e88]">Pourquoi DroMap</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Un éditeur de carte, pas un générateur d’image.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-600">
              Chaque élément important reste structuré et modifiable. Une carte peut être reprise, corrigée et réorganisée sans repartir de zéro.
            </p>
          </div>
          <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2">
            {VALUE_PROPS.map((item, index) => (
              <article
                key={item.title}
                className="bg-white p-6"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  0{index + 1}
                </div>
                <h3 className="mt-3 text-lg font-black tracking-tight text-slate-950">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[#2b8e88]">De la donnée au rendu</div>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
              Garde la maîtrise à chaque étape.
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-slate-600">
              Le parcours reste lisible : définir une zone, ajouter les données utiles, mettre en forme la carte, puis préparer le rendu final.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {[
              ["01", "Définir la zone", "Recherche, sélection manuelle ou zone administrative selon le projet."],
              ["02", "Ajouter les éléments utiles", "Objets DroMap, GeoJSON, bâtiments, routes et bibliothèques selon les droits disponibles."],
              ["03", "Mettre en forme", "Styles, étiquettes, calques, sélection multiple et légende liée aux objets."],
              ["04", "Préparer le rendu", "Titre, légende, échelle, nord, détail du fond et formats d’export."],
            ].map(([number, title, description]) => (
              <li key={number} className="rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{number}</div>
                <div className="mt-3 font-black text-slate-950">{title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{description}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 sm:pb-16 lg:px-8 lg:pb-20">
        <div className="rounded-2xl border border-[#163f5e] bg-[#123a59] px-5 py-8 text-white sm:px-8 sm:py-10">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-center">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.18em] text-[#8fe5da]">
                Commencer maintenant
              </div>
              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                Construis une carte avant de choisir une formule.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
                Le mode sans compte permet de tester le parcours et les outils essentiels. Un compte peut ensuite être créé pour synchroniser les projets et débloquer les fonctions avancées.
              </p>
            </div>
            <div className="space-y-3">
              <Link
                href="/projects/new"
                className="block rounded-full bg-white px-5 py-3.5 text-center text-sm font-black text-[#123a59] hover:bg-slate-100"
              >
                Créer une carte
              </Link>
              <Link
                href="/pricing"
                className="block rounded-full border border-white/25 px-5 py-3.5 text-center text-sm font-black text-white hover:bg-white/10"
              >
                Comparer les formules
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#d9e7e4] bg-[#fbfcfb]">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:px-8 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <DromapBrandBlock subtitle="Éditeur cartographique pour créer des cartes claires, modifiables et exportables." markClassName="h-12 w-auto" titleClassName="text-[1.3rem] font-black tracking-tight text-[#123a59]" subtitleClassName="text-xs text-slate-500" />
          </div>
          <div className="flex flex-wrap items-center gap-5 text-xs font-semibold text-slate-500">
            <Link href="/confidentialite" className="hover:text-slate-900">Confidentialité</Link>
            <Link href="/conditions-generales" className="hover:text-slate-900">Conditions générales</Link>
            <Link href="/credits" className="hover:text-slate-900">Crédits</Link>
            <a href="mailto:contact@dromap.fr" className="hover:text-slate-900">Contact</a>
          </div>
        </div>
      </footer>

      <div className="fixed inset-x-0 bottom-0 z-[2900] border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-10px_30px_rgba(15,23,42,0.14)] backdrop-blur sm:hidden">
        <Link
          href="/projects/new"
          className="flex min-h-12 w-full items-center justify-center rounded-full bg-[#123a59] px-5 text-sm font-black text-white shadow-sm transition hover:bg-[#0f304a]"
        >
          Créer une carte
        </Link>
      </div>
    </main>
  );
}
