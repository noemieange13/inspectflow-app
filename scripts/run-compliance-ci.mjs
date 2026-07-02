/**
 * CI local / scripts : même environnement que la workflow GitHub
 * (`LEGAL_CLAUSES_STRICT_EN=true`) pour éviter les repli FR silencieux
 * lors des prochains tests qui appellent `fetchLegalClausesForCoverJurisdiction`.
 */
import { spawnSync } from "node:child_process";

const env = { ...process.env, LEGAL_CLAUSES_STRICT_EN: "true" };
const shell = process.platform === "win32";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell });
  if (r.error) throw r.error;
  process.exitCode = r.status ?? 1;
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("npx", ["tsc", "--noEmit"]);
run("npm", ["run", "test:compliance"]);
