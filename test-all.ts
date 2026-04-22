/**
 * Suite de smoke tests locaux (API, env, image distante, Gemini REST, POST /api/analyze).
 *
 * Prérequis : `npm run dev` sur le port ciblé (défaut 3000).
 * Lancement : `npm run test:all`
 *
 * Variables : `TEST_BASE_URL` (optionnel, défaut http://localhost:3000)
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

import { coerceInspectionResult } from "./lib/inspectionResultCoerce";

loadDotenv({ path: resolve(process.cwd(), ".env.local") });
loadDotenv({ path: resolve(process.cwd(), ".env") });

const BASE_URL = (process.env.TEST_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TEST_IMAGE =
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800&q=80";
/** Aligné sur `GEMINI_VISION_MODEL` / `lib/services/gemini.ts`, sinon `TEST_GEMINI_MODEL`, sinon défaut. */
const GEMINI_TEST_MODEL =
  process.env.TEST_GEMINI_MODEL?.trim() ||
  process.env.GEMINI_VISION_MODEL?.trim() ||
  "gemini-2.5-flash";

let failed = 0;

function log(title: string) {
  console.log("\n==============================");
  console.log("🧪 " + title);
  console.log("==============================");
}

function pass() {
  console.log("✅ PASS");
}

function fail(reason?: string) {
  failed += 1;
  console.log("❌ FAIL" + (reason ? ` — ${reason}` : ""));
}

function parseBody(text: string) {
  try {
    return coerceInspectionResult(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}

async function test1ApiGet() {
  log("TEST 1 — GET /api/analyze (santé route)");
  try {
    const res = await fetch(`${BASE_URL}/api/analyze`);
    console.log("STATUS:", res.status);
    const text = await res.text();
    const parsed = parseBody(text);
    if (!res.ok || !parsed || !parsed.ok) {
      fail("réponse invalide ou serveur arrêté (lance `npm run dev`)");
      return;
    }
    pass();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

async function test2EnvGemini() {
  log("TEST 2 — ENV GEMINI_API_KEY");
  if (process.env.GEMINI_API_KEY?.trim()) {
    pass();
  } else {
    fail("clé manquante dans .env.local");
  }
}

async function test2bEnvOpenRouter() {
  log("TEST 2b — ENV OPENROUTER_API_KEY");
  if (process.env.OPENROUTER_API_KEY?.trim()) {
    pass();
  } else {
    fail("clé manquante dans .env.local");
  }
}

async function test3ImageFetch() {
  log("TEST 3 — FETCH image distante");
  try {
    const res = await fetch(TEST_IMAGE);
    console.log("STATUS:", res.status);
    if (!res.ok) {
      fail(`HTTP ${res.status}`);
      return;
    }
    const buffer = await res.arrayBuffer();
    console.log("BUFFER SIZE:", buffer.byteLength);
    if (buffer.byteLength > 0) pass();
    else fail("buffer vide");
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

async function test4GeminiRest() {
  log(`TEST 4 — Gemini REST (modèle ${GEMINI_TEST_MODEL})`);
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    fail("pas de GEMINI_API_KEY");
    return;
  }
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEST_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Réponds uniquement par le mot OK." }] }],
      }),
    });
    const text = await res.text();
    console.log("STATUS:", res.status);
    if (!res.ok) {
      fail(text.slice(0, 400));
      return;
    }
    const j = JSON.parse(text) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const out = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    console.log("RESPONSE:", out.slice(0, 200));
    if (out.trim()) pass();
    else fail("réponse vide");
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

async function test5FullPost() {
  log("TEST 5 — POST /api/analyze (pipeline complet)");
  try {
    const res = await fetch(`${BASE_URL}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "inspection",
        images: [TEST_IMAGE],
      }),
    });
    console.log("STATUS:", res.status);
    const text = await res.text();
    const preview = text.length > 800 ? `${text.slice(0, 800)}…` : text;
    console.log("RAW:", preview);

    if (text.includes("GoogleGenerativeAI") && !text.includes('"issues"')) {
      fail(
        "réponse inattendue (SDK Google) — souvent une autre app sur le même port. Définis TEST_BASE_URL vers ce dépôt (npm run dev).",
      );
      return;
    }

    const parsed = parseBody(text);
    if (!parsed) {
      fail("JSON invalide ou non conforme");
      return;
    }
    if (res.status === 503 && parsed.error === "CONFIG_MISSING") {
      fail("CONFIG_MISSING — renseigner GEMINI + OPENROUTER sur le serveur (.env.local + redémarrer dev)");
      return;
    }
    if (!res.ok) {
      fail(`HTTP ${res.status} — ${parsed.error ?? ""}`);
      return;
    }
    if (!parsed.ok) {
      fail(parsed.error ?? "ok=false dans le corps");
      return;
    }
    pass();
  } catch (e) {
    fail(e instanceof Error ? e.message : String(e));
  }
}

async function runAll() {
  const envBase = process.env.TEST_BASE_URL;
  console.log("\n🚀 SUITE DE TESTS\n");
  console.log("BASE URL (résolu) :", BASE_URL);
  console.log(
    "TEST_BASE_URL (.env) :",
    envBase?.trim() ? envBase.trim() : "(non défini → défaut http://localhost:3000)",
  );
  console.log("Modèle Gemini (test 4) :", GEMINI_TEST_MODEL);
  console.log("");

  await test1ApiGet();
  await test2EnvGemini();
  await test2bEnvOpenRouter();
  await test3ImageFetch();
  await test4GeminiRest();
  await test5FullPost();

  console.log("\n==============================");
  if (failed === 0) {
    console.log("🏁 TERMINÉ — tout PASS");
    console.log("🎉 ALL TESTS PASSED");
    process.exit(0);
  } else {
    console.log(`🏁 TERMINÉ — ${failed} échec(s)`);
    console.log(
      "Astuce : `npm run dev` sur le bon port, puis dans .env.local définis TEST_BASE_URL (ex. http://localhost:3001) si ce n’est pas 3000.",
    );
    process.exit(1);
  }
}

void runAll();
