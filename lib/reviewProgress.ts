import type { FindingReviewStatus } from "@/lib/findingsReview";

export type ReviewProgressStats = {
  total: number;
  accepted: number;
  edited: number;
  ignored: number;
  complete: boolean;
};

export type ReviewDecisionMap = ReadonlyMap<string, FindingReviewStatus>;

const DECISION_STATUSES = new Set<FindingReviewStatus>([
  "accepted",
  "modified",
  "ignored",
]);

function isDecisionStatus(status: FindingReviewStatus): boolean {
  return DECISION_STATUSES.has(status);
}

/** Compte les décisions de révision (accepté / modifié / ignoré). */
export function computeReviewProgress(
  decisions: ReviewDecisionMap,
  total: number,
): ReviewProgressStats {
  let accepted = 0;
  let edited = 0;
  let ignored = 0;

  for (const status of decisions.values()) {
    if (status === "accepted") accepted += 1;
    else if (status === "modified") edited += 1;
    else if (status === "ignored") ignored += 1;
  }

  const verified = accepted + edited + ignored;
  return {
    total,
    accepted,
    edited,
    ignored,
    complete: total > 0 && verified >= total,
  };
}

export function reviewProgressPercent(verified: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((verified / total) * 100));
}

export function verifiedCount(stats: ReviewProgressStats): number {
  return stats.accepted + stats.edited + stats.ignored;
}

export function formatReviewProgressLabel(
  verified: number,
  total: number,
  language: "fr" | "en" = "fr",
): string {
  if (language === "en") {
    return `${verified} of ${total} verified`;
  }
  return `${verified} sur ${total} vérifiés`;
}

export function isReviewSessionComplete(verified: number, total: number): boolean {
  return total > 0 && verified >= total;
}

export function upsertReviewDecision(
  decisions: Map<string, FindingReviewStatus>,
  observationId: string,
  status: Exclude<FindingReviewStatus, "pending">,
): Map<string, FindingReviewStatus> {
  const next = new Map(decisions);
  next.set(observationId.trim(), status);
  return next;
}

export function countDecisions(decisions: ReviewDecisionMap): number {
  let n = 0;
  for (const status of decisions.values()) {
    if (isDecisionStatus(status)) n += 1;
  }
  return n;
}
