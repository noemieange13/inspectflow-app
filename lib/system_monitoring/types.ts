export type SystemHealthLevel = "healthy" | "warning" | "critical";

export type SystemIssueSeverity = "info" | "warning" | "critical";

export type SystemIssueSource =
  | "photo_pipeline"
  | "ai"
  | "pdf"
  | "audit"
  | "database";

export type SystemHealthCheckKey =
  | "photo_pipeline"
  | "ai_usage"
  | "pdf_generation"
  | "audit_pipeline";

export type SystemIssue = {
  id: string;
  severity: SystemIssueSeverity;
  source: SystemIssueSource;
  message: string;
  metadata: Record<string, unknown>;
  detected_at: string;
};

export type SystemHealthChecks = Record<SystemHealthCheckKey, boolean>;

export type SystemHealthStatus = {
  status: SystemHealthLevel;
  checks: SystemHealthChecks;
  issues: SystemIssue[];
  generated_at: string;
};

/** Signaux agrégés — lecture seule, sans PII. */
export type SystemSignals = {
  photo: {
    pending_jobs: number;
    oldest_pending_job_age_minutes: number;
    failed_jobs_24h: number;
    completed_jobs_24h: number;
  };
  ai: {
    total_cost_today: number;
    vision_calls_today: number;
    average_cost_per_inspection: number;
    failed_ai_jobs: number;
  };
  pdf: {
    pdf_generated_24h: number;
    pdf_failed_24h: number;
  };
  audit: {
    last_event_at: string | null;
    events_24h: number;
  };
  collected_at: string;
};

export type RecordSystemHealthEventInput = {
  event_type: string;
  severity: SystemIssueSeverity | SystemHealthLevel;
  source: SystemIssueSource | "system";
  status?: "open" | "resolved";
  metadata?: Record<string, unknown>;
};

export type RecordSystemHealthEventResult = {
  recorded: boolean;
  id?: string;
  error?: string;
};
