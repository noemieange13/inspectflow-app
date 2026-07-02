import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FRICTION_LABELS: Record<string, { fr: string; en: string }> = {
  unclear: { fr: "Je ne savais pas quoi faire", en: "I didn't know what to do" },
  wrong_text: { fr: "Texte incorrect", en: "Incorrect text" },
  bad_photo: { fr: "Mauvaise photo", en: "Wrong photo" },
  too_long: { fr: "Trop long", en: "Too long" },
  other: { fr: "Autre", en: "Other" },
};

export async function POST(req: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { screen?: string; option_id?: string; language?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const optionId = typeof body.option_id === "string" ? body.option_id.trim() : "";
  const screen = typeof body.screen === "string" ? body.screen.trim() : "workspace";
  const language = body.language === "en" ? "en" : "fr";
  const label = FRICTION_LABELS[optionId]?.[language] ?? (optionId || "—");

  const docPath = join(process.cwd(), "docs/friction_points.md");
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const row = `| ${screen} (8T ${stamp}) | ${label} | _(pilot Steve)_ | ☐ ouvert |\n`;

  if (!existsSync(docPath)) {
    return Response.json({ error: "friction_points.md missing" }, { status: 500 });
  }

  const current = readFileSync(docPath, "utf8");
  const marker = "**Instructions :**";
  if (current.includes(marker)) {
    writeFileSync(docPath, current.replace(marker, `${row}\n${marker}`), "utf8");
  } else {
    appendFileSync(docPath, `\n${row}`);
  }

  return Response.json({ success: true });
}
