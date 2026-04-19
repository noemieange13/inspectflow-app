"use client";

import Link from "next/link";
import { useMemo, useRef } from "react";

import ReportReadinessCard from "@/components/ReportReadinessCard";
import type { ReadinessIssue } from "@/lib/reportReadiness";
import {
  blockIaConfidence,
  confidenceLabelFr,
  type IaConfidenceLevel,
} from "@/lib/coverIaConfidence";
import {
  COMPLIANCE_LABELS,
  type ComplianceJurisdiction,
  type InspectionCoverPayloadV1,
  type InspectorProfileV1,
} from "@/lib/inspectionCoverPayload";
import {
  LIMITATION_CHECKLIST_DEFS,
  type LimitationChecklistId,
} from "@/lib/limitations";
import {
  resumeBlockStatus,
  statusLabel,
  type ResumeBlockStatus,
} from "@/lib/coverResumeBlockStatus";
import {
  effectiveDescriptionNarrative,
  formatProprieteUneLigne,
} from "@/lib/coverResumeFormat";
import { evaluateCoverReadiness } from "@/lib/reportReadiness";

const docTextarea =
  "mt-1 w-full rounded-lg border border-transparent bg-white/80 px-3 py-2.5 text-[15px] leading-relaxed text-slate-900 shadow-sm outline-none ring-slate-200 transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-2";

const subtle = "text-xs font-medium uppercase tracking-wide text-slate-500";

function IaConfidencePill({ level }: { level: IaConfidenceLevel | null }) {
  if (!level) return null;
  const dot = level === "high" ? "🟢" : level === "medium" ? "🟡" : "🔴";
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-800 ring-1 ring-slate-200">
      <span aria-hidden>{dot}</span>
      IA : {confidenceLabelFr(level)}
    </span>
  );
}

function StatusPill({ status }: { status: ResumeBlockStatus }) {
  const cls =
    status === "missing"
      ? "bg-red-100 text-red-900 ring-red-200"
      : status === "attention"
        ? "bg-amber-100 text-amber-950 ring-amber-200"
        : "bg-emerald-100 text-emerald-900 ring-emerald-200";
  const dot =
    status === "missing" ? "🔴" : status === "attention" ? "🟡" : "🟢";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ${cls}`}
    >
      <span aria-hidden>{dot}</span>
      {statusLabel(status)}
    </span>
  );
}

function AutoMagicBanner({ cover }: { cover: InspectionCoverPayloadV1 }) {
  const h = cover.ia_hints ?? {};
  const any =
    h.dv_photo_imported ||
    h.photos_description_imported ||
    h.photos_condition_imported;
  if (!any) return null;
  const parts: string[] = [];
  if (h.dv_photo_imported) parts.push("déclaration du vendeur");
  if (h.photos_description_imported) parts.push("photos (description)");
  if (h.photos_condition_imported) parts.push("photos (condition générale)");
  return (
    <div
      className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950"
      role="status"
    >
      <p className="font-semibold text-indigo-950">Contenu proposé automatiquement</p>
      <p className="mt-1 text-indigo-900/90">
        Rempli à partir de : {parts.join(" · ")}. Vérifiez les blocs marqués « À vérifier ».
      </p>
    </div>
  );
}

function DocBlock({
  kicker,
  status,
  iaConfidence,
  sectionId,
  children,
}: {
  kicker: string;
  status: ResumeBlockStatus;
  iaConfidence?: IaConfidenceLevel | null;
  /** Ancre pour « corriger en 1 clic » depuis la carte readiness (go 8). */
  sectionId?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={sectionId}
      className="scroll-mt-28 rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={subtle}>{kicker}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <IaConfidencePill level={iaConfidence ?? null} />
          <StatusPill status={status} />
        </div>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export type InspectionResumePanelProps = {
  data: InspectionCoverPayloadV1;
  profile: InspectorProfileV1 | null;
  reportId?: string;
  viewerToken?: string;
  reportHasPdf?: boolean;
  onChangeRequerants: (v: string) => void;
  onChangeProprieteField: (key: keyof InspectionCoverPayloadV1["propriete"], v: string) => void;
  onChangeCondition: (v: string) => void;
  onChangeGeneratedDescription: (v: string) => void;
  onComplianceNotesChange: (t: string) => void;
  onJurisdictionSelect: (j: ComplianceJurisdiction) => void;
  update: <K extends keyof InspectionCoverPayloadV1>(key: K, value: InspectionCoverPayloadV1[K]) => void;
  onOpenOutils: () => void;
  /** Imports inline (même pipeline que l’onglet Outils) */
  onPickDescriptionPhotos: () => void;
  onRunDescriptionFromPhotos: () => void;
  onDvFile: (f: File | null) => void;
  onTriggerNotesPhoto: () => void;
  onTriggerNotesAudio: () => void;
  terrainNoteText: string;
  onTerrainNoteText: (v: string) => void;
  onSubmitTerrainNotes: () => void;
  notesSubmitting: boolean;
  descriptionExtracting: boolean;
  dvLoading: boolean;
  onImproveDescription: () => void;
  onImproveCondition: () => void;
  aiImproveLoading: null | "description" | "condition";
  onAckReadiness: () => void;
  onFocusReadinessIssue: (issue: ReadinessIssue) => void;
  onChangeLimitationsFreeText: (v: string) => void;
  onBlurLimitationsFreeText?: () => void;
  onToggleLimitationChecklist: (id: LimitationChecklistId) => void;
  onSuggestLimitations: () => void;
};

export default function InspectionResumePanel({
  data,
  profile,
  reportId,
  viewerToken,
  reportHasPdf,
  onChangeRequerants,
  onChangeProprieteField,
  onChangeCondition,
  onChangeGeneratedDescription,
  onComplianceNotesChange,
  onJurisdictionSelect,
  update,
  onOpenOutils,
  onPickDescriptionPhotos,
  onRunDescriptionFromPhotos,
  onDvFile,
  onTriggerNotesPhoto,
  onTriggerNotesAudio,
  terrainNoteText,
  onTerrainNoteText,
  onSubmitTerrainNotes,
  notesSubmitting,
  descriptionExtracting,
  dvLoading,
  onImproveDescription,
  onImproveCondition,
  aiImproveLoading,
  onAckReadiness,
  onFocusReadinessIssue,
  onChangeLimitationsFreeText,
  onBlurLimitationsFreeText,
  onToggleLimitationChecklist,
  onSuggestLimitations,
}: InspectionResumePanelProps) {
  const proprieteLine = useMemo(() => formatProprieteUneLigne(data.propriete), [data.propriete]);
  const descriptionText = useMemo(() => effectiveDescriptionNarrative(data), [data]);

  const dvRef = useRef<HTMLInputElement>(null);

  const clientAny =
    data.propriete.client_nom.trim() ||
    data.propriete.client_telephone.trim() ||
    data.propriete.client_courriel.trim();

  const previewHref =
    reportId && viewerToken
      ? `/report/${encodeURIComponent(reportId)}?token=${encodeURIComponent(viewerToken)}`
      : null;

  const readiness = useMemo(() => evaluateCoverReadiness(data), [data]);

  return (
    <div className="space-y-6">
      <input
        ref={dvRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = "";
          void onDvFile(f);
        }}
      />

      <div className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/95 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
        <div className="min-w-0 flex-1 space-y-0.5 text-slate-800">
          <p className="truncate font-medium">
            {data.date_heure_affichage.trim() || "— date / heure —"}
            <span className="mx-2 text-slate-300">·</span>
            <span className="font-normal text-slate-600">
              {data.conditions_meteo.trim() || "météo non renseignée"}
            </span>
          </p>
          <p className="truncate text-xs text-slate-600">
            {data.propriete.adresse.trim() || "Adresse — importez une DV ou saisissez ci-dessous."}
          </p>
          {reportHasPdf ? (
            <p className="text-xs font-medium text-emerald-800">
              Un PDF est déjà associé à ce rapport — ouvrez la prévisualisation pour le consulter ou le régénérer.
            </p>
          ) : previewHref ? (
            <p className="text-xs text-slate-500">
              Après les premiers enregistrements, générez le PDF depuis la page rapport.
            </p>
          ) : null}
        </div>
        {previewHref ? (
          <Link
            href={previewHref}
            className="shrink-0 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-800"
          >
            Prévisualiser le rapport
          </Link>
        ) : (
          <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500">
            Liez un rapport pour prévisualiser le PDF
          </span>
        )}
      </div>

      <AutoMagicBanner cover={data} />

      <ReportReadinessCard
        result={readiness}
        onAcknowledge={onAckReadiness}
        ackAt={data.readiness_ack_v1?.acknowledged_at ?? null}
        onFocusIssue={onFocusReadinessIssue}
        reportSelfHref={previewHref}
      />

      <p className="text-sm text-slate-600">
        Corrigez comme un document. Actions rapides ci-dessous — tout reste modifiable. Vue avancée :{" "}
        <button
          type="button"
          className="font-semibold text-blue-800 underline decoration-blue-300 underline-offset-2 hover:text-blue-950"
          onClick={onOpenOutils}
        >
          Outils &amp; imports
        </button>
        .
      </p>

      <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">
        <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500">
          Actions rapides
        </span>
        <button
          type="button"
          disabled={dvLoading}
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white disabled:opacity-50"
          onClick={() => dvRef.current?.click()}
        >
          {dvLoading ? "DV…" : "📄 Importer DV (photo)"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white"
          onClick={onPickDescriptionPhotos}
        >
          📸 Choisir photos
        </button>
        <button
          type="button"
          disabled={descriptionExtracting}
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white disabled:opacity-50"
          onClick={onRunDescriptionFromPhotos}
        >
          {descriptionExtracting ? "Analyse…" : "🔍 Remplir description"}
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white"
          onClick={onTriggerNotesPhoto}
        >
          📝 Photo de notes
        </button>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-white"
          onClick={onTriggerNotesAudio}
        >
          🎤 Mémo vocal
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3">
        <label className="text-xs font-semibold text-slate-600">Note rapide + envoi au rapport</label>
        <textarea
          className={`${docTextarea} mt-1 min-h-[72px]`}
          value={terrainNoteText}
          onChange={(e) => onTerrainNoteText(e.target.value)}
          placeholder="Texte court, puis « Envoyer » — même pipeline que l’onglet Outils."
        />
        <button
          type="button"
          disabled={notesSubmitting}
          className="mt-2 rounded-md bg-emerald-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          onClick={() => onSubmitTerrainNotes()}
        >
          {notesSubmitting ? "Envoi…" : "Envoyer au rapport"}
        </button>
      </div>

      <DocBlock
        kicker="Requérant"
        status={resumeBlockStatus("requerant", data)}
        iaConfidence={blockIaConfidence("requerant", data)}
        sectionId="resume-requerant"
      >
        <textarea
          className={docTextarea}
          rows={3}
          value={data.requerants}
          onChange={(e) => onChangeRequerants(e.target.value)}
          placeholder="ex. société acheteuse — souvent prérempli depuis la DV."
        />
      </DocBlock>

      <DocBlock
        kicker="Propriété inspectée"
        status={resumeBlockStatus("propriete", data)}
        iaConfidence={blockIaConfidence("propriete", data)}
        sectionId="resume-propriete"
      >
        <p className="mb-2 text-sm leading-relaxed text-slate-800">{proprieteLine || "—"}</p>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className={docTextarea}
            value={data.propriete.adresse}
            onChange={(e) => onChangeProprieteField("adresse", e.target.value)}
            placeholder="Adresse"
          />
          <input
            className={docTextarea}
            value={data.propriete.type_propriete}
            onChange={(e) => onChangeProprieteField("type_propriete", e.target.value)}
            placeholder="Type de propriété"
          />
          <input
            className={docTextarea}
            value={data.propriete.annee_construction}
            onChange={(e) => onChangeProprieteField("annee_construction", e.target.value)}
            placeholder="Année de construction"
          />
        </div>
      </DocBlock>

      <DocBlock
        kicker="Client (facultatif)"
        status={resumeBlockStatus("client", data)}
        sectionId="resume-client"
      >
        {!clientAny ? (
          <p className="mb-2 text-xs text-slate-500">Optionnel — la DV peut remplir ces champs.</p>
        ) : null}
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className={docTextarea}
            value={data.propriete.client_nom}
            onChange={(e) => onChangeProprieteField("client_nom", e.target.value)}
            placeholder="Nom"
          />
          <input
            className={docTextarea}
            value={data.propriete.client_telephone}
            onChange={(e) => onChangeProprieteField("client_telephone", e.target.value)}
            placeholder="Téléphone"
          />
          <input
            className={docTextarea}
            type="email"
            value={data.propriete.client_courriel}
            onChange={(e) => onChangeProprieteField("client_courriel", e.target.value)}
            placeholder="Courriel"
          />
        </div>
      </DocBlock>

      <DocBlock
        kicker="Description sommaire du bâtiment"
        status={resumeBlockStatus("description", data)}
        iaConfidence={blockIaConfidence("description", data)}
        sectionId="resume-description"
      >
        <textarea
          className={`${docTextarea} min-h-[140px]`}
          value={descriptionText}
          onChange={(e) => onChangeGeneratedDescription(e.target.value)}
          placeholder="Paragraphe unique — prérempli par les photos ou la grille dans Outils."
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={aiImproveLoading !== null}
            className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            onClick={onImproveDescription}
          >
            {aiImproveLoading === "description" ? "IA…" : "Améliorer avec l’IA"}
          </button>
        </div>
      </DocBlock>

      <DocBlock
        kicker="Condition générale du bâtiment"
        status={resumeBlockStatus("condition", data)}
        iaConfidence={blockIaConfidence("condition", data)}
        sectionId="resume-condition"
      >
        <textarea
          className={docTextarea}
          rows={8}
          value={data.condition_generale}
          onChange={(e) => onChangeCondition(e.target.value)}
          placeholder="Généré depuis les photos d’inspection — toujours modifiable."
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={aiImproveLoading !== null}
            className="rounded-md bg-violet-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
            onClick={onImproveCondition}
          >
            {aiImproveLoading === "condition" ? "IA…" : "Améliorer avec l’IA"}
          </button>
        </div>
      </DocBlock>

      <DocBlock
        kicker="Limitations de l’inspection"
        status={resumeBlockStatus("limitations", data)}
        sectionId="resume-limitations"
      >
        <p className="mb-2 text-xs text-slate-600">
          Obligatoire pour le Québec (profil QC). Coches + texte libre — des clauses types non modifiables sont ajoutées au PDF.
        </p>
        <div className="mb-3 space-y-2">
          {LIMITATION_CHECKLIST_DEFS.map((d) => (
            <label key={d.id} className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                className="mt-1 rounded border-slate-300"
                checked={data.limitations_checklist?.[d.id] === true}
                onChange={() => onToggleLimitationChecklist(d.id)}
              />
              <span>{d.labelFr}</span>
            </label>
          ))}
        </div>
        <textarea
          className={`${docTextarea} min-h-[100px]`}
          value={data.limitations_free_text ?? ""}
          onChange={(e) => onChangeLimitationsFreeText(e.target.value)}
          onBlur={() => onBlurLimitationsFreeText?.()}
          placeholder="Précisez le mandat, les zones non visitées, les systèmes non testés, etc."
        />
        <div className="mt-2">
          <button
            type="button"
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => onSuggestLimitations()}
          >
            Suggérer depuis météo / description
          </button>
        </div>
      </DocBlock>

      <DocBlock kicker="Orientation de la façade principale" status={resumeBlockStatus("orientation", data)}>
        <select
          className={`${docTextarea} cursor-pointer`}
          value={data.orientation_facade}
          onChange={(e) =>
            update(
              "orientation_facade",
              e.target.value as InspectionCoverPayloadV1["orientation_facade"],
            )
          }
        >
          <option value="">— préciser si besoin —</option>
          <option value="nord">Nord</option>
          <option value="sud">Sud</option>
          <option value="est">Est</option>
          <option value="ouest">Ouest</option>
        </select>
      </DocBlock>

      <DocBlock
        kicker="Inspecteur — rendu PDF"
        status={resumeBlockStatus("inspecteur", data)}
        sectionId="resume-inspecteur"
      >
        <div className="flex flex-wrap items-start gap-4">
          {profile?.logo_data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.logo_data_url}
              alt=""
              className="h-14 w-auto max-w-[140px] object-contain"
            />
          ) : (
            <div className="flex h-14 w-24 items-center justify-center rounded border border-dashed border-slate-200 text-[10px] text-slate-400">
              logo
            </div>
          )}
          <div className="min-w-0 flex-1 space-y-2">
            <input
              className={docTextarea}
              value={data.inspecteur_nom}
              onChange={(e) => update("inspecteur_nom", e.target.value)}
              placeholder="Nom"
            />
            <input
              className={docTextarea}
              value={data.inspecteur_numero_certification}
              onChange={(e) => update("inspecteur_numero_certification", e.target.value)}
              placeholder="Licence / certification"
            />
            <input
              className={docTextarea}
              value={data.compagnie}
              onChange={(e) => update("compagnie", e.target.value)}
              placeholder="Entreprise"
            />
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">Logo : chargez-le dans Outils &amp; imports.</p>
      </DocBlock>

      <DocBlock kicker="Conformité (province)" status={resumeBlockStatus("compliance", data)}>
        <select
          className={`${docTextarea} cursor-pointer`}
          value={data.conformite_juridiction}
          onChange={(e) => onJurisdictionSelect(e.target.value as ComplianceJurisdiction)}
        >
          {Object.entries(COMPLIANCE_LABELS).map(([code, lab]) => (
            <option key={code} value={code}>
              {lab}
            </option>
          ))}
        </select>
        <textarea
          className={`${docTextarea} mt-2 min-h-[120px]`}
          value={data.notes_conformite}
          onChange={(e) => onComplianceNotesChange(e.target.value)}
        />
      </DocBlock>
    </div>
  );
}
