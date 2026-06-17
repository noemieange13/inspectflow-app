/**
 * Upload en lot des photos `test-data/inspection-demo/` vers POST /api/upload-photo.
 *
 * Usage (depuis la racine du repo) :
 *   npm run test:inspection-demo              # 10 photos (défaut)
 *   npm run test:inspection-demo -- --limit 5
 *   npm run test:inspection-demo:all          # toutes les photos du dossier
 *   npm run test:inspection-demo -- --create-report
 *   npm run test:inspection-demo -- --dry-run
 *   npm run test:inspection-demo -- --trigger-pdf
 *
 * Variables (.env.local) :
 *   SMOKE_BASE_URL          — ex. https://inspectflow-app.vercel.app
 *   TRIGGER_INSPECTION_SECRET
 *   SMOKE_USER_ID / SMOKE_INSPECTION_ID — requis avec --create-report
 *   DEMO_REPORT_ID          — rapport existant (sinon --create-report)
 *   DEMO_UPLOAD_LIMIT       — défaut 10
 *   DEMO_UPLOAD_DELAY_MS    — pause entre uploads (défaut 400)
 */
import fs from "node:fs";
import path from "node:path";
import { loadEnvLocal, repoRoot } from "./lib/load-env-local.mjs";
import { createClient } from "@supabase/supabase-js";

loadEnvLocal();

const DEMO_DIR = path.join(repoRoot, "test-data", "inspection-demo");
const LOG_PATH = path.join(DEMO_DIR, "run-log.jsonl");
const MANIFEST_PATH = path.join(DEMO_DIR, "photos-manifest.json");
const IMAGE_RE = /\.(jpe?g|png|webp)$/i;

const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim() ?? "";
const FETCH_TIMEOUT_MS = Number(process.env.DEMO_FETCH_TIMEOUT_MS ?? 120_000);
const delayMs = Number(process.env.DEMO_UPLOAD_DELAY_MS ?? 400);

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}

function parseArgs(argv) {
  const opts = {
    limit: Number(process.env.DEMO_UPLOAD_LIMIT ?? 10),
    all: false,
    reportId: process.env.DEMO_REPORT_ID?.trim() ?? "",
    inspectionId: process.env.SMOKE_INSPECTION_ID?.trim() ?? "",
    createReport: process.env.DEMO_CREATE_REPORT === "1",
    dryRun: false,
    triggerPdf: false,
    uploadOnly: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--all") opts.all = true;
    if (a === "--upload-only") opts.uploadOnly = true;
    else if (a === "--limit" && argv[i + 1]) {
      opts.limit = Number(argv[++i]);
      opts.all = false;
    } else if (a === "--report-id" && argv[i + 1]) {
      opts.reportId = String(argv[++i]).trim();
    } else if (a === "--inspection-id" && argv[i + 1]) {
      opts.inspectionId = String(argv[++i]).trim();
    } else if (a === "--create-report") opts.createReport = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--trigger-pdf") opts.triggerPdf = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Options: --limit N | --all | --report-id UUID | --inspection-id UUID
  --create-report | --dry-run | --trigger-pdf | --upload-only`);
      process.exit(0);
    }
  }
  if (opts.all || !Number.isFinite(opts.limit) || opts.limit <= 0) {
    opts.limit = Infinity;
  }
  return opts;
}

function mimeForFile(name) {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function listPhotoFiles() {
  if (!fs.existsSync(DEMO_DIR)) {
    throw new Error(`Dossier introuvable: ${DEMO_DIR}`);
  }
  let order = null;
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
      if (Array.isArray(manifest.files)) {
        order = manifest.files.map((f) => String(f));
      }
    } catch {
      console.warn("photos-manifest.json illisible — tri par nom de fichier.");
    }
  }
  const onDisk = fs
    .readdirSync(DEMO_DIR)
    .filter((f) => IMAGE_RE.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (!order?.length) return onDisk.map((f) => path.join(DEMO_DIR, f));
  const set = new Set(onDisk);
  const ordered = order.filter((f) => set.has(f)).map((f) => path.join(DEMO_DIR, f));
  const rest = onDisk
    .filter((f) => !order.includes(f))
    .map((f) => path.join(DEMO_DIR, f));
  return [...ordered, ...rest];
}

function appendLog(entry) {
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(entry)}\n`, "utf8");
}

function apiHeaders(json = false) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  if (secret) h["x-trigger-secret"] = secret;
  return h;
}

async function fetchApi(pathname, init) {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return fetch(`${base}${pathname}`, { ...init, signal });
}

async function resolveIds() {
  const userId = process.env.SMOKE_USER_ID?.trim();
  const inspectionId = process.env.SMOKE_INSPECTION_ID?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!isUuid(userId) || !isUuid(inspectionId)) {
    throw new Error(
      "SMOKE_USER_ID et SMOKE_INSPECTION_ID (uuid) requis dans .env.local pour --create-report.",
    );
  }
  if (!url || !key) {
    return { userId, inspectionId };
  }
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: job, error } = await supabase
    .from("jobs")
    .select("id")
    .eq("inspection_id", inspectionId)
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn("Vérification job:", error.message);
  } else if (!job) {
    console.warn(
      "Aucun job pour cette inspection — create-report peut échouer. Créez un job ou changez SMOKE_INSPECTION_ID.",
    );
  }
  return { userId, inspectionId };
}

async function createDemoReport(inspectionId, userId) {
  const html =
    "<!DOCTYPE html><html><body><p>Inspection demo batch — contenu minimal pour tests PDF.</p></body></html>";
  const res = await fetchApi("/api/create-report", {
    method: "POST",
    headers: apiHeaders(true),
    body: JSON.stringify({
      user_id: userId,
      inspection_id: inspectionId,
      payload: { html },
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new Error(
      `create-report HTTP ${res.status}: ${typeof body === "object" ? JSON.stringify(body) : text}`,
    );
  }
  const reportId = body.reportId ?? body.report_id;
  if (!isUuid(reportId)) {
    throw new Error(`create-report sans reportId: ${text}`);
  }
  console.log("Rapport créé:", reportId);
  if (body.reportUrl) console.log("  URL:", body.reportUrl);
  return { reportId, reportUrl: body.reportUrl, accessToken: body.access_token };
}

async function uploadOne(filePath, reportId, inspectionId, accessToken) {
  const name = path.basename(filePath);
  const buffer = fs.readFileSync(filePath);
  const blob = new Blob([buffer], { type: mimeForFile(name) });
  const form = new FormData();
  form.append("file", blob, name);
  form.append("report_id", reportId);
  if (isUuid(inspectionId)) form.append("inspection_id", inspectionId);
  if (typeof accessToken === "string" && accessToken.trim()) {
    form.append("access_token", accessToken.trim());
  }
  form.append("language", "fr");

  const res = await fetchApi("/api/upload-photo", {
    method: "POST",
    headers: apiHeaders(),
    body: form,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text.slice(0, 500) };
  }
  return { ok: res.ok, status: res.status, body: parsed, fileName: name };
}

async function triggerPdf(reportId, accessToken) {
  const res = await fetchApi("/api/trigger-inspection", {
    method: "POST",
    headers: apiHeaders(true),
    body: JSON.stringify({
      report_id: reportId,
      access_token: typeof accessToken === "string" ? accessToken.trim() : "",
    }),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const opts = parseArgs(process.argv);
const files = listPhotoFiles();
const batch = files.slice(0, opts.limit);

console.log("Cible API:", base);
console.log("Dossier:", DEMO_DIR);
console.log(
  `Photos: ${batch.length} / ${files.length} (limite ${opts.all ? "aucune" : opts.limit})`,
);
console.log("Journal:", LOG_PATH);

if (!batch.length) {
  console.error("Aucune image dans test-data/inspection-demo/");
  process.exit(1);
}

if (opts.dryRun) {
  for (const f of batch) console.log("  ", path.basename(f));
  console.log("Dry-run terminé.");
  process.exit(0);
}

let reportId = opts.reportId;
let inspectionId = opts.inspectionId;
let accessToken = process.env.DEMO_ACCESS_TOKEN?.trim() ?? "";

if (opts.triggerPdf && !opts.uploadOnly && isUuid(reportId)) {
  console.log("--trigger-pdf seul (sans ré-upload).");
  const pdf = await triggerPdf(reportId, accessToken);
  console.log("trigger-inspection", pdf.status, JSON.stringify(pdf.body, null, 2));
  process.exit(pdf.ok ? 0 : 1);
}

if (!isUuid(reportId)) {
  if (!opts.createReport) {
    console.error(
      "Indiquez DEMO_REPORT_ID ou --report-id <uuid>, ou ajoutez --create-report.",
    );
    process.exit(1);
  }
  const ids = await resolveIds();
  inspectionId = ids.inspectionId;
  const created = await createDemoReport(inspectionId, ids.userId);
  reportId = created.reportId;
  accessToken = created.accessToken ?? accessToken;
} else if (!isUuid(inspectionId)) {
  console.log("inspection_id: (déduit du rapport côté API)");
}

console.log("report_id:", reportId);

const startedAt = new Date().toISOString();
let ok = 0;
let fail = 0;

for (let i = 0; i < batch.length; i++) {
  const filePath = batch[i];
  const fileName = path.basename(filePath);
  process.stdout.write(`[${i + 1}/${batch.length}] ${fileName} … `);
  try {
    const result = await uploadOne(filePath, reportId, inspectionId, accessToken);
    const entry = {
      at: new Date().toISOString(),
      file: fileName,
      ok: result.ok,
      status: result.status,
      photo_id: result.body?.photo_id ?? null,
      error: result.ok ? null : result.body,
    };
    appendLog(entry);
    if (result.ok) {
      ok++;
      console.log("OK", result.body?.photo_id ? `photo_id=${result.body.photo_id}` : "");
    } else {
      fail++;
      console.log("FAIL", result.status, JSON.stringify(result.body).slice(0, 120));
    }
  } catch (err) {
    fail++;
    const msg = err instanceof Error ? err.message : String(err);
    appendLog({
      at: new Date().toISOString(),
      file: fileName,
      ok: false,
      error: msg,
    });
    console.log("ERR", msg);
  }
  if (i < batch.length - 1 && delayMs > 0) await sleep(delayMs);
}

console.log("\nRésumé:", { ok, fail, report_id: reportId, started_at: startedAt });

if (opts.triggerPdf && ok > 0) {
  console.log("Déclenchement PDF…");
  const pdf = await triggerPdf(reportId, accessToken);
  console.log("trigger-inspection", pdf.status, JSON.stringify(pdf.body, null, 2));
  appendLog({
    at: new Date().toISOString(),
    event: "trigger_pdf",
    ok: pdf.ok,
    status: pdf.status,
    body: pdf.body,
  });
  process.exit(pdf.ok ? 0 : 1);
}

process.exit(fail > 0 ? 1 : 0);
