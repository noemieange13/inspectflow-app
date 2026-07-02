import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(scriptsDir, "..", "..");

/**
 * Charge `.env.local` à la racine du repo (compatible Node sans --env-file).
 * Les variables déjà définies dans process.env ne sont pas écrasées.
 */
export function loadEnvLocal(filePath = path.join(repoRoot, ".env.local")) {
  if (!fs.existsSync(filePath)) {
    return false;
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
      val = val.replace(/\s+#.*$/, "").trim();
    }
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!key) continue;
    fromFile[key] = val;
  }
  for (const [key, val] of Object.entries(fromFile)) {
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
  return true;
}
