/**
 * Test bout-en-bout : création report + génération PDF.
 * Priorité: routes Next locales (/api/*). Repli possible: Edge Functions directes.
 * Charge `.env.local` à la racine du repo (sans option Node `--env-file`, compatible vieux Node).
 *
 * Usage : depuis la racine du projet
 *   npm run smoke:e2e
 *
 * Options : SMOKE_SKIP_TRIGGER, SMOKE_SKIP_REPORT_COVER (1 = ne pas appeler report-cover).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envLocal = path.join(root, ".env.local");

function loadEnvLocal(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const text = fs.readFileSync(filePath, "utf8");
  const fromFile = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    const quoted =
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"));
    if (!quoted) {
      // Style dotenv: les commentaires inline " # ..." ne font pas partie de la valeur.
      val = val.replace(/\s+#.*$/, "").trim();
    }
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!key) continue;
    // Dernière occurrence gagne, comme dotenv.
    fromFile[key] = val;
  }
  for (const [key, val] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadEnvLocal(envLocal);

const base = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
/** Timeout généreux : la première requête déclenche la compilation à froid de Next.js dev. */
const FETCH_TIMEOUT_MS = 120_000;
function fetchWithTimeout(url, init) {
  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return fetch(url, { ...init, signal });
}
function fetchApi(pathname, init) {
  return fetchWithTimeout(`${base}${pathname}`, init);
}
function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
function truncateForLog(value) {
  if (!value) return "(none)";
  return `${value.slice(0, 8)}…`;
}

const envUserId = process.env.SMOKE_USER_ID?.trim();
const envInspectionId = process.env.SMOKE_INSPECTION_ID?.trim();
const secret = process.env.TRIGGER_INSPECTION_SECRET?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
const canUseDirectEdge =
  !!supabaseUrl &&
  !!serviceRoleKey &&
  /^https?:\/\//.test(supabaseUrl);
const supabase = canUseDirectEdge
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

console.log("Cible API :", base, `(timeout ${FETCH_TIMEOUT_MS / 1000}s)`);
console.log(
  "Si Next.js affiche un autre port (ex. 3001), ajoute dans .env.local : SMOKE_BASE_URL=http://localhost:3001",
);
console.log(
  "SMOKE_USER_ID:",
  isUuid(envUserId) ? truncateForLog(envUserId) : "(auto-resolve)",
);
console.log(
  "SMOKE_INSPECTION_ID:",
  isUuid(envInspectionId) ? truncateForLog(envInspectionId) : "(auto-resolve)",
);

const headers = { "Content-Type": "application/json" };
if (secret) {
  headers["x-trigger-secret"] = secret;
}

async function resolveUserId() {
  if (isUuid(envUserId)) return envUserId;
  if (!supabase) {
    throw new Error(
      "SMOKE_USER_ID invalide/absent et impossible d'auto-résoudre sans NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const fromInspections = await supabase
    .from("inspections")
    .select("owner_id")
    .not("owner_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!fromInspections.error) {
    const candidate = (fromInspections.data?.owner_id ?? "").toString().trim();
    if (isUuid(candidate)) return candidate;
  }

  const fromReports = await supabase
    .from("reports")
    .select("user_id")
    .not("user_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (!fromReports.error) {
    const candidate = (fromReports.data?.user_id ?? "").toString().trim();
    if (isUuid(candidate)) return candidate;
  }

  throw new Error(
    "Impossible d'auto-résoudre user_id. Définis SMOKE_USER_ID dans .env.local.",
  );
}

async function resolveInspectionId() {
  if (isUuid(envInspectionId)) return envInspectionId;
  if (!supabase) {
    throw new Error(
      "SMOKE_INSPECTION_ID invalide/absent et impossible d'auto-résoudre sans NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  const { data, error } = await supabase
    .from("jobs")
    .select("inspection_id")
    .not("inspection_id", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`jobs lookup failed: ${error.message}`);
  const candidate = (data?.inspection_id ?? "").toString().trim();
  if (!isUuid(candidate)) {
    throw new Error("Aucune inspection liée à un job n'a été trouvée.");
  }
  return candidate;
}

async function createReportViaEdge(createBody) {
  if (!canUseDirectEdge) {
    throw new Error("Repli Edge impossible: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY manquants.");
  }
  const slug = process.env.CREATE_REPORT_SLUG?.trim() || "create-report";
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${slug}`;
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify(createBody),
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON
  }
  return { res, parsed };
}

async function triggerPdfViaEdge(reportId) {
  if (!canUseDirectEdge) {
    throw new Error("Repli Edge impossible: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY manquants.");
  }
  const slug = process.env.REPORTS_PDF_SLUG?.trim() || "reports-pdf";
  const endpoint = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/${slug}`;
  const res = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({ report_id: reportId }),
  });
  const text = await res.text();
  let parsed = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // non-JSON
  }
  return { res, parsed };
}

const htmlPayload =
  "<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>Smoke</title></head><body>" +
  "<p>Smoke test HTML content for PDF pipeline verification.</p></body></html>";

/** Couverture minimale pour valider POST /api/report-cover + fusion PDF (cover + html custom). */
function smokeCoverV1() {
  const now = new Date();
  return {
    schema_version: 1,
    requerants: "SMOKE E2E",
    conditions_meteo: "N/A",
    date_heure_affichage: now.toLocaleString("fr-CA"),
    date_heure_iso: now.toISOString(),
    duree_inspection: "",
    inspecteur_nom: "Smoke",
    inspecteur_numero_certification: "",
    compagnie: "",
    intervenants_sur_place: "",
    propriete: {
      adresse: "123 rue Smoke",
      type_propriete: "",
      annee_construction: "",
      client_nom: "",
      client_telephone: "",
      client_courriel: "",
    },
    description_sommaire: {
      mode: "manuel",
      type_maison: "",
      construit_en: "",
      facade: "",
      cotes: "",
      arriere: "",
      toiture: "",
      type_fondation: "",
      type_structure: "",
      chauffage: "",
    },
    condition_generale: "",
    orientation_facade: "",
    conformite_juridiction: "ca_qc",
    notes_conformite: "Note smoke — à valider juridiquement.",
  };
}

let userId;
let inspectionId;
try {
  userId = await resolveUserId();
  inspectionId = await resolveInspectionId();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
console.log("user_id:", truncateForLog(userId));
console.log("inspection_id:", truncateForLog(inspectionId));

const createBody = {
  user_id: userId,
  inspection_id: inspectionId,
  payload: { html: htmlPayload },
};

let r1;
let t1;
try {
  r1 = await fetchApi("/api/create-report", {
    method: "POST",
    headers,
    body: JSON.stringify(createBody),
  });
  t1 = await r1.text();
} catch (err) {
  console.error("Échec réseau vers /api/create-report :", err?.cause ?? err);
  console.error(
    "Cause fréquente : SMOKE_BASE_URL ne correspond pas au port de `npm run dev` (voir la ligne « Local: http://localhost:XXXX »).",
  );
  process.exit(1);
}
let j1;
try {
  j1 = JSON.parse(t1);
} catch {
  j1 = null;
}
if (!r1.ok) {
  console.error("create-report HTTP", r1.status, t1);
  if (r1.status === 401 && canUseDirectEdge) {
    console.log("Repli vers Edge create-report direct (secret local non aligné).");
    const { res, parsed } = await createReportViaEdge(createBody);
    if (!res.ok) {
      console.error("edge create-report HTTP", res.status, JSON.stringify(parsed));
      process.exit(1);
    }
    j1 = parsed;
  } else {
    process.exit(1);
  }
}
const reportId = j1?.reportId;
const reportUrl = j1?.reportUrl;
if (!reportId) {
  console.error("Réponse create-report sans reportId:", JSON.stringify(j1 ?? t1));
  process.exit(1);
}
console.log("OK create-report");
console.log("  reportId:", reportId);
console.log("  reportUrl:", reportUrl ?? "(absent)");
console.log("  Ouvre reportUrl dans le navigateur si tu veux vérifier la page rapport.");

if (process.env.SMOKE_SKIP_TRIGGER === "1") {
  console.log("SMOKE_SKIP_TRIGGER=1 — arrêt avant trigger-inspection.");
  process.exit(0);
}

const accessToken =
  typeof j1?.access_token === "string" ? j1.access_token.trim() : "";
if (process.env.SMOKE_SKIP_REPORT_COVER === "1") {
  console.log("SMOKE_SKIP_REPORT_COVER=1 — pas d’appel /api/report-cover.");
} else if (accessToken) {
  let rCover;
  let tCover;
  try {
    rCover = await fetchApi("/api/report-cover", {
      method: "POST",
      headers,
      body: JSON.stringify({
        report_id: reportId,
        access_token: accessToken,
        cover_v1: smokeCoverV1(),
        inspector_profile_v1: {
          nom: "Smoke",
          numero_certification: "",
          compagnie: "",
          logo_data_url: null,
        },
      }),
    });
    tCover = await rCover.text();
  } catch (err) {
    console.error("Échec réseau vers /api/report-cover :", err?.cause ?? err);
    process.exit(1);
  }
  let jCover;
  try {
    jCover = JSON.parse(tCover);
  } catch {
    jCover = null;
  }
  console.log("report-cover HTTP", rCover.status);
  if (!rCover.ok) {
    console.error("report-cover body:", tCover);
    process.exit(1);
  }
  console.log("OK report-cover", jCover?.cover_saved_at ?? "");
} else {
  console.log(
    "SKIP report-cover (pas d’access_token dans la réponse create-report).",
  );
}

let r2;
let t2;
try {
  r2 = await fetchApi("/api/trigger-inspection", {
    method: "POST",
    headers,
    body: JSON.stringify({ report_id: reportId }),
  });
  t2 = await r2.text();
} catch (err) {
  console.error("Échec réseau vers /api/trigger-inspection :", err?.cause ?? err);
  process.exit(1);
}
let j2;
try {
  j2 = JSON.parse(t2);
} catch {
  j2 = t2;
}
if (!r2.ok && r2.status === 401 && canUseDirectEdge) {
  console.log("Repli vers Edge reports-pdf direct (secret local non aligné).");
  const { res, parsed } = await triggerPdfViaEdge(reportId);
  r2 = res;
  j2 = parsed;
}
console.log("trigger-inspection HTTP", r2.status);
console.log(JSON.stringify(j2, null, 2));
process.exit(r2.ok ? 0 : 1);
