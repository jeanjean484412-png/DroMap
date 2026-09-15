"use client";

import { useRef, useState } from "react";
import styles from "./home-page.module.css";

export function DromapHomeShareButton({ url }: { url: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const emailCard = useRef<HTMLTableElement>(null);
  const [message, setMessage] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const title = "Découvrez DroMap";
  const text = "Un atelier pour créer et partager vos cartes.";
  const body = `${text}\n${url}`;

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

  async function copyEmail() {
    if (!emailCard.current) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "text/html": new Blob([emailCard.current.outerHTML], { type: "text/html" }),
        "text/plain": new Blob([`${title}\n\n${body}`], { type: "text/plain" }),
      })]);
      setEmailCopied(true);
      setMessage("Message mis en forme copié. Ouvrez Gmail puis collez-le dans le corps du message (Ctrl+V ou ⌘V).");
    } catch {
      setEmailCopied(false);
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNode(emailCard.current);
      selection?.removeAllRanges();
      selection?.addRange(range);
      setMessage("Copie automatique indisponible. Copiez la carte sélectionnée (Ctrl+C ou ⌘C), puis collez-la dans Gmail.");
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
        setShowEmail(false);
        setEmailCopied(false);
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
          <a className={styles.whatsappOption} href={`https://wa.me/?text=${encodeURIComponent(body)}`} target="_blank" rel="noopener noreferrer">Partager sur WhatsApp <span aria-hidden="true">↗</span></a>
          <button type="button" aria-expanded={showEmail} aria-controls="home-share-email" onClick={() => { setShowEmail(!showEmail); setMessage(""); }}>Gmail <small>Un message aux couleurs de DroMap</small></button>
          {canShare && <button type="button" onClick={() => void share()}>Autres applications…</button>}
        </div>
        {showEmail && <section id="home-share-email" className={styles.emailSection} aria-label="Message à partager dans Gmail">
          <p>Copiez cette carte, ouvrez Gmail, puis collez-la dans votre message.</p>
          <table ref={emailCard} role="presentation" cellPadding={0} cellSpacing={0} width="100%" style={{ maxWidth: 520, backgroundColor: "#f7f5ee", border: "1px solid #dce2db", borderCollapse: "collapse", fontFamily: "Arial, sans-serif", color: "#1c4355", textAlign: "left" }}>
            <tbody>
              <tr><td style={{ padding: "24px 24px 16px", borderTop: "4px solid #348279" }}>
                {/* Email clients need the transparent PNG derived from the approved SVG. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${new URL(url).origin}/dromap-logo.png?v=20260915-3`} alt="DroMap" width="64" height="57" style={{ display: "block", border: 0, marginBottom: 10 }} />
                <strong style={{ fontSize: 24, color: "#1c4355" }}>DroMap</strong>
              </td></tr>
              <tr><td style={{ padding: "0 24px 16px", fontSize: 27, lineHeight: "1.2", fontWeight: "bold", color: "#1c4355" }}>Vos idées méritent<br />une carte.</td></tr>
              <tr><td style={{ padding: "0 24px 24px", fontSize: 15, lineHeight: "1.7", color: "#52616a" }}>Un lieu à explorer, un parcours à préparer, un projet à expliquer. Avec DroMap, ajoutez vos repères et créez une carte à votre image.</td></tr>
              <tr><td style={{ padding: "0 24px 24px" }}><a href={url} style={{ display: "inline-block", backgroundColor: "#1c4355", color: "#ffffff", padding: "13px 20px", borderRadius: 5, textDecoration: "none", fontSize: 15, fontWeight: "bold" }}>Découvrir DroMap →</a></td></tr>
              <tr><td style={{ padding: "16px 24px", borderTop: "1px solid #dce2db", color: "#63716f", fontSize: 12, lineHeight: "1.6" }}>Votre atelier de cartographie.<br /><a href={url} style={{ color: "#348279" }}>{url}</a></td></tr>
            </tbody>
          </table>
          <div className={styles.emailActions}>
            <button type="button" onClick={() => void copyEmail()}>{emailCopied ? "Copier à nouveau" : "1. Copier le message"}</button>
            <a href={`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(title)}`} target="_blank" rel="noopener noreferrer">2. Ouvrir Gmail ↗</a>
          </div>
          <p>Collez avec la mise en forme. Le rendu peut varier selon votre messagerie.</p>
        </section>}
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
