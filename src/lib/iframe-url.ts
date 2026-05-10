/**
 * Validation and normalization of iFrame embed URLs.
 *
 * Goal: when a user pastes a regular link to a Google Slides / Google Docs /
 * PowerPoint Online / SharePoint document, automatically rewrite it into the
 * canonical "embed" URL so the player always renders correctly in remote /
 * fullscreen mode (no editor chrome, no auth wall, autoplay friendly).
 */

export type EmbedSource =
  | "google_slides"
  | "google_docs"
  | "google_sheets"
  | "google_drive_file"
  | "powerpoint_online"
  | "sharepoint"
  | "office_viewer"
  | "youtube"
  | "vimeo"
  | "generic";

export interface NormalizeResult {
  url: string;
  source: EmbedSource;
  changed: boolean;
  /** Optional human-readable note (e.g. "Lien Google Slides converti en embed"). */
  note?: string;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** Strict URL syntax + protocol check (https only, http allowed for localhost). */
export function validateEmbedUrl(input: string): ValidationResult {
  const raw = (input || "").trim();
  if (!raw) return { valid: false, reason: "URL vide" };
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { valid: false, reason: "URL invalide (doit commencer par https://)" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { valid: false, reason: "Seuls les protocoles http(s) sont supportés" };
  }
  if (parsed.protocol === "http:" && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(parsed.hostname)) {
    return { valid: false, reason: "Utilisez https:// pour les URLs distantes" };
  }
  return { valid: true };
}

function getGoogleId(pathname: string, kind: "presentation" | "document" | "spreadsheets" | "file"): string | null {
  const re = new RegExp(`/${kind}/d/([a-zA-Z0-9_-]+)`);
  const m = pathname.match(re);
  return m ? m[1] : null;
}

/**
 * Normalize a pasted URL into the best embed form for fullscreen player playback.
 * Always returns a usable URL (falls back to the original if no rule matches).
 */
export function normalizeEmbedUrl(input: string): NormalizeResult {
  const raw = (input || "").trim();
  const validation = validateEmbedUrl(raw);
  if (!validation.valid) {
    return { url: raw, source: "generic", changed: false, note: validation.reason };
  }

  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  // ===== Google Slides =====
  if (host === "docs.google.com" && path.includes("/presentation/")) {
    const id = getGoogleId(path, "presentation");
    if (id) {
      // Published links (/pub) keep their format but enforce embed=true & autoplay
      if (/\/pub\b/.test(path)) {
        url.searchParams.set("start", "true");
        url.searchParams.set("loop", "true");
        if (!url.searchParams.has("delayms")) url.searchParams.set("delayms", "5000");
        const next = url.toString();
        return { url: next, source: "google_slides", changed: next !== raw, note: "Présentation Google publiée — autoplay activé." };
      }
      const embed = `https://docs.google.com/presentation/d/${id}/embed?start=true&loop=true&delayms=5000`;
      return {
        url: embed,
        source: "google_slides",
        changed: embed !== raw,
        note: "Lien Google Slides converti en URL d'embed plein écran (autoplay 5s/slide).",
      };
    }
  }

  // ===== Google Docs =====
  if (host === "docs.google.com" && path.includes("/document/")) {
    const id = getGoogleId(path, "document");
    if (id) {
      const next = `https://docs.google.com/document/d/${id}/preview`;
      return { url: next, source: "google_docs", changed: next !== raw, note: "Lien Google Docs converti en aperçu sans barre d'édition." };
    }
  }

  // ===== Google Sheets =====
  if (host === "docs.google.com" && path.includes("/spreadsheets/")) {
    const id = getGoogleId(path, "spreadsheets");
    if (id) {
      const next = `https://docs.google.com/spreadsheets/d/${id}/preview`;
      return { url: next, source: "google_sheets", changed: next !== raw, note: "Lien Google Sheets converti en aperçu lecture seule." };
    }
  }

  // ===== Google Drive file =====
  if (host === "drive.google.com" && path.includes("/file/")) {
    const id = getGoogleId(path, "file");
    if (id) {
      const next = `https://drive.google.com/file/d/${id}/preview`;
      return { url: next, source: "google_drive_file", changed: next !== raw, note: "Fichier Google Drive converti en aperçu intégrable." };
    }
  }

  // ===== PowerPoint Online (OneDrive personnel + 1drv.ms) =====
  // Forms: https://onedrive.live.com/embed?cid=...&resid=...&authkey=...
  //        https://onedrive.live.com/?cid=...&resid=...
  if (host === "onedrive.live.com" || host === "1drv.ms") {
    if (path === "/" || path === "") {
      url.pathname = "/embed";
    }
    // Force action=embedview for the document viewer
    if (!url.searchParams.has("em")) url.searchParams.set("em", "2");
    const next = url.toString();
    return { url: next, source: "powerpoint_online", changed: next !== raw, note: "Lien OneDrive converti en vue intégrable." };
  }

  // ===== SharePoint / Office 365 (entreprise) =====
  // Forms: https://{tenant}.sharepoint.com/:p:/g/personal/.../E....pptx
  if (/\.sharepoint\.com$/.test(host)) {
    if (!url.searchParams.has("action")) {
      url.searchParams.set("action", "embedview");
      const next = url.toString();
      return { url: next, source: "sharepoint", changed: true, note: "Lien SharePoint converti en mode embedview." };
    }
    return { url: raw, source: "sharepoint", changed: false };
  }

  // ===== Office Web Viewer (fallback pour .pptx publics) =====
  if (host === "view.officeapps.live.com") {
    return { url: raw, source: "office_viewer", changed: false };
  }
  // Wrap public .pptx / .ppt / .docx / .xlsx links with the Office viewer
  if (/\.(pptx?|docx?|xlsx?)(\?|$)/i.test(raw)) {
    const next = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(raw)}`;
    return {
      url: next,
      source: "office_viewer",
      changed: true,
      note: "Fichier Office encapsulé dans l'Office Web Viewer pour affichage distant.",
    };
  }

  // ===== YouTube =====
  if (host === "youtu.be") {
    const id = path.replace(/^\//, "").split("/")[0];
    if (id) {
      const next = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0`;
      return { url: next, source: "youtube", changed: true, note: "Lien YouTube converti en embed autoplay." };
    }
  }
  if ((host === "www.youtube.com" || host === "youtube.com") && path === "/watch") {
    const id = url.searchParams.get("v");
    if (id) {
      const next = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0`;
      return { url: next, source: "youtube", changed: true, note: "Lien YouTube converti en embed autoplay." };
    }
  }

  // ===== Vimeo =====
  if (host === "vimeo.com") {
    const id = path.replace(/^\//, "").split("/")[0];
    if (/^\d+$/.test(id)) {
      const next = `https://player.vimeo.com/video/${id}?autoplay=1&muted=1&loop=1&background=1`;
      return { url: next, source: "vimeo", changed: true, note: "Lien Vimeo converti en player autoplay." };
    }
  }

  return { url: raw, source: "generic", changed: false };
}

/** Convenience helper: normalize and return only the URL string. */
export function toEmbedUrl(input: string): string {
  return normalizeEmbedUrl(input).url;
}
