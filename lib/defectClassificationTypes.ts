/**
 * Sortie structurée attendue du modèle (JSON) — classification par section.
 */
export type ClassifiedDefectSeverity = "low" | "medium" | "high";

export type ClassifiedDefect = {
  title: string;
  description: string;
  recommendation: string;
  severity: ClassifiedDefectSeverity;
};

export type ClassifiedDefects = {
  sections: Array<{
    section: string;
    defects: ClassifiedDefect[];
  }>;
};
