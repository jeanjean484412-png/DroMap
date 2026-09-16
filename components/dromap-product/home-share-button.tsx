"use client";

import { useRef, useState } from "react";
import styles from "./home-page.module.css";

export function DromapHomeShareButton({ url }: { url: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const title = "Découvrez DroMap";
  const text = "Un atelier pour créer et partager vos cartes.";
  const body = `${text}\n${url}`;
  const gmailBody = [
    "Bonjour,",
    "",
    "Je voulais vous faire découvrir DroMap, un atelier en ligne pour créer des cartes claires et personnalisées.",
    "",
    "Un lieu à explorer, un parcours à préparer ou un projet à expliquer : ajoutez vos repères, vos données et vos annotations, puis composez une carte à votre image.",
    "",
    `Découvrir DroMap : ${url}`,
    "",
    "Bonne découverte !",
  ].join("\n");

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Lien copié !");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setMessage("Sélectionnez et copiez le lien ci-dessous.");
    }
  }

  async function share() {
    const data = { title, text, url };
    try {
      if (typeof navigator.share !== "function" || (navigator.canShare && !navigator.canShare(data))) {
        await copyForOtherApp();
        return;
      }
      await navigator.share(data);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        await copyForOtherApp();
      }
    }
  }

  async function copyForOtherApp() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("Lien copié ! Ce navigateur ne propose pas de menu de partage. Collez le lien dans l’application de votre choix.");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setMessage("Ce navigateur ne propose pas de menu de partage. Copiez le lien sélectionné, puis collez-le dans l’application de votre choix.");
    }
  }

  return (
    <>
      <button type="button" className={styles.shareTrigger} aria-haspopup="dialog" onClick={() => {
        setMessage("");
        dialog.current?.showModal();
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
        Partager
      </button>
      <dialog ref={dialog} className={styles.shareDialog} aria-labelledby="home-share-title" onClick={(event) => {
        if (event.target === event.currentTarget) {
          const rect = event.currentTarget.getBoundingClientRect();
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.current?.close();
        }
      }}>
        <div className={styles.shareHeading}>
          <h2 id="home-share-title">Faites découvrir DroMap</h2>
          <button type="button" aria-label="Fermer" onClick={() => dialog.current?.close()}>×</button>
        </div>
        <p>Un proche, un collègue, un projet en commun ? Envoyez-leur le lien.</p>
        <div className={styles.shareOptions}>
          <button type="button" className={styles.primaryShareOption} onClick={() => {
            window.open(`https://wa.me/?text=${encodeURIComponent(body)}`, "_blank", "noopener,noreferrer");
          }}>Partager sur WhatsApp <span aria-hidden="true">↗</span></button>
          <a href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(title)}&body=${encodeURIComponent(gmailBody)}`} target="_blank" rel="noopener noreferrer">Gmail <small>Objet et message déjà remplis</small></a>
          <button type="button" onClick={() => void share()}>Autres applications…</button>
        </div>
        <label className={styles.shareLabel} htmlFor="home-share-link">Lien à partager</label>
        <div className={styles.shareCopy}>
          <input ref={linkInput} id="home-share-link" readOnly value={url} onFocus={(event) => event.target.select()} />
          <button type="button" onClick={() => void copyLink()}>Copier</button>
        </div>
        <p className={styles.shareStatus} role="status">{message}</p>
      </dialog>
    </>
  );
}
