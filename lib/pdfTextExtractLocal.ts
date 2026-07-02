/**
 * Phase 8H — extraction texte PDF locale (sans API payante).
 */
export function extractPdfTextLocal(buffer: Buffer): string {
  const raw = buffer.toString("latin1");
  const parts: string[] = [];

  const parenPattern = /\((?:\\.|[^\\)])*\)\s*(?:Tj|TJ|'|")/g;
  let match: RegExpExecArray | null;
  while ((match = parenPattern.exec(raw)) !== null) {
    const inner = match[0].replace(/\)\s*(?:Tj|TJ|'|")$/, "").slice(1);
    const decoded = decodePdfString(inner);
    if (decoded.trim()) parts.push(decoded);
  }

  if (parts.length === 0) {
    const streamPattern = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    while ((match = streamPattern.exec(raw)) !== null) {
      const chunk = match[1] ?? "";
      const printable = chunk.replace(/[^\x20-\x7E\u00C0-\u024F\n\r\t]/g, " ");
      if (printable.trim().length > 20) parts.push(printable);
    }
  }

  return normalizeWhitespace(parts.join("\n"));
}

function decodePdfString(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function extractPlainTextLocal(buffer: Buffer, fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf") || buffer.subarray(0, 4).toString("latin1") === "%PDF") {
    return extractPdfTextLocal(buffer);
  }
  return normalizeWhitespace(buffer.toString("utf8"));
}

export function extractEmailTextLocal(buffer: Buffer): string {
  const raw = buffer.toString("utf8");
  const split = raw.search(/\r?\n\r?\n/);
  const headerBlock = split >= 0 ? raw.slice(0, split) : "";
  const body = split >= 0 ? raw.slice(split).trim() : raw;
  const withoutHtml = body
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ");

  const headerLines: string[] = [];
  for (const line of headerBlock.split(/\r?\n/)) {
    const from = line.match(/^From:\s*(.+)$/i);
    if (from?.[1]) {
      const display = parseEmailDisplayName(from[1]);
      if (display) headerLines.push(`Client: ${display}`);
    }
    const subject = line.match(/^Subject:\s*(.+)$/i);
    if (subject?.[1]?.trim()) {
      headerLines.push(`Objet: ${subject[1].trim()}`);
      const addrInSubject = subject[1].match(
        /(\d{1,5}[^,\n]+(?:,\s*)?[^,\n]+(?:,\s*(?:QC|Québec|Quebec)[^,\n]*)?)/i,
      );
      if (addrInSubject?.[1]) {
        headerLines.push(`Adresse: ${addrInSubject[1].trim()}`);
      }
    }
  }

  return normalizeWhitespace([...headerLines, withoutHtml].join("\n"));
}

function parseEmailDisplayName(fromHeader: string): string {
  const quoted = fromHeader.match(/^"([^"]+)"/);
  if (quoted?.[1]) return quoted[1].trim();
  const angle = fromHeader.match(/^([^<]+)</);
  if (angle?.[1]) return angle[1].trim().replace(/^"|"$/g, "");
  const emailOnly = fromHeader.match(/^[^\s@]+@[^\s@]+$/);
  if (emailOnly) return "";
  return fromHeader.trim().slice(0, 80);
}
