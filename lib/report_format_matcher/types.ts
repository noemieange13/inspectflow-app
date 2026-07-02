/** Phase 8N — read-only Steve report format matcher (no PDF engine). */

export type SteveReportSection = {
  code: string;
  label_fr: string;
  label_en: string;
  required: boolean;
  present: boolean;
};

export type FormatMatchResult = {
  score: number;
  sections: SteveReportSection[];
  missing: string[];
};
