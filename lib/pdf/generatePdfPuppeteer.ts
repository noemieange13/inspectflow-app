/**
 * Rendu PDF local via Puppeteer (HTML → PDF). Optionnel : non utilisé par le pipeline Edge `reports-pdf`.
 * Activer : ENABLE_PUPPETEER_PDF=1 + `puppeteer` installé (`npm install puppeteer --save-dev`).
 */

export async function generatePdfWithPuppeteer(html: string): Promise<Buffer> {
  if (process.env.ENABLE_PUPPETEER_PDF !== "1") {
    throw new Error(
      "PDF Puppeteer désactivé : définir ENABLE_PUPPETEER_PDF=1 dans l'environnement.",
    );
  }

  let puppeteer: typeof import("puppeteer");
  try {
    puppeteer = await import("puppeteer");
  } catch {
    throw new Error(
      "Module `puppeteer` introuvable : exécutez `npm install puppeteer --save-dev`.",
    );
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 60_000 });
    const buf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "14mm", left: "12mm" },
    });
    return Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
