/**
 * Exécute les migrations QC qc_events (1 → 2 → 3) contre une base Postgres.
 *
 * Prérequis : DATABASE_URL dans l'environnement ou dans .env.local (URI postgres).
 * Usage :
 *   node scripts/run-qc-events-migrations.mjs
 *   node --env-file=.env.local scripts/run-qc-events-migrations.mjs
 *
 * Utilise la CLI Supabase : `db query -f <file> --db-url <url>`
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const MIGRATIONS = [
  "supabase/migrations/20260424140000_qc_events_pipeline.sql",
  "supabase/migrations/20260425120000_qc_stats_atomic_v2.sql",
  "supabase/migrations/20260425140000_qc_events_v3_context.sql",
];

function loadDotEnvLocal() {
  const p = path.join(root, ".env.local");
  if (!existsSync(p)) return;
  const text = readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line.trim());
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

function main() {
  loadDotEnvLocal();
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (!dbUrl) {
    console.error(
      "DATABASE_URL manquant. Ajoutez dans .env.local la chaîne « Session mode: Direct » " +
        "(Settings → Database) ou lancez :\n" +
        "  node --env-file=.env.local scripts/run-qc-events-migrations.mjs",
    );
    process.exit(1);
  }

  for (const rel of MIGRATIONS) {
    const file = path.join(root, rel);
    if (!existsSync(file)) {
      console.error("Fichier introuvable:", file);
      process.exit(1);
    }
    console.error("→", rel);
    const r = spawnSync(
      "npx",
      ["supabase", "db", "query", "-f", file, "--db-url", dbUrl, "--output", "table"],
      {
        cwd: root,
        stdio: ["ignore", "inherit", "inherit"],
        shell: true,
        env: { ...process.env },
      },
    );
    if (r.status !== 0) {
      console.error("Échec migration:", rel);
      process.exit(r.status ?? 1);
    }
  }
  console.error("OK — migrations 1, 2 et 3 appliquées.");
}

main();
