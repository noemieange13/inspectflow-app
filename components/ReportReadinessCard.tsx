"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { CoverReadinessResult, ReadinessIssue } from "@/lib/reportReadiness";
import { readinessRiskLinesFr } from "@/lib/reportReadiness";
import { emitProductEvent } from "@/lib/productTelemetry";

export type ReadinessStepOpenedFrom = "cta" | "guided" | "list";

function gateStyle(
  gate: CoverReadinessResult["gate"],
  hasCriticalBlocking: boolean,
) {
  if (gate === "blocked" && hasCriticalBlocking) {
    return "border-rose-300 bg-rose-50 text-rose-950";
  }
  switch (gate) {
    case "ready":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "blocked":
      return "border-red-200 bg-red-50 text-red-950";
  }
}

function decisionHeadline(
  gate: CoverReadinessResult["gate"],
  blocking: ReadinessIssue[],
): { emoji: string; text: string } {
  const hasCritical = blocking.some((b) => b.severity === "block_critical");
  switch (gate) {
    case "ready":
      return { emoji: "🟢", text: "Prêt à envoyer" };
    case "warning":
      return { emoji: "🟡", text: "À vérifier" };
    case "blocked":
      if (hasCritical) {
        return {
          emoji: "🔴",
          text: "Incomplet — identité ou adresse à corriger",
        };
      }
      return { emoji: "🔴", text: "Incomplet — action requise" };
  }
}

function firstActionableHref(
  issues: ReadinessIssue[],
  couvertureBaseHref: string | null | undefined,
  reportSelfHref: string | null | undefined,
): string | null {
  for (const issue of issues) {
    const h = resolveIssueHref(issue, couvertureBaseHref, reportSelfHref);
    if (h) return h;
  }
  return null;
}

function resolveIssueHref(
  issue: ReadinessIssue,
  couvertureBaseHref: string | null | undefined,
  reportSelfHref: string | null | undefined,
): string | null {
  if (issue.focusPage === "report" && reportSelfHref?.trim() && issue.focusId) {
    return `${reportSelfHref.trim()}#${issue.focusId}`;
  }
  if (!couvertureBaseHref?.trim()) return null;
  if (issue.focusId) return `${couvertureBaseHref.trim()}#${issue.focusId}`;
  if (issue.code === "no_cover") return couvertureBaseHref.trim();
  return null;
}

function collectOrderedActionable(
  blocking: ReadinessIssue[],
  warnings: ReadinessIssue[],
  couvertureBaseHref: string | null | undefined,
  reportSelfHref: string | null | undefined,
): { issue: ReadinessIssue; href: string }[] {
  const out: { issue: ReadinessIssue; href: string }[] = [];
  for (const issue of [...blocking, ...warnings]) {
    const href = resolveIssueHref(issue, couvertureBaseHref, reportSelfHref);
    if (href) out.push({ issue, href });
  }
  return out;
}

export default function ReportReadinessCard({
  result,
  onAcknowledge,
  ackAt,
  compact,
  onFocusIssue,
  couvertureBaseHref,
  reportSelfHref,
  quickFixLabel = "Corriger les points importants",
  guidedMode = false,
  initialGuidedStepZero = null,
  onGuidedStepCommit,
}: {
  result: CoverReadinessResult;
  onAcknowledge?: () => void;
  ackAt?: string | null;
  compact?: boolean;
  /** Page couverture : scroll vers le bloc (ancre #resume-*). */
  onFocusIssue?: (issue: ReadinessIssue) => void;
  /** Liens vers `/rapport/couverture?...` */
  couvertureBaseHref?: string | null;
  /** Page rapport courante : ancres `#report-photos-zone`, etc. */
  reportSelfHref?: string | null;
  /** Page rapport : libellé du bouton d’action rapide (masqué si `onFocusIssue` est défini). */
  quickFixLabel?: string;
  /** Page rapport : étapes numérotées + bandeau « mode guidé ». */
  guidedMode?: boolean;
  /** Index 0-based depuis `?fixStep=` (page rapport). */
  initialGuidedStepZero?: number | null;
  /** Synchronise l’URL quand l’utilisateur change d’étape (prev/next). */
  onGuidedStepCommit?: (stepZero: number) => void;
}) {
  const { gate, score, blocking, warnings, staleAck } = result;
  const hasCriticalBlocking = blocking.some((b) => b.severity === "block_critical");
  const head = decisionHeadline(gate, blocking);
  const riskLines = readinessRiskLinesFr(warnings);

  const orderedActionable = useMemo(
    () => collectOrderedActionable(blocking, warnings, couvertureBaseHref, reportSelfHref),
    [blocking, warnings, couvertureBaseHref, reportSelfHref],
  );

  const [guidedStep, setGuidedStep] = useState(0);
  const guidedFingerprint = `${blocking.map((b) => b.code).join(",")}|${warnings.map((w) => w.code).join(",")}`;
  useEffect(() => {
    const id = window.setTimeout(() => {
      const max = Math.max(0, orderedActionable.length - 1);
      if (initialGuidedStepZero != null && Number.isFinite(initialGuidedStepZero)) {
        setGuidedStep(Math.min(Math.max(0, initialGuidedStepZero), max));
      } else {
        setGuidedStep(0);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [guidedFingerprint, initialGuidedStepZero, orderedActionable.length]);

  const showGuided = !!(guidedMode && !onFocusIssue && orderedActionable.length > 1);
  const safeStep = Math.min(guidedStep, Math.max(0, orderedActionable.length - 1));

  /** Codes d’enjeux ouverts depuis cette session (feedback optimiste jusqu’au refresh serveur). */
  const [peekedCodes, setPeekedCodes] = useState<Set<string>>(() => new Set());
  const markStepPeeked = useCallback((code: string) => {
    setPeekedCodes((prev) => new Set(prev).add(code));
  }, []);

  const markStepOpened = useCallback((code: string, from: ReadinessStepOpenedFrom) => {
    emitProductEvent("readiness_step_opened", { code, from });
    markStepPeeked(code);
  }, [markStepPeeked]);

  useEffect(() => {
    const valid = new Set([...blocking, ...warnings].map((x) => x.code));
    const id = window.setTimeout(() => {
      setPeekedCodes((prev) => {
        const next = new Set([...prev].filter((c) => valid.has(c)));
        return next.size === prev.size && [...next].every((c) => prev.has(c)) ? prev : next;
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [blocking, warnings]);

  const firstFixHref =
    gate === "blocked" || gate === "warning"
      ? firstActionableHref(
          gate === "blocked" ? blocking : warnings,
          couvertureBaseHref,
          reportSelfHref,
        ) ?? firstActionableHref(warnings, couvertureBaseHref, reportSelfHref)
      : null;

  const renderIssueLine = (
    issue: ReadinessIssue,
    variant: "block" | "warn",
    stepNumber?: number,
    stepPeeked?: boolean,
  ) => {
    const href = resolveIssueHref(issue, couvertureBaseHref, reportSelfHref);
    const useScroll =
      !!(
        onFocusIssue &&
        issue.focusId &&
        issue.focusPage !== "report"
      );
    const isCritical = issue.severity === "block_critical";
    const body = (
      <span
        className={
          variant === "block"
            ? "text-left underline decoration-slate-400 decoration-dotted underline-offset-2"
            : ""
        }
      >
        {variant === "block" && isCritical ? (
          <span className="mr-1 font-semibold text-rose-900" title="Priorité élevée">
            ‼
          </span>
        ) : null}
        {issue.messageFr}
      </span>
    );
    return (
      <li key={issue.code} className="flex items-start gap-2">
        {guidedMode && stepNumber != null ? (
          <span
            className={`mt-0.5 w-6 shrink-0 tabular-nums font-bold ${
              variant === "block" ? "text-red-900" : "text-amber-950"
            }`}
            aria-hidden
          >
            {stepNumber}.
          </span>
        ) : (
          <span
            className={
              variant === "block" ? "mt-0.5 text-red-800" : "mt-0.5 text-amber-900"
            }
            aria-hidden
          >
            →
          </span>
        )}
        {useScroll ? (
          <button
            type="button"
            className={
              variant === "block"
                ? "font-medium text-red-950 hover:text-red-800"
                : "text-left font-medium text-amber-950 hover:text-amber-900"
            }
            onClick={() => {
              markStepOpened(issue.code, "list");
              onFocusIssue!(issue);
            }}
          >
            {body}
          </button>
        ) : href ? (
          <Link
            className={
              variant === "block"
                ? "font-medium text-red-950 hover:text-red-800"
                : "text-left font-medium text-amber-950 hover:text-amber-900"
            }
            href={href}
            onClick={() => markStepOpened(issue.code, "list")}
          >
            {body}
          </Link>
        ) : (
          <span
            className={variant === "block" ? "font-medium" : "font-medium text-amber-950"}
          >
            {issue.messageFr}
          </span>
        )}
        {stepPeeked ? (
          <span
            className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
            title="Ouvert — la liste se mettra à jour au prochain rafraîchissement"
          >
            ✓
          </span>
        ) : null}
      </li>
    );
  };

  return (
    <div
      className={`rounded-xl border px-4 py-3 text-sm ${gateStyle(gate, hasCriticalBlocking)}`}
      role="region"
      aria-label="Préparation du rapport"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-lg font-bold tracking-tight">
            <span aria-hidden>{head.emoji}</span> {head.text}
          </p>
          <p className="mt-0.5 text-xs opacity-80">
            Score technique : <span className="font-semibold tabular-nums">{score}</span>/100 — indicatif
          </p>
        </div>
      </div>

      {staleAck && ackAt ? (
        <div
          className="mt-3 rounded-lg border border-amber-300 bg-amber-100/80 px-3 py-2 text-xs font-medium text-amber-950"
          role="status"
        >
          ⚠️ Le rapport a été modifié depuis la validation du{" "}
          {new Date(ackAt).toLocaleString("fr-CA")}. Vérifiez à nouveau avant export ou
          accusez réception sur la couverture si tout est à jour.
        </div>
      ) : null}

      {blocking.length > 0 ? (
        <ul className={`mt-3 space-y-1.5 ${compact ? "text-xs" : ""}`}>
          {blocking.map((b, i) =>
            renderIssueLine(
              b,
              "block",
              guidedMode ? i + 1 : undefined,
              peekedCodes.has(b.code),
            ),
          )}
        </ul>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-medium opacity-90">
            {gate === "ready" ? "Rappels (non bloquants)" : "Points à confirmer"}
          </p>
          <ul className={`mt-1 space-y-1.5 opacity-95 ${compact ? "text-xs" : ""}`}>
            {warnings.map((w, i) =>
              renderIssueLine(
                w,
                "warn",
                guidedMode ? blocking.length + i + 1 : undefined,
                peekedCodes.has(w.code),
              ),
            )}
          </ul>
          {riskLines.length > 0 ? (
            <div className="mt-3 rounded-lg border border-black/10 bg-white/50 px-3 py-2 text-xs leading-snug text-slate-800">
              <p className="font-semibold text-slate-900">Risque si envoyé tel quel</p>
              <ul className="mt-1 list-inside list-disc space-y-1">
                {riskLines.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {firstFixHref && (gate === "blocked" || gate === "warning") && !onFocusIssue ? (
        <div className="mt-3">
          <Link
            href={firstFixHref}
            className="inline-flex rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={() => {
              const c = orderedActionable[0]?.issue.code;
              if (c) markStepOpened(c, "cta");
            }}
          >
            {quickFixLabel}
          </Link>
        </div>
      ) : null}

      {showGuided ? (
        <div className="mt-3 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-xs text-slate-800 shadow-sm">
          <p className="font-semibold text-slate-900">Mode guidé</p>
          <p className="mt-1 leading-snug">
            Étape {safeStep + 1} sur {orderedActionable.length} —{" "}
            <span className="font-medium">{orderedActionable[safeStep]?.issue.messageFr}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Link
              href={orderedActionable[safeStep]!.href}
              className="inline-flex rounded-md bg-blue-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-900"
              onClick={() =>
                markStepOpened(orderedActionable[safeStep]!.issue.code, "guided")
              }
            >
              Ouvrir cette étape
            </Link>
            {safeStep > 0 ? (
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  const next = Math.max(0, safeStep - 1);
                  setGuidedStep(next);
                  onGuidedStepCommit?.(next);
                }}
              >
                ← Précédent
              </button>
            ) : null}
            {safeStep < orderedActionable.length - 1 ? (
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                onClick={() => {
                  const next = Math.min(orderedActionable.length - 1, safeStep + 1);
                  setGuidedStep(next);
                  onGuidedStepCommit?.(next);
                }}
              >
                Suivant →
              </button>
            ) : null}
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            Après correction, revenez sur cette page : le bandeau se met à jour au prochain chargement.
            L’étape est mémorisée dans l’URL (<code className="rounded bg-slate-100 px-0.5">?fixStep=</code>
            ).
          </p>
        </div>
      ) : null}

      {gate === "warning" && onAcknowledge ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            onClick={onAcknowledge}
          >
            Tout est bon — j’ai relu
          </button>
          {ackAt ? (
            <span className="text-xs opacity-80">
              Accusé enregistré : {new Date(ackAt).toLocaleString("fr-CA")}
            </span>
          ) : (
            <span className="text-xs opacity-80">
              Accuse réception pour lever les avertissements restants.
            </span>
          )}
        </div>
      ) : null}
      {gate === "ready" && ackAt ? (
        <p className="mt-2 text-xs opacity-80">
          Validation enregistrée : {new Date(ackAt).toLocaleString("fr-CA")}
        </p>
      ) : null}
    </div>
  );
}
