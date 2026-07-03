import { emitProductEvent } from "@/lib/productTelemetry";

/**
 * Journalisation détaillée du pipeline d'import de photos (terrain).
 *
 * Objectif : rendre chaque étape observable dans la console **et** via la
 * télémétrie (`inspectflow:telemetry`), afin de diagnostiquer les cas où
 * l'import affiche « Import interrompu » sans qu'aucune reprise ne s'exécute
 * (voir bug PHOTO-002).
 *
 * Étapes couvertes :
 *  - `folder_selected`    : dossier / fichiers sélectionnés
 *  - `files_detected`     : nombre de fichiers image retenus
 *  - `upload_start`       : début du drain de la file
 *  - `upload_progress`    : progression fichier par fichier
 *  - `upload_interrupted` : interruption (exception, échec)
 *  - `upload_resume`      : reprise automatique (visibilitychange / online)
 *  - `upload_end`         : fin de l'import (succès ou bilan)
 */
export type PhotoImportStep =
  | "folder_selected"
  | "files_detected"
  | "upload_start"
  | "upload_progress"
  | "upload_interrupted"
  | "upload_resume"
  | "upload_end"
  | "error";

/** Préfixe unique et filtrable dans la console / logs serveur. */
export const PHOTO_IMPORT_LOG_PREFIX = "[PHOTO_IMPORT]";

const STEP_EMOJI: Record<PhotoImportStep, string> = {
  folder_selected: "📂",
  files_detected: "🔎",
  upload_start: "⬆️",
  upload_progress: "…",
  upload_interrupted: "⛔",
  upload_resume: "🔄",
  upload_end: "✅",
  error: "❌",
};

export type PhotoImportLogContext = {
  reportId?: string | null;
  step: PhotoImportStep;
  message: string;
  data?: Record<string, unknown>;
};

/**
 * Émet un log structuré (console + télémétrie) pour une étape du pipeline.
 * Les erreurs de log ne doivent jamais casser l'import.
 */
export function logPhotoImport(ctx: PhotoImportLogContext): void {
  const { reportId, step, message, data } = ctx;
  const payload = {
    step,
    report_id: reportId ?? null,
    ...(data ?? {}),
  };

  try {
    const line = `${PHOTO_IMPORT_LOG_PREFIX} ${STEP_EMOJI[step]} ${step} — ${message}`;
    if (step === "upload_interrupted" || step === "error") {
      console.error(line, payload);
    } else if (step === "upload_progress") {
      console.debug(line, payload);
    } else {
      console.info(line, payload);
    }
  } catch {
    /* ignore console failures */
  }

  emitProductEvent(`photo_import_${step}`, payload);
}
