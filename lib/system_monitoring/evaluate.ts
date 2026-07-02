import { sha256Hex } from "@/lib/sha256Hex";

import {
  FAILED_JOB_WARNING_RATE,
  getAiCostDailyLimits,
  PDF_FAILURE_WARNING_RATE,
  PHOTO_QUEUE_CRITICAL_MINUTES,
  PHOTO_QUEUE_WARNING_MINUTES,
} from "./constants";
import type {
  SystemHealthChecks,
  SystemHealthLevel,
  SystemHealthStatus,
  SystemIssue,
  SystemIssueSeverity,
  SystemIssueSource,
  SystemSignals,
} from "./types";

function stableIssueId(source: SystemIssueSource, message: string): string {
  return sha256Hex(`${source}|${message}`).slice(0, 16);
}

function pushIssue(
  issues: SystemIssue[],
  severity: SystemIssueSeverity,
  source: SystemIssueSource,
  message: string,
  metadata: Record<string, unknown>,
  detected_at: string,
): void {
  issues.push({
    id: stableIssueId(source, message),
    severity,
    source,
    message,
    metadata,
    detected_at,
  });
}

function maxHealthLevel(a: SystemHealthLevel, b: SystemHealthLevel): SystemHealthLevel {
  const rank = { healthy: 0, warning: 1, critical: 2 };
  return rank[b] > rank[a] ? b : a;
}

/** Évalue la santé opérationnelle — observation uniquement, aucune action corrective. */
export function evaluateSystemHealth(
  signals: SystemSignals,
  evaluated_at?: string,
): SystemHealthStatus {
  const generated_at = evaluated_at ?? new Date().toISOString();
  const issues: SystemIssue[] = [];
  let status: SystemHealthLevel = "healthy";

  const { photo, ai, pdf, audit } = signals;

  if (photo.pending_jobs > 0) {
    if (photo.oldest_pending_job_age_minutes >= PHOTO_QUEUE_CRITICAL_MINUTES) {
      pushIssue(
        issues,
        "critical",
        "photo_pipeline",
        "File d'analyse photo bloquée — job en attente depuis plus de 2 h.",
        {
          pending_jobs: photo.pending_jobs,
          oldest_pending_job_age_minutes: photo.oldest_pending_job_age_minutes,
        },
        generated_at,
      );
      status = maxHealthLevel(status, "critical");
    } else if (photo.oldest_pending_job_age_minutes >= PHOTO_QUEUE_WARNING_MINUTES) {
      pushIssue(
        issues,
        "warning",
        "photo_pipeline",
        "Analyse photo en retard — job en attente depuis plus de 30 min.",
        {
          pending_jobs: photo.pending_jobs,
          oldest_pending_job_age_minutes: photo.oldest_pending_job_age_minutes,
        },
        generated_at,
      );
      status = maxHealthLevel(status, "warning");
    }
  }

  const jobDenominator = photo.failed_jobs_24h + photo.completed_jobs_24h;
  if (jobDenominator > 0) {
    const failedRate = photo.failed_jobs_24h / jobDenominator;
    if (failedRate > FAILED_JOB_WARNING_RATE) {
      pushIssue(
        issues,
        "warning",
        "photo_pipeline",
        "Taux d'échec jobs analyse photo élevé (24 h).",
        {
          failed_jobs_24h: photo.failed_jobs_24h,
          completed_jobs_24h: photo.completed_jobs_24h,
          failed_rate: Math.round(failedRate * 10_000) / 10_000,
        },
        generated_at,
      );
      status = maxHealthLevel(status, "warning");
    }
  }

  const costLimits = getAiCostDailyLimits();
  if (ai.total_cost_today >= costLimits.critical) {
    pushIssue(
      issues,
      "critical",
      "ai",
      "Coût IA journalier au-dessus du plafond critique.",
      {
        total_cost_today: ai.total_cost_today,
        limit_critical: costLimits.critical,
      },
      generated_at,
    );
    status = maxHealthLevel(status, "critical");
  } else if (ai.total_cost_today >= costLimits.warning) {
    pushIssue(
      issues,
      "warning",
      "ai",
      "Coût IA journalier au-dessus du seuil d'alerte.",
      {
        total_cost_today: ai.total_cost_today,
        limit_warning: costLimits.warning,
      },
      generated_at,
    );
    status = maxHealthLevel(status, "warning");
  }

  const pdfTotal = pdf.pdf_generated_24h + pdf.pdf_failed_24h;
  if (pdfTotal > 0) {
    const pdfFailureRate = pdf.pdf_failed_24h / pdfTotal;
    if (pdfFailureRate > PDF_FAILURE_WARNING_RATE) {
      pushIssue(
        issues,
        "warning",
        "pdf",
        "Taux d'échec génération PDF élevé (24 h).",
        {
          pdf_generated_24h: pdf.pdf_generated_24h,
          pdf_failed_24h: pdf.pdf_failed_24h,
          failure_rate: Math.round(pdfFailureRate * 10_000) / 10_000,
        },
        generated_at,
      );
      status = maxHealthLevel(status, "warning");
    }
  }

  if (audit.events_24h === 0 && photo.completed_jobs_24h > 0) {
    pushIssue(
      issues,
      "info",
      "audit",
      "Aucun événement audit inspection en 24 h malgré activité photo.",
      { events_24h: audit.events_24h },
      generated_at,
    );
    if (status === "healthy") status = "warning";
  }

  const checks: SystemHealthChecks = {
    photo_pipeline: !issues.some(
      (i) => i.source === "photo_pipeline" && i.severity !== "info",
    ),
    ai_usage: !issues.some((i) => i.source === "ai" && i.severity !== "info"),
    pdf_generation: !issues.some((i) => i.source === "pdf" && i.severity !== "info"),
    audit_pipeline: !issues.some(
      (i) => i.source === "audit" && i.severity !== "info",
    ),
  };

  return { status, checks, issues, generated_at };
}

export function emptySystemSignals(collected_at?: string): SystemSignals {
  return {
    photo: {
      pending_jobs: 0,
      oldest_pending_job_age_minutes: 0,
      failed_jobs_24h: 0,
      completed_jobs_24h: 0,
    },
    ai: {
      total_cost_today: 0,
      vision_calls_today: 0,
      average_cost_per_inspection: 0,
      failed_ai_jobs: 0,
    },
    pdf: { pdf_generated_24h: 0, pdf_failed_24h: 0 },
    audit: { last_event_at: null, events_24h: 0 },
    collected_at: collected_at ?? new Date().toISOString(),
  };
}
