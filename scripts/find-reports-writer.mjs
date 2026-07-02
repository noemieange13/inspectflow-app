#!/usr/bin/env node
/**
 * Cherche insert/upsert sur la table `reports` dans ce dépôt.
 * Usage : node scripts/find-reports-writer.mjs
 * Attendu : aucune correspondance (writer hors inspectflow-web).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const patterns = [
  /\.from\(['"]reports['"]\)\.(insert|upsert)/,
  /insert\s+into\s+public\.?reports/i,
];

const scanDirs = ["app", "lib", "components", "supabase", "scripts"];

async function* walkFiles(dir) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (
        ["node_modules", ".next", "dist", "coverage", ".turbo", ".git"].includes(
          e.name,
        )
      ) {
        continue;
      }
      yield* walkFiles(full);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(e.name)) {
      yield full;
    }
  }
}

async function main() {
  let found = false;
  for (const d of scanDirs) {
    const base = path.join(root, d);
    for await (const file of walkFiles(base)) {
      const text = await fs.readFile(file, "utf8").catch(() => "");
      for (const re of patterns) {
        if (re.test(text)) {
          console.log(`MATCH ${re} -> ${path.relative(root, file)}`);
          found = true;
        }
      }
    }
  }
  const mw = path.join(root, "proxy.ts");
  try {
    const text = await fs.readFile(mw, "utf8");
    for (const re of patterns) {
      if (re.test(text)) {
        console.log(`MATCH ${re} -> proxy.ts`);
        found = true;
      }
    }
  } catch {
    /* optional */
  }
  if (!found) {
    console.log("OK — aucun insert/upsert sur reports dans ce dépôt.");
    console.log(
      "Writer hors repo : Edge Functions dashboard, autres repos, ou trigger SQL (voir docs/ARCHITECTURE.md).",
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
