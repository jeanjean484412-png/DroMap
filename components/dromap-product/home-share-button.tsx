"use client";

import { useRef, useState } from "react";
import styles from "./home-page.module.css";

export function DromapHomeShareButton({ url }: { url: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState("");
  const [canShare, setCanShare] = useState(false);
  const title = "Découvrez DroMap";
  const text = "Un atelier pour créer et partager vos cartes.";
  const body = `${text}\n${url}`;

  async function copyLink(instagram = false) {
    try {
      await navigator.clipboard.writeText(url);
      setMessage(instagram ? "Lien copié ! Collez-le dans votre conversation Instagram." : "Lien copié !");
    } catch {
      linkInput.current?.focus();
      linkInput.current?.select();
      setMessage("Sélectionnez et copiez le lien ci-dessous.");
    }
  }

  async function share() {
    try {
      await navigator.share({ title, text, url });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage("Le partage n’est pas disponible. Choisissez une application ou copiez le lien.");
      }
    }
  }

  return (
    <>
      <button type="button" className={styles.shareTrigger} aria-haspopup="dialog" onClick={() => {
        setMessage("");
        setCanShare(typeof navigator.share === "function" && (!navigator.canShare || navigator.canShare({ title, text, url })));
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
          <a href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer">WhatsApp <span aria-hidden="true">↗</span></a>
          <a href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer">Gmail <span aria-hidden="true">↗</span></a>
          <button type="button" onClick={() => void copyLink(true)}>Instagram <small>Copier le lien pour un message</small></button>
          <a href={`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`}>E-mail <span aria-hidden="true">↗</span></a>
          {canShare && <button type="button" onClick={() => void share()}>Autres applications…</button>}
        </div>
        <label className={styles.shareLabel} htmlFor="home-share-link">Lien à partager</label>
        <div className={styles.shareCopy}>
          <input ref={linkInput} id="home-share-link" readOnly value={url} onFocus={(event) => event.target.select()} />
          <button type="button" onClick={() => void copyLink()}>Copier</button>
        </div>
        <p className={styles.shareStatus} role="status">{message}</p>
        {message.startsWith("Lien copié ! Collez") && <a className={styles.textLink} href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer">Ouvrir Instagram ↗</a>}
      </dialog>
    </>
  );
}
