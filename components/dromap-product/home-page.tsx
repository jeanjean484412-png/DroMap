import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import { DromapHomeAccountActions } from "@/components/dromap-product/home-account-actions";
import { DromapBrandBlock } from "@/components/dromap-product/dromap-brand";
import { DromapHomeShareButton } from "@/components/dromap-product/home-share-button";
import { getDromapSiteUrl } from "@/lib/dromap/site-url";
import type { DromapPublicPublication } from "@/lib/dromap/publications";
import {
  dromapPublicationsConfigured, publicationRowToPublicWithImageRoutes,
  publicationsAdminFetch, type DromapPublicationRow,
} from "@/lib/dromap/server/publications";
import styles from "./home-page.module.css";

const homeFont = IBM_Plex_Sans({
  subsets: ["latin"], weight: ["400", "500", "600"],
  variable: "--font-home", display: "swap",
});
const HIDDEN_DEMO_TITLES = ["Candice", "Coetquiflan"] as const;

async function readFeaturedPublications() {
  if (!dromapPublicationsConfigured()) {
    return [];
  }

  try {
    const response = await publicationsAdminFetch(
      "/dromap_publications?select=slug,title,description,author_name,tags,access_mode,allow_creator_credit_removal,creator_credit_name,published_at,updated_at&order=published_at.desc&limit=120",
      { method: "GET" },
    );

    if (!response.ok) {
      return [];
    }

    const rows = (await response.json().catch(() => [])) as DromapPublicationRow[];
    const publications = Array.isArray(rows)
      ? rows
          .map((row) => publicationRowToPublicWithImageRoutes(row))
          .filter((row): row is DromapPublicPublication => row !== null)
      : [];

    return publications.filter((item) =>
      !HIDDEN_DEMO_TITLES.some((title) => item.title.trim().localeCompare(title, "fr", { sensitivity: "base" }) === 0),
    ).slice(0, 3);
  } catch {
    return [];
  }
}


function MapIllustration() {
  return (
    <svg viewBox="0 0 1100 500" width="100%" height="100%" role="img" aria-label="Illustration cartographique : un parcours relie le village, la prairie et le belvédère" preserveAspectRatio="xMidYMid slice">
      <rect width="1100" height="500" fill="#e9ecdd" />
      <path d="M0 0H440L380 110 220 174 0 123Z M680 0H1100V230L916 190 823 87Z M0 330L190 270 314 380 258 500H0Z M707 352L872 298 1100 362V500H740Z" fill="#cbd8bd" />
      <g fill="none" stroke="#afbea5" strokeWidth="1.5" opacity=".55">
        <path d="M-60 60Q180 200 338 42T720 80 1150 140 M-60 86Q180 226 338 68T720 106 1150 166 M-60 112Q180 252 338 94T720 132 1150 192 M-60 138Q180 278 338 120T720 158 1150 218" />
        <path d="M590 520Q580 375 782 385T1160 320 M610 520Q600 395 802 405T1160 340 M630 520Q620 415 822 425T1160 360" />
      </g>
      <path d="M370 -30C310 70 532 100 486 207S391 322 519 370 554 466 610 530" fill="none" stroke="#f7f5ee" strokeWidth="29" />
      <path d="M370 -30C310 70 532 100 486 207S391 322 519 370 554 466 610 530" fill="none" stroke="#a1cbd0" strokeWidth="20" />
      <path d="M-30 390L197 264 389 290 642 191 892 255 1130 135 M198 264L235 -20 M642 191L741 -20 M389 290L291 530" fill="none" stroke="#d3cab8" strokeWidth="18" strokeLinejoin="round" />
      <path d="M-30 390L197 264 389 290 642 191 892 255 1130 135 M198 264L235 -20 M642 191L741 -20 M389 290L291 530" fill="none" stroke="#fffdf3" strokeWidth="13" strokeLinejoin="round" />
      <g fill="#d7b3a0" stroke="#bd9581" strokeWidth="1">
        <path d="M198 212h29v22h-29z M244 233h36v19h-36z M254 272h26v32h-26z M304 242h42v25h-42z M335 306h24v18h-24z M173 291h32v22h-32z M643 219h26v19h-26z M683 229h34v22h-34z" />
      </g>
      <path d="M244 255L362 218 415 143 635 116 755 184 870 162 939 92" fill="none" stroke="#fffdf3" strokeWidth="8" strokeLinejoin="round" />
      <path d="M244 255L362 218 415 143 635 116 755 184 870 162 939 92" fill="none" stroke="#ce6350" strokeWidth="4" strokeDasharray="9 6" strokeLinejoin="round" />
      <g fill="#fffdf3" stroke="#1c4355" strokeWidth="3"><circle cx="244" cy="255" r="7" /><circle cx="635" cy="116" r="7" /><circle cx="939" cy="92" r="7" /></g>
      <g fill="#1c4355" fontFamily="sans-serif" fontSize="16">
        <text x="199" y="346">Le village</text><text x="573" y="86">La grande prairie</text><text x="865" y="65">Le belvédère</text>
        <text x="780" y="422" fontSize="12" letterSpacing="3" fill="#70826c">BOIS DES CHÊNES</text>
      </g>
      <g transform="translate(1010 330)" fill="#1c4355"><text x="0" y="-14" textAnchor="middle" fontFamily="sans-serif" fontSize="13">N</text><path d="M0 0L-7 28 0 22 7 28Z" /></g>
      <g transform="translate(36 418)"><rect width="204" height="50" rx="2" fill="#fffdf3" fillOpacity=".94" /><path d="M16 25h38" stroke="#ce6350" strokeWidth="3" strokeDasharray="7 4" /><text x="68" y="30" fill="#1c4355" fontSize="13" fontFamily="sans-serif">Parcours de la sortie</text></g>
    </svg>
  );
}

function PublicationVisual({ publication, priority = false }: { publication: DromapPublicPublication; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={publication.thumbnailDataUrl} alt={`Carte : ${publication.title}`} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" />
  );
}

export async function DromapHomePage() {
  const publications = (await readFeaturedPublications()).filter((item) => item.thumbnailDataUrl);
  const [mainPublication, ...otherPublications] = publications;
  return (
    <main className={`${homeFont.variable} ${styles.home}`}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <Link href="/accueil" aria-label="Accueil DroMap"><DromapBrandBlock markClassName="h-12 w-auto sm:h-14" titleClassName="text-2xl font-semibold tracking-tight text-[#1c4355]" subtitle={null} /></Link>
          <nav className={styles.nav} aria-label="Navigation publique"><Link href="/library">Les cartes</Link><Link href="/pricing">Les formules</Link><Link href="/help">Aide</Link><DromapHomeShareButton url={`${getDromapSiteUrl()}/accueil`} /><DromapHomeAccountActions /></nav>
        </header>
        <section className={styles.hero}>
          <p className={styles.eyebrow}>Votre atelier de cartographie</p>
          <h1>Mettez votre territoire<br /><span>au clair.</span></h1>
          <div className={styles.intro}>
            <p>Un lieu à explorer, un projet à expliquer, un itinéraire à partager. Ajoutez vos données, dessinez ce qui compte et composez une carte qui raconte votre terrain.</p>
            <div><div className={styles.actions}><Link className={styles.button} href="/projects/new">Commencer ma carte <span aria-hidden="true">↗</span></Link><Link className={styles.textLink} href="/library">Explorer les cartes</Link></div><div className={styles.note}>Essayez sans compte. Export PNG standard disponible.</div></div>
          </div>
        </section>
        <figure className={styles.mapFrame}>
          <div className={styles.mapVisual}>{mainPublication ? <PublicationVisual publication={mainPublication} priority /> : <MapIllustration />}</div>
          <figcaption className={styles.caption}><div><strong>{mainPublication?.title ?? "Une sortie, un parcours, des repères."}</strong><span> — {mainPublication ? "Une carte créée avec DroMap" : "Illustration cartographique"}</span></div>{mainPublication ? <Link className={styles.textLink} href={`/library/${mainPublication.slug}`}>Voir cette carte ↗</Link> : <span>À vous de tracer la suite.</span>}</figcaption>
        </figure>
        <section className={styles.section}>
          <p className={styles.eyebrow}>Du premier repère à la carte finale</p>
          <h2>Vous connaissez le terrain.<br />Donnez-lui forme.</h2>
          <p className={styles.sectionIntro}>DroMap réunit le fond de carte, vos données et vos annotations dans un même espace. Vous pouvez tout reprendre, déplacer et ajuster au fil de votre projet.</p>
          <ol className={styles.steps}>{[
            ["01", "Cadrez votre territoire", "Un quartier, une commune, un coin de forêt. Recherchez votre lieu et choisissez la zone que vous voulez montrer."],
            ["02", "Montrez ce qui compte", "Importez vos données, tracez un parcours, entourez une zone ou ajoutez quelques mots. Votre carte prend votre point de vue."],
            ["03", "Soignez le dernier détail", "Placez le titre, organisez la légende et choisissez votre format. Exportez votre carte pour un dossier, une réunion ou une sortie."],
          ].map(([number, title, description]) => <li key={number} className={styles.step}><span className={styles.number}>{number}</span><h3>{title}</h3><p>{description}</p></li>)}</ol>
        </section>
        <section className={`${styles.section} ${styles.uses}`}>
          <div><p className={styles.eyebrow}>Des cartes qui servent</p><h2>Qu’avez-vous envie<br />de montrer ?</h2><p className={styles.sectionIntro}>Une bonne carte aide à se repérer et à se comprendre. Le contenu, c’est vous qui l’apportez.</p></div>
          <ul className={styles.useList}>
            <li><h3>Un projet à présenter</h3><p>Rendez visibles les bâtiments, les accès et les zones d’intervention pour que chacun comprenne de quoi vous parlez.</p></li>
            <li><h3>Une sortie à préparer</h3><p>Rassemblez le parcours, les points de rendez-vous et les lieux à ne pas manquer sur un même document.</p></li>
            <li><h3>Un territoire à raconter</h3><p>Mettez vos observations en carte pour un cours, une étude ou une publication.</p></li>
          </ul>
        </section>
        {otherPublications.length > 0 ? <section className={styles.section}><p className={styles.eyebrow}>L’atelier ouvert</p><h2>D’autres regards sur le terrain.</h2><div className={styles.gallery}>{otherPublications.map((publication) => <Link key={publication.slug} href={`/library/${publication.slug}`}><PublicationVisual publication={publication} /><h3>{publication.title} ↗</h3>{publication.description ? <p>{publication.description}</p> : null}</Link>)}</div></section> : null}
        <section className={styles.closing}><div><p className={styles.eyebrow}>À vous de jouer</p><h2>Tout commence par un lieu.</h2><p>Ouvrez l’atelier et essayez avec un endroit que vous connaissez. Vous pouvez commencer sans créer de compte.</p></div><Link className={styles.button} href="/projects/new">Commencer ma carte <span aria-hidden="true">↗</span></Link></section>
        <footer className={styles.footer}><DromapBrandBlock markClassName="h-10 w-auto" titleClassName="text-xl font-semibold tracking-tight text-[#1c4355]" subtitle={null} /><nav aria-label="Informations"><Link href="/pricing">Formules</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions-generales">Conditions générales</Link><Link href="/credits">Crédits</Link><a href="mailto:contact@dromap.fr">Contact</a></nav></footer>
      </div>
    </main>
  );
}
