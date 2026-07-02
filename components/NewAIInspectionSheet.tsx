"use client";



import { useCallback, useState } from "react";

import { useRouter } from "next/navigation";



import DocumentIntakeReview from "@/components/DocumentIntakeReview";

import InspectionDocumentUpload, {

  type ParsedDocumentMeta,

} from "@/components/InspectionDocumentUpload";

import {

  buildDocumentIntakePayload,

  type DocumentIntelligenceResult,

} from "@/lib/document-intelligence";



type Props = {

  open: boolean;

  onClose: () => void;

  accessToken: string | null;

  devDashboardMode?: boolean;

};



type Step = "choose" | "upload-dv" | "upload-email" | "review" | "manual";



function buildAiInspectionUrl(reportId: string, token: string): string {

  const qs = new URLSearchParams({

    inspection_id: reportId,

    reportId,

  });

  if (token) qs.set("token", token);

  return `/inspection/ai?${qs.toString()}`;

}



export default function NewAIInspectionSheet({

  open,

  onClose,

  accessToken,

  devDashboardMode = false,

}: Props) {

  const router = useRouter();

  const [step, setStep] = useState<Step>("choose");

  const [clientName, setClientName] = useState("");

  const [address, setAddress] = useState("");

  const [inspectionType, setInspectionType] = useState("residential");

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const [parsedDocument, setParsedDocument] = useState<ParsedDocumentMeta | null>(null);

  const [parsedAnalysis, setParsedAnalysis] = useState<DocumentIntelligenceResult | null>(null);
  const [needsReview, setNeedsReview] = useState(false);



  const reset = useCallback(() => {

    setStep("choose");

    setClientName("");

    setAddress("");

    setInspectionType("residential");

    setError(null);

    setParsedDocument(null);

    setParsedAnalysis(null);

    setNeedsReview(false);

  }, []);



  const handleClose = useCallback(() => {

    if (busy) return;

    reset();

    onClose();

  }, [busy, onClose, reset]);



  const createInspection = useCallback(

    async (opts: {

      clientName: string;

      address: string;

      inspectionType: string;

      document?: ParsedDocumentMeta | null;

      analysis?: DocumentIntelligenceResult | null;

    }) => {

      const useDevApi = devDashboardMode && !accessToken?.trim();

      if (!useDevApi && !accessToken?.trim()) {

        setError("Connectez-vous pour créer une inspection.");

        return false;

      }

      setBusy(true);

      setError(null);

      try {

        const endpoint = useDevApi

          ? "/api/dev/create-test-inspection"

          : "/api/inspector/create-inspection";

        const headers: Record<string, string> = {

          "Content-Type": "application/json",

        };

        if (!useDevApi && accessToken?.trim()) {

          headers.Authorization = `Bearer ${accessToken.trim()}`;

        }



        const bodyPayload: Record<string, unknown> = {

          clientName: opts.clientName,

          address: opts.address,

          inspectionType: opts.inspectionType,

        };

        if (opts.document && opts.analysis) {

          bodyPayload.document_intake_v1 = buildDocumentIntakePayload(opts.analysis, opts.document);

        }



        const res = await fetch(endpoint, {

          method: "POST",

          headers,

          body: JSON.stringify(bodyPayload),

        });

        const body = (await res.json().catch(() => null)) as {

          success?: boolean;

          reportId?: string;

          inspection_id?: string;

          token?: string;

          reportUrl?: string;

          error?: string;

        } | null;

        const reportId = body?.reportId ?? body?.inspection_id;

        if (!res.ok || !body?.success || !reportId) {

          setError(body?.error ?? "Impossible de créer l'inspection.");

          return false;

        }

        const tokenMatch = body.reportUrl?.match(/[?&]token=([^&]+)/);

        const token =

          (typeof body.token === "string" ? body.token : "") ||

          (tokenMatch?.[1] ? decodeURIComponent(tokenMatch[1]) : "");

        reset();

        onClose();

        router.push(buildAiInspectionUrl(reportId, token));

        return true;

      } catch {

        setError("Erreur réseau. Réessayez.");

        return false;

      } finally {

        setBusy(false);

      }

    },

    [accessToken, devDashboardMode, onClose, reset, router],

  );



  const handleSubmitManual = useCallback(

    async (e: React.FormEvent) => {

      e.preventDefault();

      await createInspection({ clientName, address, inspectionType });

    },

    [address, clientName, createInspection, inspectionType],

  );



  const handleParsed = useCallback(
    (result: {
      document: ParsedDocumentMeta;
      analysis: DocumentIntelligenceResult;
      needsReview: boolean;
    }) => {
      setParsedDocument(result.document);
      setParsedAnalysis(result.analysis);
      setNeedsReview(result.needsReview);
      setStep("review");
    },
    [],
  );



  if (!open) return null;



  return (

    <div

      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"

      role="dialog"

      aria-modal="true"

      aria-labelledby="new-ai-inspection-title"

    >

      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">

        <h2 id="new-ai-inspection-title" className="text-xl font-bold text-slate-900">

          {step === "choose" ? "Préparer une nouvelle inspection" : "Nouvelle inspection IA"}

        </h2>



        {step === "choose" ? (

          <div className="mt-6 space-y-3">

            <p className="text-sm text-slate-600">

              Importez les documents disponibles — InspectFlow prépare la propriété, les contacts et

              les points à vérifier.

            </p>

            <button

              type="button"

              onClick={() => setStep("upload-dv")}

              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-violet-200 bg-violet-50 px-4 text-base font-semibold text-violet-900 hover:bg-violet-100"

            >

              📄 Importer Déclaration vendeur (PDF)

            </button>

            <button

              type="button"

              onClick={() => setStep("upload-email")}

              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-800 hover:bg-slate-50"

            >

              📧 Importer courriel client/courtier

            </button>

            <button

              type="button"

              onClick={() => setStep("manual")}

              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-base font-medium text-slate-700 hover:bg-slate-50"

            >

              ✏️ Remplir manuellement

            </button>

            <button

              type="button"

              onClick={handleClose}

              className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl px-4 text-base font-medium text-slate-500"

            >

              Annuler

            </button>

          </div>

        ) : null}



        {step === "upload-dv" ? (

          <div className="mt-6">

            <InspectionDocumentUpload

              kind="dv_pdf"

              title="Déclaration du vendeur"

              hint="PDF ou image scannée. Analyse locale — aucune clé OpenAI requise."

              accept=".pdf,application/pdf,image/jpeg,image/png,image/webp"

              accessToken={accessToken}

              onParsed={handleParsed}

              onCancel={() => setStep("choose")}

            />

          </div>

        ) : null}



        {step === "upload-email" ? (

          <div className="mt-6">

            <InspectionDocumentUpload

              kind="email"

              title="Courriel client ou courtier"

              hint="PDF, courriel (.eml), texte ou document client"

              accept=".pdf,.eml,.txt,application/pdf,message/rfc822,text/plain"

              accessToken={accessToken}

              onParsed={handleParsed}

              onCancel={() => setStep("choose")}

            />

          </div>

        ) : null}



        {step === "review" && parsedDocument && parsedAnalysis ? (

          <div className="mt-6">

            <DocumentIntakeReview
              document={parsedDocument}
              analysis={parsedAnalysis}
              needsReview={needsReview}
              busy={busy}

              onConfirm={(prefill) =>

                void createInspection({

                  clientName: prefill.clientName,

                  address: prefill.address,

                  inspectionType: prefill.inspectionType,

                  document: prefill.document,

                  analysis: prefill.analysis,

                })

              }

              onEditManual={(prefill) => {

                setClientName(prefill.clientName);

                setAddress(prefill.address);

                setInspectionType(prefill.inspectionType || "residential");

                setStep("manual");

              }}

              onIgnore={() => {

                setParsedDocument(null);

                setParsedAnalysis(null);

                setNeedsReview(false);

                setStep("choose");

              }}

            />

          </div>

        ) : null}



        {step === "manual" ? (

          <form onSubmit={(e) => void handleSubmitManual(e)} className="mt-6 space-y-4">

            <p className="text-sm text-slate-600">

              Saisie manuelle — mode vocal et photos disponibles après création.

            </p>

            <div>

              <label htmlFor="ai-ni-address" className="block text-sm font-medium text-slate-700">

                Adresse

              </label>

              <input

                id="ai-ni-address"

                type="text"

                required

                value={address}

                onChange={(e) => setAddress(e.target.value)}

                placeholder="123 rue Exemple, Montréal"

                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-base"

                autoComplete="street-address"

              />

            </div>

            <div>

              <label htmlFor="ai-ni-client" className="block text-sm font-medium text-slate-700">

                Client

              </label>

              <input

                id="ai-ni-client"

                type="text"

                required

                value={clientName}

                onChange={(e) => setClientName(e.target.value)}

                placeholder="Jean Dupont"

                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-base"

                autoComplete="name"

              />

            </div>

            <div>

              <label htmlFor="ai-ni-type" className="block text-sm font-medium text-slate-700">

                Type de bâtiment

              </label>

              <select

                id="ai-ni-type"

                value={inspectionType}

                onChange={(e) => setInspectionType(e.target.value)}

                className="mt-1 w-full min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-base"

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

            <div className="flex flex-col gap-2 pt-2">

              <button

                type="submit"

                disabled={busy}

                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-violet-600 px-4 text-base font-semibold text-white hover:bg-violet-700 disabled:opacity-60"

              >

                {busy ? "Création…" : "Commencer en mode IA"}

              </button>

              <button

                type="button"

                disabled={busy}

                onClick={() => setStep("choose")}

                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 px-4 text-base font-medium text-slate-700"

              >

                Retour

              </button>

            </div>

          </form>

        ) : null}



        {step !== "manual" && error ? (

          <p className="mt-4 text-sm font-medium text-red-700" role="alert">

            {error}

          </p>

        ) : null}

      </div>

    </div>

  );

}


