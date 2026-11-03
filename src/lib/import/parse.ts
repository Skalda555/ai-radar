/**
 * CSV and JSON parsing for channel import. No network, no database writes.
 * Limits: 1 MB and 1 000 records (spec chapter 5).
 */

export const MAX_IMPORT_BYTES = 1_048_576;
export const MAX_IMPORT_RECORDS = 1000;

export type RawImportRecord = {
  channel_id?: string;
  handle?: string;
  url?: string;
  name?: string;
  category?: string;
  priority?: string;
  language?: string;
  description?: string;
  relevance_score?: string;
};

export type ParseResult =
  | { ok: true; records: RawImportRecord[]; format: "csv" | "json"; delimiter?: "," | ";" }
  | { ok: false; error: string };

const FIELD_ALIASES: Record<keyof RawImportRecord, string[]> = {
  channel_id: ["channel_id", "channelid", "channel", "id", "youtube_channel_id", "channel_id_youtube"],
  handle: ["handle", "youtube_handle", "user", "username"],
  url: ["url", "channel_url", "link", "adresa"],
  name: ["name", "title", "nazev", "jmeno", "nazev_kanalu"],
  category: ["category", "kategorie", "tema"],
  priority: ["priority", "priorita", "priorita_1_5"],
  language: ["language", "jazyk", "lang"],
  description: ["description", "popis", "anotace"],
  relevance_score: ["relevance_score", "relevance", "skore", "score", "relevancescore"],
};

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function mapHeaders(headers: string[]): Map<number, keyof RawImportRecord> {
  const map = new Map<number, keyof RawImportRecord>();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    for (const [field, aliases] of Object.entries(FIELD_ALIASES) as [
      keyof RawImportRecord,
      string[],
    ][]) {
      if (aliases.includes(normalized) || aliases.includes(normalized.replace(/^@/, ""))) {
        map.set(index, field);
        return;
      }
    }
  });
  return map;
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function parseImportFile(filename: string, content: string): ParseResult {
  if (typeof content !== "string" || content.trim().length === 0) {
    return { ok: false, error: "Soubor je prázdný." };
  }
  if (Buffer.byteLength(content, "utf8") > MAX_IMPORT_BYTES) {
    return { ok: false, error: "Soubor je větší než 1 MB. Import je omezen na 1 MB." };
  }

  const text = stripBom(content);
  const looksJson = filename.toLowerCase().endsWith(".json") || /^[[{]/.test(text.trim());

  const result = looksJson ? parseJson(text) : parseCsv(text);
  if (!result.ok) return result;
  if (result.records.length === 0) {
    return { ok: false, error: "Soubor neobsahuje žádné záznamy." };
  }
  if (result.records.length > MAX_IMPORT_RECORDS) {
    return {
      ok: false,
      error: `Soubor obsahuje ${result.records.length} záznamů. Limit je ${MAX_IMPORT_RECORDS}.`,
    };
  }
  return result;
}

function parseJson(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `JSON se nepodařilo přečíst: ${error instanceof Error ? error.message : "chyba"}` };
  }

  let list: unknown[];
  if (Array.isArray(parsed)) {
    list = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as { channels?: unknown }).channels)) {
    list = (parsed as { channels: unknown[] }).channels;
  } else {
    return { ok: false, error: "JSON musí být pole objektů nebo objekt s polem „channels“." };
  }

  const records: RawImportRecord[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      records.push({});
      continue;
    }
    const record: RawImportRecord = {};
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      const normalized = normalizeHeader(key);
      let field: keyof RawImportRecord | null = null;
      for (const [candidate, aliases] of Object.entries(FIELD_ALIASES) as [
        keyof RawImportRecord,
        string[],
      ][]) {
        if (aliases.includes(normalized) || aliases.includes(normalized.replace(/^@/, ""))) {
          field = candidate;
          break;
        }
      }
      if (!field) continue;
      if (value === null || value === undefined) continue;
      record[field] = String(value);
    }
    records.push(record);
  }

  return { ok: true, records, format: "json" };
}

/** RFC4180-ish row splitter that understands quotes and CRLF. */
function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === delimiter) {
      row.push(field);
      field = "";
      continue;
    }
    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (char === "\r") continue;
    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim().length > 0));
}

function countOutsideQuotes(line: string, character: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === character) count += 1;
  }
  return count;
}

function sniffDelimiter(text: string): "," | ";" {
  const headerLine = text.split(/\r?\n/, 1)[0] ?? "";
  const commas = countOutsideQuotes(headerLine, ",");
  const semicolons = countOutsideQuotes(headerLine, ";");
  return semicolons > commas ? ";" : ",";
}

function parseCsv(text: string): ParseResult {
  const delimiter = sniffDelimiter(text);
  const rows = splitRows(text, delimiter);
  if (rows.length === 0) return { ok: false, error: "CSV neobsahuje žádná data." };

  const headerRow = rows[0];
  const columnMap = mapHeaders(headerRow);
  if (columnMap.size === 0) {
    return {
      ok: false,
      error:
        "Hlavička CSV neobsahuje rozpoznatelné sloupce (channel_id, handle, url, name, category, priority, language, description, relevance_score).",
    };
  }

  const records: RawImportRecord[] = [];
  for (const cells of rows.slice(1)) {
    const record: RawImportRecord = {};
    for (const [index, field] of columnMap.entries()) {
      const value = (cells[index] ?? "").trim();
      if (value.length > 0) record[field] = value;
    }
    records.push(record);
  }

  return { ok: true, records, format: "csv", delimiter };
}
