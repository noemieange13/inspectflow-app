"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import DocumentIntakeReview from "@/components/DocumentIntakeReview";
import MultiDocumentIntakeUpload from "@/components/MultiDocumentIntakeUpload";
import type { ParsedDocumentMeta } from "@/components/InspectionDocumentUpload";
import {
  buildDocumentIntakePayload,
  buildMultiDocumentIntakePayload,
  type DocumentIntelligenceResult,
} from "@/lib/document-intelligence";
import {
  applyConfirmedFusionFields,
  buildDocumentFusionPayload,
  type DocumentFusionV1,
} from "@/lib/documentFusionEngine";
import {
  CREATION_METHOD_COPY,
  INSPECTION_FORM_INPUT_CLASS,
  INSPECTION_FORM_SELECT_CLASS,
  readPreferredCreationMethod,
  setCreationMethodRemembered,
  shouldSkipCreationMethodStep,
  type InspectorCreationMethod,
} from "@/lib/inspectorCreationMethod";
import type { DefaultReportPreferences } from "@/lib/inspectorProfile";
import { queuePilotObservation } from "@/lib/stevePilotObservability";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import {
  resolveCreateInspectionAuthError,
  resolveCreateInspectionError,
} from "@/lib/documentIntakeErrors";
import { persistOfflineInspectionClientSide } from "@/lib/devOffline/clientStore";
import type { DevOfflineInspection } from "@/lib/devOffline/types";
import {
  normalizeInspectorWorkflowMode,
  setWorkflowChoiceRemembered,
  shouldSkipWorkflowChoiceStep,
  WORKFLOW_CHOICE_COPY,
  type InspectorWorkflowMode,
} from "@/lib/inspectorWorkflow";

type Props = {
  open: boolean;
  onClose: () => void;
  accessToken: string | null;
  devDashboardMode?: boolean;
};

type Step = "workflow" | "creation" | "import" | "review" | "manual";

function resolveInitialStep(input: {
  workflow: InspectorWorkflowMode;
  creationMethod: InspectorCreationMethod;
}): Step {
  if (!shouldSkipWorkflowChoiceStep(input.workflow)) return "workflow";
  if (!shouldSkipCreationMethodStep(input.creationMethod)) return "creation";
  return input.creationMethod === "document_import" ? "import" : "manual";
}

export default function NewInspectionSheet({
  open,
  onClose,
  accessToken,
  devDashboardMode = false,
}: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("workflow");
  const [workflowMode, setWorkflowMode] = useState<InspectorWorkflowMode>("field_assistant");
  const [creationMethod, setCreationMethod] =
    useState<InspectorCreationMethod>("document_import");
  const [rememberWorkflow, setRememberWorkflow] = useState(true);
  const [rememberCreationMethod, setRememberCreationMethod] = useState(true);
  const [clientName, setClientName] = useState("");
  const [address, setAddress] = useState("");
  const [inspectionType, setInspectionType] = useState("residential");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedDocuments, setParsedDocuments] = useState<ParsedDocumentMeta[]>([]);
  const [parsedDocument, setParsedDocument] = useState<ParsedDocumentMeta | null>(null);
  const [parsedAnalysis, setParsedAnalysis] = useState<DocumentIntelligenceResult | null>(null);
  const [fusionResult, setFusionResult] = useState<DocumentFusionV1 | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [prefillDebug, setPrefillDebug] = useState<{ missingReasons: string[] } | undefined>();

  const workflowCopy = WORKFLOW_CHOICE_COPY.fr;
  const creationCopy = CREATION_METHOD_COPY.fr;

  useEffect(() => {
    if (!open) return;
    const useDevApi = devDashboardMode && !accessToken?.trim();
    if (!useDevApi && !accessToken?.trim()) return;
    let cancelled = false;
    const headers: Record<string, string> = {};
    if (!useDevApi && accessToken?.trim()) {
      headers.Authorization = `Bearer ${accessToken.trim()}`;
    }
    void fetch("/api/inspector-profile", { headers })
      .then((res) => res.json())
      .then(
        (body: {
          profile?: {
            preferred_workflow?: string;
            default_report_preferences?: DefaultReportPreferences | null;
          } | null;
        }) => {
          if (cancelled) return;
          const workflow = normalizeInspectorWorkflowMode(body.profile?.preferred_workflow);
          const method = readPreferredCreationMethod(body.profile?.default_report_preferences);
          setWorkflowMode(workflow);
          setCreationMethod(method);
          setStep(resolveInitialStep({ workflow, creationMethod: method }));
        },
      )
      .catch(() => {
        if (!cancelled) setStep("workflow");
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, devDashboardMode, open]);

  const reset = useCallback(() => {
    setStep("workflow");
    setWorkflowMode("field_assistant");
    setCreationMethod("document_import");
    setRememberWorkflow(true);
    setRememberCreationMethod(true);
    setClientName("");
    setAddress("");
    setInspectionType("residential");
    setParsedDocument(null);
    setParsedDocuments([]);
    setParsedAnalysis(null);
    setFusionResult(null);
    setNeedsReview(false);
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, onClose, reset]);

  const saveProfilePreferences = useCallback(async () => {
    const useDevApi = devDashboardMode && !accessToken?.trim();
    const token = accessToken?.trim();
    if (!useDevApi && !token) return;
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (!useDevApi && token) headers.Authorization = `Bearer ${token}`;
      const profileRes = await fetch("/api/inspector-profile", {
        headers: useDevApi ? {} : { Authorization: `Bearer ${token}` },
      });
      const profileBody = (await profileRes.json().catch(() => null)) as {
        profile?: Record<string, unknown> | null;
      } | null;
      const current = profileBody?.profile ?? {};
      const existingPrefs =
        current.default_report_preferences &&
        typeof current.default_report_preferences === "object"
          ? (current.default_report_preferences as Record<string, unknown>)
          : {};
      const nextPrefs: Record<string, unknown> = { ...existingPrefs };
      if (rememberCreationMethod) {
        nextPrefs.preferred_creation_method = creationMethod;
      }
      await fetch("/api/inspector-profile", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          ...current,
          ...(rememberWorkflow ? { preferred_workflow: workflowMode } : {}),
          default_report_preferences: nextPrefs,
        }),
      });
      if (rememberWorkflow) setWorkflowChoiceRemembered(true);
      if (rememberCreationMethod) setCreationMethodRemembered(true);
      else setCreationMethodRemembered(false);
    } catch {
      /* non-blocking */
    }
  }, [
    accessToken,
    creationMethod,
    devDashboardMode,
    rememberCreationMethod,
    rememberWorkflow,
    workflowMode,
  ]);

  const createInspection = useCallback(
    async (opts: {
      clientName: string;
      address: string;
      inspectionType: string;
      document?: ParsedDocumentMeta | null;
      documents?: ParsedDocumentMeta[];
      analysis?: DocumentIntelligenceResult | null;
      fusion?: DocumentFusionV1 | null;
    }) => {
      const useDevApi = devDashboardMode && !accessToken?.trim();
      if (!useDevApi && !accessToken?.trim()) {
        setError(resolveCreateInspectionAuthError());
        return false;
      }
      setBusy(true);
      setError(null);
      try {
        await saveProfilePreferences();
        const bodyPayload: Record<string, unknown> = {
          clientName: opts.clientName.trim() || "Client",
          address: opts.address.trim(),
          inspectionType: opts.inspectionType,
          workflowMode,
        };
        if (opts.fusion && opts.documents && opts.analysis) {
          const confirmedFusion = applyConfirmedFusionFields(opts.fusion, {
            clientName: opts.clientName.trim() || "Client",
            address: opts.address.trim(),
            inspectionType: opts.inspectionType,
            brokerName: opts.analysis.people.broker ?? undefined,
          });
          bodyPayload.document_fusion_v1 = buildDocumentFusionPayload(
            confirmedFusion,
            opts.documents.map((d) => ({
              id: d.id,
              fileName: d.fileName,
              mimeType: d.mimeType,
              document_type: d.document_type,
            })),
          );
          bodyPayload.document_intake_v1 = buildMultiDocumentIntakePayload(
            opts.analysis,
            opts.documents,
          );
        } else if (opts.document && opts.analysis) {
          bodyPayload.document_intake_v1 = buildDocumentIntakePayload(
            opts.analysis,
            opts.document,
          );
        }
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (!useDevApi && accessToken?.trim()) {
          headers.Authorization = `Bearer ${accessToken.trim()}`;
        }
        const res = await fetch("/api/inspector/create-inspection", {
          method: "POST",
          headers,
          body: JSON.stringify(bodyPayload),
        });
        const body = (await res.json().catch(() => null)) as {
          success?: boolean;
          reportUrl?: string;
          error?: string;
          offline_dev?: boolean;
          inspection?: DevOfflineInspection;
        } | null;
        if (!res.ok || !body?.success || !body.reportUrl) {
          setError(
            resolveCreateInspectionError({
              status: res.status,
              error: body?.error,
            }),
          );
          return false;
        }
        if (body.offline_dev && body.inspection) {
          persistOfflineInspectionClientSide(body.inspection);
        }
        if (opts.fusion && opts.documents && opts.documents.length > 0) {
          queuePilotObservation("documents_imported", {
            doc_count: opts.documents.length,
            multi: true,
          });
        } else if (opts.document && opts.analysis) {
          queuePilotObservation("documents_imported", { doc_count: 1, multi: false });
        }
        reset();
        onClose();
        router.push(body.reportUrl);
        return true;
      } catch {
        setError(resolveCreateInspectionError({}));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [accessToken, devDashboardMode, onClose, reset, router, saveProfilePreferences, workflowMode],
  );

  const handleSubmitManual = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      await createInspection({
        clientName: clientName.trim() || "Client",
        address,
        inspectionType,
      });
    },
    [address, clientName, createInspection, inspectionType],
  );

  const handleFused = useCallback(
    (result: {
      fusion: DocumentFusionV1;
      documents: ParsedDocumentMeta[];
      analysis: DocumentIntelligenceResult;
      needsReview: boolean;
      prefillDebug?: { missingReasons: string[] };
    }) => {
      setFusionResult(result.fusion);
      setParsedDocuments(result.documents);
      setParsedDocument(result.documents[0] ?? null);
      setParsedAnalysis(result.analysis);
      setNeedsReview(result.needsReview);
      setPrefillDebug(result.prefillDebug);
      const prefill = resolveDocumentIntakePrefill(result.analysis, result.fusion);
      setClientName(prefill.clientName);
      setAddress(prefill.address);
      setInspectionType(prefill.inspectionType || "residential");
      setStep("review");
    },
    [],
  );

  const goToCreationStep = useCallback(() => {
    if (shouldSkipCreationMethodStep(creationMethod)) {
      setStep(creationMethod === "document_import" ? "import" : "manual");
    } else {
      setStep("creation");
    }
  }, [creationMethod]);

  const changeMethodButton = (
    <button
      type="button"
      onClick={() => setStep("creation")}
      className="text-sm font-medium text-blue-600 underline hover:text-blue-800"
    >
      {creationCopy.changeMethod}
    </button>
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-inspection-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="new-inspection-title" className="text-xl font-bold text-slate-900">
          Nouvelle inspection
        </h2>

        {step === "workflow" ? (
          <div className="mt-6 space-y-4">
            <p className="text-base font-medium text-slate-900">{workflowCopy.title}</p>
            <button
              type="button"
              onClick={() => setWorkflowMode("field_assistant")}
              className={`relative w-full rounded-2xl border p-4 text-left transition ${
                workflowMode === "field_assistant"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="mb-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                {workflowCopy.recommendedBadge}
              </span>
              <p className="text-base font-bold text-slate-900">📷 {workflowCopy.fieldTitle}</p>
              <p className="mt-1 text-sm text-slate-600">{workflowCopy.fieldDesc}</p>
            </button>
            <button
              type="button"
              onClick={() => setWorkflowMode("post_inspection")}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                workflowMode === "post_inspection"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="text-base font-bold text-slate-900">📁 {workflowCopy.postTitle}</p>
              <p className="mt-1 text-sm text-slate-600">{workflowCopy.postDesc}</p>
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rememberWorkflow}
                onChange={(e) => setRememberWorkflow(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {workflowCopy.remember}
            </label>
            <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
              <button
                type="button"
                onClick={goToCreationStep}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700"
              >
                Continuer
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : null}

        {step === "creation" ? (
          <div className="mt-6 space-y-4">
            <p className="text-base font-medium text-slate-900">{creationCopy.title}</p>
            <button
              type="button"
              onClick={() => {
                setCreationMethod("document_import");
                setStep("import");
              }}
              className={`relative w-full rounded-2xl border p-4 text-left transition ${
                creationMethod === "document_import"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <span className="mb-2 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                {creationCopy.importBadge}
              </span>
              <p className="text-base font-bold text-slate-900">
                📧 {creationCopy.importTitle}
              </p>
              <p className="mt-1 text-sm text-slate-600">{creationCopy.importDesc}</p>
            </button>
            <button
              type="button"
              onClick={() => {
                setCreationMethod("manual");
                setStep("manual");
              }}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                creationMethod === "manual"
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className="text-base font-bold text-slate-900">
                ✏️ {creationCopy.manualTitle}
              </p>
              <p className="mt-1 text-sm text-slate-600">{creationCopy.manualDesc}</p>
            </button>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rememberCreationMethod}
                onChange={(e) => setRememberCreationMethod(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              {creationCopy.remember}
            </label>
            <button
              type="button"
              onClick={() =>
                setStep(shouldSkipWorkflowChoiceStep(workflowMode) ? "creation" : "workflow")
              }
              className="text-sm text-slate-500 underline"
            >
              Retour
            </button>
          </div>
        ) : null}

        {step === "import" ? (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-slate-600">{creationCopy.subtitle}</p>
            {!accessToken?.trim() ? (
              <p className="text-xs text-slate-500">
                Vous pouvez analyser les documents sans connexion. La connexion sera demandée
                uniquement pour commencer l&apos;inspection.
              </p>
            ) : null}
            {changeMethodButton}
            <MultiDocumentIntakeUpload
              accessToken={accessToken}
              onFused={handleFused}
              onCancel={() => setStep("creation")}
            />
          </div>
        ) : null}

        {step === "review" && parsedDocument && parsedAnalysis ? (
          <div className="mt-6 space-y-3">
            {changeMethodButton}
            <DocumentIntakeReview
              variant="steve"
              document={parsedDocument}
              analysis={parsedAnalysis}
              fusion={fusionResult}
              accessToken={accessToken}
              needsReview={needsReview}
              prefillDebug={prefillDebug}
              busy={busy}
              onConfirm={(prefill) =>
                void createInspection({
                  ...prefill,
                  documents: parsedDocuments.length > 0 ? parsedDocuments : undefined,
                  fusion: fusionResult,
                })
              }
              onEditManual={(prefill) => {
                setClientName(prefill.clientName);
                setAddress(prefill.address);
                setInspectionType(prefill.inspectionType || "residential");
                setStep("manual");
              }}
              onIgnore={() => setStep("import")}
            />
          </div>
        ) : null}

        {step === "manual" ? (
          <>
            <p className="mt-2 text-sm text-slate-600">{creationCopy.subtitle}</p>
            <div className="mt-2">{changeMethodButton}</div>
            <form onSubmit={(e) => void handleSubmitManual(e)} className="mt-4 space-y-4">
              <div>
                <label htmlFor="ni-address" className="block text-sm font-medium text-slate-700">
                  Adresse *
                </label>
                <input
                  id="ni-address"
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 rue Exemple, Montréal"
                  className={INSPECTION_FORM_INPUT_CLASS}
                  autoComplete="street-address"
                />
              </div>
              <div>
                <label htmlFor="ni-client" className="block text-sm font-medium text-slate-700">
                  Client
                </label>
                <input
                  id="ni-client"
                  type="text"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Jean Dupont"
                  className={INSPECTION_FORM_INPUT_CLASS}
                  autoComplete="name"
                />
              </div>
              <div>
                <label htmlFor="ni-type" className="block text-sm font-medium text-slate-700">
                  Type de bâtiment
                </label>
                <select
                  id="ni-type"
                  value={inspectionType}
                  onChange={(e) => setInspectionType(e.target.value)}
                  className={INSPECTION_FORM_SELECT_CLASS}
                >
                  <option value="residential">Résidentiel</option>
                  <option value="commercial">Commercial</option>
                  <option value="multiplex">Multiplex</option>
                  <option value="condo">Condominium</option>
                </select>
              </div>
              {error ? (
                <p className="text-sm font-medium text-red-700" role="alert">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-col gap-2 pt-2 sm:flex-row-reverse">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                >
                  {busy ? "Création…" : "Commencer l'inspection"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setStep(
                      shouldSkipWorkflowChoiceStep(workflowMode) ? "creation" : "workflow",
                    )
                  }
                  className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-700 hover:bg-slate-50"
                >
                  Retour
                </button>
              </div>
            </form>
          </>
        ) : null}

        {error && step !== "manual" ? (
          <p className="mt-4 text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
