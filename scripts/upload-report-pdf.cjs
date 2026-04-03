/**
 * Upload un PDF minimal (dummy W3C) vers Storage au chemin attendu par l’app.
 *
 * Prérequis dans .env.local (ou variables d’environnement) :
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (obligatoire pour upload ; ne jamais commit)
 *
 * Lancer (Node 20+) :
 *   node --env-file=.env.local scripts/upload-report-pdf.cjs
 *
 * Sinon :
 *   set SUPABASE_SERVICE_ROLE_KEY=... & set NEXT_PUBLIC_SUPABASE_URL=... & node scripts/upload-report-pdf.cjs
 */

const { createClient } = require("@supabase/supabase-js");

const REPORT_ID = "f5cbc318-0b26-434b-afc4-f566b570a595";
const USER_ID = "865bf60d-c423-4519-b38d-a267fafaf5d2";
const BUCKET = "rapports-pdf";
const OBJECT_PATH = `${USER_ID}/${REPORT_ID}.pdf`;
const DUMMY_PDF_URL =
  "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.error(
      "Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans l'environnement.",
    );
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const res = await fetch(DUMMY_PDF_URL);
  if (!res.ok) {
    console.error("Téléchargement dummy PDF échoué:", res.status);
    process.exit(1);
  }

  const buf = Buffer.from(await res.arrayBuffer());

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(OBJECT_PATH, buf, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("Upload Storage:", error);
    process.exit(1);
  }

  console.log("OK — fichier uploadé :", BUCKET, "/", OBJECT_PATH);
  console.log(data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
