import { withRequestSecurity } from "@/lib/dromap/server/request-security";
import { checkAbuseLimit } from "@/lib/dromap/server/abuse-limit";
import { validateContactAttachment } from "@/lib/dromap/server/contact-attachment";
import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { getAuthenticatedRequestUser } from "@/lib/dromap/server/supabase-rest";

export const runtime = "nodejs";
export const maxDuration = 30;

const CONTACT_TO = "contact@dromap.fr";
const CONTACT_FROM = "contact@dromap.fr";
const SMTP_HOST = "mail.infomaniak.com";
const SMTP_PORT = 587;
const SMTP_TIMEOUT_MS = 15_000;
const MAX_ATTACHMENT_COUNT = 3;
const MAX_ATTACHMENT_TOTAL_BYTES = 3 * 1024 * 1024;

const CATEGORY_LABELS = {
  technical: "Problème technique / bug",
  suggestion: "Suggestion / idée",
  billing: "Abonnement / paiement",
  account: "Compte / connexion",
  data: "Import / export / données",
  usage: "Question sur l’utilisation",
  legal: "Licences / crédits / confidentialité",
  other: "Autre demande",
} as const;

const CATEGORY_STYLES: Record<keyof typeof CATEGORY_LABELS, { background: string; color: string; accent: string }> = {
  technical: { background: "#fef2f2", color: "#b91c1c", accent: "#ef4444" },
  suggestion: { background: "#f5f3ff", color: "#6d28d9", accent: "#8b5cf6" },
  billing: { background: "#fff7ed", color: "#c2410c", accent: "#f97316" },
  account: { background: "#eff6ff", color: "#1d4ed8", accent: "#3b82f6" },
  data: { background: "#ecfeff", color: "#0e7490", accent: "#06b6d4" },
  usage: { background: "#ecfdf5", color: "#047857", accent: "#10b981" },
  legal: { background: "#f8fafc", color: "#475569", accent: "#64748b" },
  other: { background: "#f8fafc", color: "#334155", accent: "#64748b" },
};

type ContactCategory = keyof typeof CATEGORY_LABELS;

type TechnicalContext = {
  page?: unknown;
  accountPlan?: unknown;
  userMode?: unknown;
  browser?: unknown;
  language?: unknown;
  viewport?: unknown;
  timeZone?: unknown;
};

type ProjectContext = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  setupComplete?: unknown;
  setupStep?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  lastSavedAt?: unknown;
  deletedAt?: unknown;
  pendingChanges?: unknown;
  contentLoaded?: unknown;
  basemapId?: unknown;
  basemapLabel?: unknown;
  hasWorkspace?: unknown;
  featureCount?: unknown;
  drawingLayerCount?: unknown;
  geoJsonLayerCount?: unknown;
  customMarkerCount?: unknown;
  importedFileName?: unknown;
  remoteRevision?: unknown;
  remoteUpdatedAt?: unknown;
};


type SmtpSocket = net.Socket | tls.TLSSocket;

type SmtpResponse = {
  code: number;
  lines: string[];
};


function cleanString(value: FormDataEntryValue | null, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\0/g, "").trim().slice(0, maxLength);
}

function cleanContextValue(value: unknown, maxLength = 500) {
  return typeof value === "string"
    ? value.replace(/[\r\n\0]+/g, " ").trim().slice(0, maxLength)
    : "";
}

function cleanBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function cleanNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isContactCategory(value: string): value is ContactCategory {
  return Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value);
}

function safeFileName(value: string) {
  return value.replace(/[\r\n\0]/g, "").replace(/[\\/]/g, "_").slice(0, 180) || "piece-jointe";
}

function isAllowedAttachment(file: File) {
  const lowerName = file.name.toLowerCase();
  return [".png", ".jpg", ".jpeg", ".webp", ".pdf", ".txt", ".log", ".json", ".csv"].some(
    (extension) => lowerName.endsWith(extension),
  );
}

function parseJsonObject<T extends object>(value: FormDataEntryValue | null, maxLength: number): T | null {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as T;
  } catch {
    return null;
  }
}


function technicalContextLines(context: TechnicalContext | null) {
  if (!context) return [] as string[];
  const rows = [
    ["Page du menu", cleanContextValue(context.page)],
    ["Formule", cleanContextValue(context.accountPlan)],
    ["Mode utilisateur", cleanContextValue(context.userMode)],
    ["Navigateur", cleanContextValue(context.browser, 1000)],
    ["Langue", cleanContextValue(context.language)],
    ["Fenêtre", cleanContextValue(context.viewport)],
    ["Fuseau horaire", cleanContextValue(context.timeZone)],
  ].filter(([, value]) => Boolean(value));

  if (!rows.length) return [] as string[];
  return ["", "Contexte technique général :", ...rows.map(([label, value]) => `- ${label} : ${value}`)];
}

function projectContextLines(context: ProjectContext | null) {
  if (!context) return [] as string[];

  const rows: Array<[string, string | number | boolean | null]> = [
    ["Nom", cleanContextValue(context.name, 200)],
    ["Identifiant", cleanContextValue(context.id, 200)],
    ["État", cleanContextValue(context.status, 200)],
    ["Configuration terminée", cleanBoolean(context.setupComplete)],
    ["Étape de configuration", cleanNumber(context.setupStep)],
    ["Création", cleanContextValue(context.createdAt)],
    ["Dernière modification", cleanContextValue(context.updatedAt)],
    ["Dernière sauvegarde", cleanContextValue(context.lastSavedAt)],
    ["Suppression / corbeille", cleanContextValue(context.deletedAt)],
    ["Modifications en attente", cleanNumber(context.pendingChanges)],
    ["Contenu chargé sur cet écran", cleanBoolean(context.contentLoaded)],
    ["Fond", cleanContextValue(context.basemapLabel, 200)],
    ["Identifiant du fond", cleanContextValue(context.basemapId, 200)],
    ["Zone de travail présente", cleanBoolean(context.hasWorkspace)],
    ["Objets DroMap", cleanNumber(context.featureCount)],
    ["Calques DroMap", cleanNumber(context.drawingLayerCount)],
    ["Calques GeoJSON", cleanNumber(context.geoJsonLayerCount)],
    ["Marqueurs personnalisés", cleanNumber(context.customMarkerCount)],
    ["Fichier importé", cleanContextValue(context.importedFileName, 300)],
    ["Révision distante", cleanContextValue(context.remoteRevision, 200)],
    ["Dernière mise à jour distante", cleanContextValue(context.remoteUpdatedAt)],
  ];

  const formatted = rows.flatMap(([label, value]) => {
    if (value === null || value === "") return [];
    if (typeof value === "boolean") return [`- ${label} : ${value ? "Oui" : "Non"}`];
    return [`- ${label} : ${value}`];
  });

  if (!formatted.length) return [] as string[];
  return [
    "",
    "Projet DroMap choisi par l’utilisateur :",
    ...formatted,
    "- Confidentialité : aucun objet, aucune géométrie et aucune coordonnée de la carte ne sont inclus automatiquement.",
  ];
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function htmlText(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function formatEmailDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Paris",
    }).format(date);
  } catch {
    return value;
  }
}

function projectContextHtmlRows(context: ProjectContext | null) {
  if (!context) return [] as Array<[string, string]>;

  const rows: Array<[string, string | number | boolean | null]> = [
    ["Nom", cleanContextValue(context.name, 200)],
    ["Identifiant", cleanContextValue(context.id, 200)],
    ["État", cleanContextValue(context.status, 200)],
    ["Configuration terminée", cleanBoolean(context.setupComplete)],
    ["Étape de configuration", cleanNumber(context.setupStep)],
    ["Création", formatEmailDate(cleanContextValue(context.createdAt))],
    ["Dernière modification", formatEmailDate(cleanContextValue(context.updatedAt))],
    ["Dernière sauvegarde", formatEmailDate(cleanContextValue(context.lastSavedAt))],
    ["Suppression / corbeille", formatEmailDate(cleanContextValue(context.deletedAt))],
    ["Modifications en attente", cleanNumber(context.pendingChanges)],
    ["Contenu chargé", cleanBoolean(context.contentLoaded)],
    ["Fond", cleanContextValue(context.basemapLabel, 200)],
    ["Zone de travail", cleanBoolean(context.hasWorkspace)],
    ["Objets DroMap", cleanNumber(context.featureCount)],
    ["Calques DroMap", cleanNumber(context.drawingLayerCount)],
    ["Calques GeoJSON", cleanNumber(context.geoJsonLayerCount)],
    ["Marqueurs personnalisés", cleanNumber(context.customMarkerCount)],
    ["Fichier importé", cleanContextValue(context.importedFileName, 300)],
    ["Révision distante", cleanContextValue(context.remoteRevision, 200)],
    ["Mise à jour distante", formatEmailDate(cleanContextValue(context.remoteUpdatedAt))],
  ];

  return rows.flatMap(([label, value]) => {
    if (value === null || value === "") return [];
    if (typeof value === "boolean") return [[label, value ? "Oui" : "Non"] as [string, string]];
    return [[label, String(value)] as [string, string]];
  });
}

function technicalContextHtmlRows(context: TechnicalContext | null) {
  if (!context) return [] as Array<[string, string]>;
  return [
    ["Page du menu", cleanContextValue(context.page)],
    ["Formule", cleanContextValue(context.accountPlan)],
    ["Mode utilisateur", cleanContextValue(context.userMode)],
    ["Navigateur", cleanContextValue(context.browser, 1000)],
    ["Langue", cleanContextValue(context.language)],
    ["Fenêtre", cleanContextValue(context.viewport)],
    ["Fuseau horaire", cleanContextValue(context.timeZone)],
  ].filter((row): row is [string, string] => Boolean(row[1]));
}

function renderInfoRows(rows: Array<[string, string]>) {
  return rows
    .map(
      ([label, value], index) => `
        <tr>
          <td style="padding:${index === 0 ? "0" : "12px"} 0 12px;color:#64748b;font-size:13px;line-height:1.45;width:190px;vertical-align:top;border-bottom:1px solid #eef2f7;">${escapeHtml(label)}</td>
          <td style="padding:${index === 0 ? "0" : "12px"} 0 12px 18px;color:#0f172a;font-size:13px;line-height:1.45;font-weight:600;vertical-align:top;border-bottom:1px solid #eef2f7;word-break:break-word;">${escapeHtml(value)}</td>
        </tr>`,
    )
    .join("");
}

function buildContactHtml({
  category,
  categoryLabel,
  subject,
  senderName,
  replyEmail,
  accountId,
  message,
  projectContext,
  technicalContext,
  attachments,
}: {
  category: ContactCategory;
  categoryLabel: string;
  subject: string;
  senderName: string;
  replyEmail: string;
  accountId: string;
  message: string;
  projectContext: ProjectContext | null;
  technicalContext: TechnicalContext | null;
  attachments: Array<{ filename: string }>;
}) {
  const style = CATEGORY_STYLES[category];
  const projectRows = projectContextHtmlRows(projectContext);
  const technicalRows = technicalContextHtmlRows(technicalContext);
  const projectName = cleanContextValue(projectContext?.name, 200);
  const now = new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date());

  const projectSection = projectRows.length
    ? `
      <tr><td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:20px 22px 6px;">
            <div style="font-size:12px;line-height:1.4;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#2563eb;">Projet concerné</div>
            <div style="margin-top:5px;font-size:18px;line-height:1.35;font-weight:800;color:#0f172a;">${escapeHtml(projectName || "Projet DroMap")}</div>
          </td></tr>
          <tr><td style="padding:10px 22px 16px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${renderInfoRows(projectRows)}</table>
          </td></tr>
          <tr><td style="padding:12px 22px 18px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.55;">
            Aucun objet, aucune géométrie et aucune coordonnée de la carte n’ont été joints automatiquement.
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const technicalSection = technicalRows.length
    ? `
      <tr><td style="padding:0 32px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
          <tr><td style="padding:18px 22px 8px;font-size:14px;font-weight:800;color:#334155;">Informations techniques</td></tr>
          <tr><td style="padding:4px 22px 14px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${renderInfoRows(technicalRows)}</table>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const attachmentsSection = attachments.length
    ? `
      <tr><td style="padding:0 32px 24px;">
        <div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:10px;">Pièces jointes</div>
        <div>${attachments
          .map(
            ({ filename }) => `<span style="display:inline-block;margin:0 7px 7px 0;padding:7px 10px;border-radius:999px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:700;">📎 ${escapeHtml(filename)}</span>`,
          )
          .join("")}</div>
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(categoryLabel)} — ${escapeHtml(subject)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#eef2f7;">
    <tr><td align="center" style="padding:34px 14px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;border-collapse:separate;border-spacing:0;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 12px 35px rgba(15,23,42,.10);">
        <tr>
          <td style="padding:28px 32px;background:#0f172a;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle;">
                  <div style="font-size:25px;line-height:1;font-weight:900;letter-spacing:-.04em;color:#ffffff;">DroMap</div>
                  <div style="margin-top:7px;font-size:12px;line-height:1.4;color:#94a3b8;">Nouvelle demande depuis le formulaire de contact</div>
                </td>
                <td align="right" style="vertical-align:middle;">
                  <span style="display:inline-block;padding:8px 11px;border-radius:999px;background:${style.background};color:${style.color};font-size:12px;line-height:1;font-weight:800;">${escapeHtml(categoryLabel)}</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr><td style="height:5px;background:${style.accent};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr><td style="padding:30px 32px 22px;">
          <div style="font-size:12px;line-height:1.4;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#64748b;">Sujet</div>
          <div style="margin-top:7px;font-size:25px;line-height:1.25;font-weight:850;letter-spacing:-.02em;color:#0f172a;">${escapeHtml(subject)}</div>
        </td></tr>

        <tr><td style="padding:0 32px 24px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:18px 20px;vertical-align:top;">
                <div style="font-size:12px;color:#64748b;font-weight:700;">Envoyé par</div>
                <div style="margin-top:4px;font-size:16px;color:#0f172a;font-weight:800;">${escapeHtml(senderName)}</div>
                <div style="margin-top:3px;font-size:13px;color:#2563eb;font-weight:600;word-break:break-word;">${escapeHtml(replyEmail)}</div>
              </td>
              <td style="padding:18px 20px;vertical-align:top;border-left:1px solid #e2e8f0;">
                <div style="font-size:12px;color:#64748b;font-weight:700;">Compte DroMap</div>
                <div style="margin-top:4px;font-size:13px;color:#334155;font-weight:700;word-break:break-word;">${escapeHtml(accountId)}</div>
                <div style="margin-top:6px;font-size:11px;color:#94a3b8;">${escapeHtml(now)}</div>
              </td>
            </tr>
          </table>
        </td></tr>

        <tr><td style="padding:0 32px 24px;">
          <div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:10px;">Message</div>
          <div style="padding:20px 22px;background:#ffffff;border:1px solid #dbe4ee;border-left:4px solid ${style.accent};border-radius:12px;color:#1e293b;font-size:15px;line-height:1.7;word-break:break-word;">${htmlText(message)}</div>
        </td></tr>

        ${projectSection}
        ${technicalSection}
        ${attachmentsSection}

        <tr><td style="padding:0 32px 30px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;background:#eff6ff;border-radius:12px;">
            <tr><td style="padding:16px 18px;color:#1e40af;font-size:13px;line-height:1.6;">
              <strong>Pour répondre :</strong> utilise simplement le bouton <strong>Répondre</strong> de ta messagerie. La réponse sera adressée directement à ${escapeHtml(replyEmail)}.
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;line-height:1.6;text-align:center;">
          Message généré automatiquement par le formulaire Contact de DroMap · dromap.fr
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function wrapBase64(value: Buffer | string) {
  const encoded = Buffer.isBuffer(value)
    ? value.toString("base64")
    : Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") || "";
}

function encodeHeader(value: string) {
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function encodeRfc5987(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function buildMimeMessage({
  replyTo,
  subject,
  text,
  html,
  attachments,
}: {
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  attachments: Array<{ filename: string; contentType: string; content: Buffer }>;
}) {
  const mixedBoundary = `----=_DroMap_Mixed_${randomUUID().replace(/-/g, "")}`;
  const alternativeBoundary = `----=_DroMap_Alt_${randomUUID().replace(/-/g, "")}`;
  const messageId = `<${randomUUID()}@dromap.fr>`;
  const lines = [
    `From: DroMap <${CONTACT_FROM}>`,
    `To: ${CONTACT_TO}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
    "",
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(text),
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    `--${alternativeBoundary}--`,
  ];

  for (const attachment of attachments) {
    const asciiFallback = attachment.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
    lines.push(
      `--${mixedBoundary}`,
      `Content-Type: ${attachment.contentType || "application/octet-stream"}`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeRfc5987(attachment.filename)}`,
      "",
      wrapBase64(attachment.content),
    );
  }

  lines.push(`--${mixedBoundary}--`, "");
  return lines.join("\r\n");
}

class SmtpResponseReader {
  private buffer = "";
  private lines: string[] = [];
  private waiters: Array<{ resolve: (line: string) => void; reject: (error: Error) => void }> = [];
  private readonly socket: SmtpSocket;

  constructor(socket: SmtpSocket) {
    this.socket = socket;
    socket.on("data", this.onData);
    socket.on("error", this.onError);
    socket.on("close", this.onClose);
  }

  detach() {
    this.socket.off("data", this.onData);
    this.socket.off("error", this.onError);
    this.socket.off("close", this.onClose);
  }

  private onData = (chunk: Buffer) => {
    this.buffer += chunk.toString("utf8");
    let end = this.buffer.indexOf("\r\n");
    while (end !== -1) {
      const line = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const waiter = this.waiters.shift();
      if (waiter) waiter.resolve(line);
      else this.lines.push(line);
      end = this.buffer.indexOf("\r\n");
    }
  };

  private onError = (error: Error) => {
    this.rejectAll(error);
  };

  private onClose = () => {
    this.rejectAll(new Error("Connexion SMTP fermée prématurément."));
  };

  private rejectAll(error: Error) {
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) waiter.reject(error);
  }

  private readLine() {
    const line = this.lines.shift();
    if (line !== undefined) return Promise.resolve(line);
    return new Promise<string>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  async readResponse(): Promise<SmtpResponse> {
    const first = await this.readLine();
    const match = /^(\d{3})([ -])(.*)$/.exec(first);
    if (!match) throw new Error(`Réponse SMTP invalide : ${first.slice(0, 160)}`);

    const code = Number(match[1]);
    const lines = [first];
    if (match[2] === "-") {
      while (true) {
        const line = await this.readLine();
        lines.push(line);
        if (line.startsWith(`${code} `)) break;
      }
    }
    return { code, lines };
  }
}

function assertSmtpCode(response: SmtpResponse, expected: number | number[], step: string) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(response.code)) {
    throw new Error(`SMTP ${step}: réponse ${response.code} (${response.lines.join(" | ").slice(0, 600)})`);
  }
}

function writeLine(socket: SmtpSocket, line: string) {
  return new Promise<void>((resolve, reject) => {
    socket.write(`${line}\r\n`, "utf8", (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function sendCommand(
  socket: SmtpSocket,
  reader: SmtpResponseReader,
  command: string,
  expected: number | number[],
  step: string,
) {
  await writeLine(socket, command);
  const response = await reader.readResponse();
  assertSmtpCode(response, expected, step);
  return response;
}

function connectPlainSocket() {
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect({ host: SMTP_HOST, port: SMTP_PORT });
    const timer = setTimeout(() => {
      socket.destroy(new Error("Délai de connexion SMTP dépassé."));
    }, SMTP_TIMEOUT_MS);

    const onError = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };

    socket.once("error", onError);
    socket.once("connect", () => {
      clearTimeout(timer);
      socket.off("error", onError);
      socket.setTimeout(SMTP_TIMEOUT_MS, () => socket.destroy(new Error("Délai SMTP dépassé.")));
      resolve(socket);
    });
  });
}

function upgradeToTls(socket: net.Socket) {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: SMTP_HOST,
      minVersion: "TLSv1.2",
    });

    const timer = setTimeout(() => {
      secureSocket.destroy(new Error("Délai de négociation TLS dépassé."));
    }, SMTP_TIMEOUT_MS);

    const onError = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };

    secureSocket.once("error", onError);
    secureSocket.once("secureConnect", () => {
      clearTimeout(timer);
      secureSocket.off("error", onError);
      secureSocket.setTimeout(SMTP_TIMEOUT_MS, () => secureSocket.destroy(new Error("Délai SMTP dépassé.")));
      resolve(secureSocket);
    });
  });
}

async function sendViaInfomaniak({
  username,
  password,
  replyTo,
  subject,
  text,
  html,
  attachments,
}: {
  username: string;
  password: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  attachments: Array<{ filename: string; contentType: string; content: Buffer }>;
}) {
  let socket: SmtpSocket | null = null;
  let reader: SmtpResponseReader | null = null;

  try {
    const plainSocket = await connectPlainSocket();
    socket = plainSocket;
    reader = new SmtpResponseReader(plainSocket);

    const greeting = await reader.readResponse();
    assertSmtpCode(greeting, 220, "connexion");
    await sendCommand(plainSocket, reader, "EHLO dromap.fr", 250, "EHLO");
    await sendCommand(plainSocket, reader, "STARTTLS", 220, "STARTTLS");

    reader.detach();
    const secureSocket = await upgradeToTls(plainSocket);
    socket = secureSocket;
    reader = new SmtpResponseReader(secureSocket);

    await sendCommand(secureSocket, reader, "EHLO dromap.fr", 250, "EHLO après TLS");
    await sendCommand(secureSocket, reader, "AUTH LOGIN", 334, "AUTH LOGIN");
    await sendCommand(
      secureSocket,
      reader,
      Buffer.from(username, "utf8").toString("base64"),
      334,
      "identifiant SMTP",
    );
    await sendCommand(
      secureSocket,
      reader,
      Buffer.from(password, "utf8").toString("base64"),
      235,
      "mot de passe SMTP",
    );

    await sendCommand(secureSocket, reader, `MAIL FROM:<${CONTACT_FROM}>`, 250, "MAIL FROM");
    await sendCommand(secureSocket, reader, `RCPT TO:<${CONTACT_TO}>`, [250, 251], "RCPT TO");
    await sendCommand(secureSocket, reader, "DATA", 354, "DATA");

    const mimeMessage = buildMimeMessage({ replyTo, subject, text, html, attachments });
    const dotStuffed = mimeMessage
      .split("\r\n")
      .map((line) => (line.startsWith(".") ? `.${line}` : line))
      .join("\r\n");

    await new Promise<void>((resolve, reject) => {
      secureSocket.write(`${dotStuffed}\r\n.\r\n`, "utf8", (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
    const dataResponse = await reader.readResponse();
    assertSmtpCode(dataResponse, 250, "envoi du message");

    try {
      await sendCommand(secureSocket, reader, "QUIT", 221, "QUIT");
    } catch {
      // Le message a déjà été accepté : un échec de QUIT ne doit pas être traité comme un échec d'envoi.
    }
  } finally {
    reader?.detach();
    socket?.destroy();
  }
}

async function handlePOST(request: Request) {
  const networkLimit = await checkAbuseLimit(request, "contact");
  if (networkLimit) return networkLimit;
  const smtpUser = process.env.DROMAP_SMTP_USER?.trim();
  const smtpPassword = process.env.DROMAP_SMTP_PASSWORD?.trim();

  if (!smtpUser || !smtpPassword) {
    return NextResponse.json(
      {
        error:
          "Le formulaire de contact n’est pas encore configuré sur ce serveur. Réessaie plus tard ou écris directement à contact@dromap.fr.",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Le formulaire envoyé est invalide." }, { status: 400 });
  }

  // Champ invisible anti-robots : un bot qui le remplit reçoit un faux succès.
  if (cleanString(formData.get("website"), 200)) {
    return NextResponse.json({ ok: true });
  }

  const auth = await getAuthenticatedRequestUser().catch(() => null);

  const category = cleanString(formData.get("category"), 40);
  const subject = cleanString(formData.get("subject"), 140);
  const message = cleanString(formData.get("message"), 10000);
  const submittedName = cleanString(formData.get("name"), 120);
  const submittedEmail = cleanString(formData.get("email"), 254).toLowerCase();
  const technicalContext = parseJsonObject<TechnicalContext>(formData.get("technicalContext"), 5000);
  const projectContext = parseJsonObject<ProjectContext>(formData.get("projectContext"), 8000);

  if (!isContactCategory(category)) {
    return NextResponse.json({ error: "Choisis la nature de ta demande." }, { status: 400 });
  }
  if (subject.length < 3) {
    return NextResponse.json({ error: "Le sujet est trop court." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ error: "Décris un peu plus ta demande avant de l’envoyer." }, { status: 400 });
  }

  const authenticatedEmail = auth?.user.email?.trim().toLowerCase() || "";
  const replyEmail = authenticatedEmail || submittedEmail;
  if (!isValidEmail(replyEmail)) {
    return NextResponse.json({ error: "Indique une adresse e-mail valide pour recevoir une réponse." }, { status: 400 });
  }
  const identityLimit = await checkAbuseLimit(request, "contact", auth?.user.id ?? replyEmail);
  if (identityLimit) return identityLimit;

  const authenticatedName =
    typeof auth?.user.user_metadata?.display_name === "string"
      ? auth.user.user_metadata.display_name.trim().slice(0, 120)
      : "";
  const senderName = authenticatedName || submittedName || "Utilisateur DroMap";

  const attachmentEntries = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0);

  if (attachmentEntries.length > MAX_ATTACHMENT_COUNT) {
    return NextResponse.json(
      { error: `Tu peux joindre au maximum ${MAX_ATTACHMENT_COUNT} fichiers.` },
      { status: 400 },
    );
  }

  let totalAttachmentBytes = 0;
  for (const file of attachmentEntries) {
    totalAttachmentBytes += file.size;
    if (!isAllowedAttachment(file)) {
      return NextResponse.json(
        { error: `Le format du fichier « ${safeFileName(file.name)} » n’est pas autorisé.` },
        { status: 400 },
      );
    }
  }
  if (totalAttachmentBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return NextResponse.json(
      { error: "Les pièces jointes ne doivent pas dépasser 3 Mo au total." },
      { status: 413 },
    );
  }

  const attachments: Array<{ filename: string; contentType: string; content: Buffer }> = [];
  try {
    for (const file of attachmentEntries) {
      attachments.push({ filename: safeFileName(file.name), ...await validateContactAttachment(file) });
    }
  } catch {
    return NextResponse.json({ error: "Une pièce jointe est invalide ou ne correspond pas à son extension." }, { status: 400 });
  }

  const categoryLabel = CATEGORY_LABELS[category];
  const accountId = auth?.user.id || "Non connecté";
  const selectedProjectName = cleanContextValue(projectContext?.name, 80);
  const mailSubject = selectedProjectName
    ? `[DroMap · ${categoryLabel} · ${selectedProjectName}] ${subject}`
    : `[DroMap · ${categoryLabel}] ${subject}`;
  const text = [
    "Nouvelle demande envoyée depuis DroMap",
    "",
    `Nature : ${categoryLabel}`,
    `Sujet : ${subject}`,
    `Nom : ${senderName}`,
    `E-mail de réponse : ${replyEmail}`,
    `Compte DroMap : ${accountId}`,
    "",
    "Message :",
    message,
    ...projectContextLines(projectContext),
    ...technicalContextLines(technicalContext),
    ...(attachments.length
      ? ["", `Pièces jointes : ${attachments.map((item) => item.filename).join(", ")}`]
      : []),
  ].join("\n");

  const html = buildContactHtml({
    category,
    categoryLabel,
    subject,
    senderName,
    replyEmail,
    accountId,
    message,
    projectContext,
    technicalContext,
    attachments,
  });

  try {
    await sendViaInfomaniak({
      username: smtpUser,
      password: smtpPassword,
      replyTo: replyEmail,
      subject: mailSubject,
      text,
      html,
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DroMap contact: erreur SMTP Infomaniak", error);
    return NextResponse.json(
      { error: "Le service de contact est momentanément indisponible. Réessaie dans quelques minutes." },
      { status: 503 },
    );
  }
}

export const POST = withRequestSecurity(handlePOST);
