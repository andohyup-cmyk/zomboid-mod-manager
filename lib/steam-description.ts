/**
 * Pure Steam Workshop description cleaner, short-summary extractor, and
 * Steam time_updated parser. Never fabricates compatibility facts.
 */

const MAX_DETAILED_CHARS = 4000;
const MAX_SHORT_CHARS = 140;

/**
 * Strips Steam BBCode markup, image embeds, separator lines, and noisy footer metadata
 * (Workshop ID / Mod ID boilerplate) while keeping readable human description text.
 */
export function cleanSteamDescription(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  let text = raw.replace(/\r\n?/g, "\n");

  // Remove image embeds and YouTube preview tags entirely.
  text = text.replace(/\[img\][\s\S]*?\[\/img\]/gi, "");
  text = text.replace(/\[previewyoutube=[^\]]*\][\s\S]*?\[\/previewyoutube\]/gi, "");

  // Convert [url=...]label[/url] -> label (drop bare URL labels), and list items -> bullet.
  text = text.replace(/\[url=[^\]]*\]([\s\S]*?)\[\/url\]/gi, (_, label: string) => {
    const trimmed = label.trim();
    return /^https?:\/\//i.test(trimmed) ? "" : trimmed;
  });
  text = text.replace(/\[\*\]/g, "• ");

  // Strip remaining Steam BBCode tags ([h1], [b], [i], [u], [list], [quote], [code], [spoiler], [table], etc.).
  text = text.replace(/\[\/?(?:h[1-6]|b|i|u|strike|spoiler|noparse|code|quote|list|olist|table|tr|th|td|hr|url)(?:=[^\]]*)?\]/gi, "");

  // Filter lines: drop pure divider lines and trailing Workshop ID / Mod ID / Map Folder boilerplate.
  const lines = text.split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim());
  const cleanedLines: string[] = [];
  for (const line of lines) {
    if (!line) {
      if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== "") {
        cleanedLines.push("");
      }
      continue;
    }
    if (/^[-_=*~─━═•·]{4,}$/.test(line)) continue;
    if (/^(?:workshop\s*id|mod\s*id|map\s*folder)\s*[:：]/i.test(line)) continue;
    cleanedLines.push(line);
  }

  while (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] === "") {
    cleanedLines.pop();
  }

  return cleanedLines.join("\n").slice(0, MAX_DETAILED_CHARS);
}

/**
 * Extracts a concise 1-2 line summary for mod list cards from a cleaned or raw description.
 */
export function summarizeModDescription(description: string, maxChars = MAX_SHORT_CHARS): string {
  const cleaned = cleanSteamDescription(description);
  if (!cleaned) return "";

  const firstParagraph = cleaned
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, " ").replace(/\s+/g, " ").trim())
    .find((block) => block.length > 0) ?? "";

  if (!firstParagraph) return "";
  if (firstParagraph.length <= maxChars) return firstParagraph;

  // Prefer ending at a natural sentence boundary within maxChars.
  const slice = firstParagraph.slice(0, maxChars);
  const sentenceEnd = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("다. "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (sentenceEnd >= Math.floor(maxChars * 0.45)) {
    return slice.slice(0, sentenceEnd + 1).trim();
  }

  const wordEnd = slice.lastIndexOf(" ");
  const cut = wordEnd >= Math.floor(maxChars * 0.6) ? slice.slice(0, wordEnd) : slice;
  return `${cut.replace(/[,;:\-·\s]+$/, "")}…`;
}

/**
 * Converts Steam's `time_updated` Unix timestamp (seconds) into an ISO-8601 UTC string.
 */
export function extractSteamUpdatedAt(entry: Readonly<Record<string, unknown>>): string | null {
  const raw = entry.time_updated;
  const seconds = typeof raw === "number"
    ? raw
    : typeof raw === "string" && /^\d+$/.test(raw.trim())
      ? Number(raw.trim())
      : NaN;
  if (!Number.isFinite(seconds) || seconds < 946684800 || seconds > 4102444800) {
    return null;
  }
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Formats an ISO timestamp or YYYY-MM-DD date string for concise UI display.
 */
export function formatSteamDate(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== "string") return null;
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Removes trailing "(Workshop 1234567890)" fallback suffixes from mod display titles
 * so Workshop ID is not shown twice in cards.
 */
export function stripWorkshopSuffixFromTitle(title: string): string {
  if (!title || typeof title !== "string") return "";
  const stripped = title.replace(/\s*\(Workshop\s+\d{5,20}\)\s*$/i, "").trim();
  return stripped || title.trim();
}
