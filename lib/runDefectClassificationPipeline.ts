import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyDefectsFromSections } from "@/lib/classifyDefectsAi";
import { persistDefectClassification } from "@/lib/persistDefectClassification";
import type { ReportLanguage } from "@/lib/reportNarrative";

export type SectionTextBlock = {
  title: string;
  observation: string;
  analysis: string;
  recommendation: string;
};

/**
 * Pipeline : IA → journal → remplacement des `report_items` (idempotent par rapport).
 */
export async function runDefectClassificationPipeline(opts: {
  supabase: SupabaseClient;
  reportId: string;
  sections: SectionTextBlock[];
  language: ReportLanguage;
  signal?: AbortSignal;
}): Promise<{ itemsInserted: number; logged: boolean }> {
  const inputForHash = {
    report_id: opts.reportId,
    language: opts.language,
    sections: opts.sections,
  };
  const result = await classifyDefectsFromSections({
    sections: opts.sections,
    language: opts.language,
    signal: opts.signal,
  });
  return persistDefectClassification(
    opts.supabase,
    opts.reportId,
    result,
    inputForHash,
  );
}
