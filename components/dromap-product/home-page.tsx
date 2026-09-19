import Link from "next/link";
import { IBM_Plex_Sans } from "next/font/google";
import { DromapHomeAccountActions } from "@/components/dromap-product/home-account-actions";
import { DromapBrandBlock } from "@/components/dromap-product/dromap-brand";
import { DromapHomeShareButton } from "@/components/dromap-product/home-share-button";
import { getDromapSiteUrl } from "@/lib/dromap/site-url";
import styles from "./home-page.module.css";

const homeFont = IBM_Plex_Sans({
  subsets: ["latin"], weight: ["400", "500", "600"],
  variable: "--font-home", display: "swap",
});
export function DromapHomePage() {
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
        <section className={styles.exampleGrid} aria-label="Cartes d’exemple à venir">
          {[1, 2, 3].map((slot) => <div key={slot} className={styles.examplePlaceholder}>carte d’exemple à venir</div>)}
        </section>
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
        <section className={styles.closing}><div><p className={styles.eyebrow}>À vous de jouer</p><h2>Tout commence par un lieu.</h2><p>Ouvrez l’atelier et essayez avec un endroit que vous connaissez. Vous pouvez commencer sans créer de compte.</p></div><Link className={styles.button} href="/projects/new">Commencer ma carte <span aria-hidden="true">↗</span></Link></section>
        <footer className={styles.footer}><DromapBrandBlock markClassName="h-10 w-auto" titleClassName="text-xl font-semibold tracking-tight text-[#1c4355]" subtitle={null} /><nav aria-label="Informations"><Link href="/pricing">Formules</Link><Link href="/confidentialite">Confidentialité</Link><Link href="/conditions-generales">Conditions générales</Link><Link href="/credits">Crédits</Link><a href="mailto:contact@dromap.fr">Contact</a></nav></footer>
      </div>
    </main>
  );
}
