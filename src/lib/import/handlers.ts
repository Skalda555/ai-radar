import type { Db } from "../db/client";
import { getDb } from "../db/client";
import { parseImportFile, MAX_IMPORT_BYTES } from "./parse";
import { buildPreview, resolveHandles, summarize, type ImportPreviewRow } from "./preview";
import { commitImport } from "./commit";
import { errorResponse, guardMutation, jsonResponse, readJsonBody } from "../api/guard";

type Body = {
  filename?: unknown;
  content?: unknown;
  limit?: unknown;
  rows?: unknown;
};

function readFileInput(body: Body | null): { filename: string; content: string } | null {
  if (!body) return null;
  const filename = typeof body.filename === "string" ? body.filename.slice(0, 200) : "import.csv";
  const content = typeof body.content === "string" ? body.content : "";
  if (!content) return null;
  if (Buffer.byteLength(content, "utf8") > MAX_IMPORT_BYTES) return null;
  return { filename, content };
}

function guarded(request: Request): Response | null {
  const guard = guardMutation(request);
  if (!guard.ok) return errorResponse(guard.message, guard.status, "FORBIDDEN");
  return null;
}

export async function handlePreview(request: Request): Promise<Response> {
  const blocked = guarded(request);
  if (blocked) return blocked;

  const body = await readJsonBody<Body>(request);
  const input = readFileInput(body);
  if (!input) return errorResponse("Chybí obsah souboru nebo je větší než 1 MB.", 400, "BAD_INPUT");

  const parsed = parseImportFile(input.filename, input.content);
  if (!parsed.ok) return errorResponse(parsed.error, 400, "PARSE_ERROR");

  const db: Db = getDb();
  const rows = buildPreview(db, parsed.records);
  return jsonResponse({
    ok: true,
    format: parsed.format,
    delimiter: parsed.delimiter ?? null,
    rows,
    summary: summarize(rows),
  });
}

export async function handleResolve(request: Request): Promise<Response> {
  const blocked = guarded(request);
  if (blocked) return blocked;

  const body = await readJsonBody<Body>(request);
  const input = readFileInput(body);
  if (!input) return errorResponse("Chybí obsah souboru nebo je větší než 1 MB.", 400, "BAD_INPUT");

  const parsed = parseImportFile(input.filename, input.content);
  if (!parsed.ok) return errorResponse(parsed.error, 400, "PARSE_ERROR");

  const limit = typeof body?.limit === "number" ? body.limit : 10;
  const db = getDb();
  const rows = buildPreview(db, parsed.records);
  const resolved = await resolveHandles(db, rows, { limit });

  return jsonResponse({
    ok: true,
    rows: resolved.rows,
    summary: summarize(resolved.rows),
    resolved: resolved.resolved,
    remaining: resolved.remaining,
    errors: resolved.errors,
  });
}

export async function handleCommit(request: Request): Promise<Response> {
  const blocked = guarded(request);
  if (blocked) return blocked;

  const body = await readJsonBody<Body>(request);
  if (!Array.isArray(body?.rows)) {
    return errorResponse("Očekávám JSON { rows: [...] } z náhledu.", 400, "BAD_INPUT");
  }
  if (body.rows.length > 1000) {
    return errorResponse("Maximálně 1 000 záznamů na import.", 400, "TOO_MANY");
  }

  const rows: ImportPreviewRow[] = [];
  for (const raw of body.rows) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    rows.push({
      line: typeof row.line === "number" ? row.line : 0,
      input: typeof row.input === "string" ? row.input.slice(0, 500) : "",
      channelId: typeof row.channelId === "string" ? row.channelId : null,
      handle: typeof row.handle === "string" ? row.handle : null,
      url: typeof row.url === "string" ? row.url.slice(0, 500) : null,
      name: typeof row.name === "string" ? row.name.slice(0, 200) : null,
      category: typeof row.category === "string" ? row.category.slice(0, 80) : null,
      priority: typeof row.priority === "number" ? row.priority : 3,
      language: typeof row.language === "string" ? row.language.slice(0, 12) : null,
      description: typeof row.description === "string" ? row.description.slice(0, 2000) : null,
      relevanceScore: typeof row.relevanceScore === "number" ? row.relevanceScore : null,
      status: (typeof row.status === "string" ? row.status : "INVALID") as ImportPreviewRow["status"],
      reason: typeof row.reason === "string" ? row.reason.slice(0, 400) : null,
    });
  }

  const result = commitImport(getDb(), rows);
  if (!result.ok) return errorResponse(result.error ?? "Import selhal.", 500, "COMMIT_FAILED");

  return jsonResponse({
    ok: true,
    inserted: result.inserted,
    skipped: result.skipped,
    invalid: result.invalid,
  });
}
