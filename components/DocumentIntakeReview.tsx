"use client";

import { useEffect, useMemo, useState } from "react";

import type { DocumentIntelligenceResult } from "@/lib/document-intelligence";
import { captureInspectorLearningOnIntakeConfirm } from "@/lib/documentIntakeLearningCapture";
import {
  applyInspectorLearningToDocumentAnalysis,
  resolveInspectorLearningIdFromAccessToken,
} from "@/lib/inspectorLearning";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import type { ParsedDocumentMeta } from "@/components/InspectionDocumentUpload";
import {
  attachConfirmedBuildingProfile,
  buildBuildingProfileFromAnalysis,
  type BuildingProfileDirection,
} from "@/lib/buildingProfile";
import type { DocumentFusionV1 } from "@/lib/documentFusionEngine";
import {
  INSPECTOR_CONFIRMATION_NOTICE,
  NEEDS_REVIEW_UI_MESSAGE,
} from "@/lib/documentIntakeParseResult";
import {
  analyzePrefillMissingReasons,
  DOCUMENT_READ_NO_MAIN_DATA_MESSAGE,
  isMainIntakeDataMissing,
} from "@/lib/documentTrace";
import {
  INSPECTION_FORM_INPUT_CLASS,
  INSPECTION_FORM_SELECT_CLASS,
} from "@/lib/inspectorCreationMethod";
import { orientationLabelFr, suggestFacadeOrientation } from "@/lib/propertyOrientation";

type Props = {
  document: ParsedDocumentMeta;
  analysis: DocumentIntelligenceResult;
  needsReview?: boolean;
  busy?: boolean;
  variant?: "default" | "steve";
  fusion?: DocumentFusionV1 | null;
  prefillDebug?: { missingReasons?: string[] };
  accessToken?: string | null;
  onConfirm: (prefill: {
    clientName: string;
    address: string;
    inspectionType: string;
    document: ParsedDocumentMeta;
    analysis: DocumentIntelligenceResult;
  }) => void;
  onEditManual: (prefill: {
    clientName: string;
    address: string;
    inspectionType: string;
  }) => void;
  onIgnore: () => void;
};

const ORIENTATION_OPTIONS: BuildingProfileDirection[] = ["nord", "sud", "est", "ouest"];

export default function DocumentIntakeReview({
  document,
  analysis,
  needsReview = false,
  busy = false,
  variant = "default",
  fusion = null,
  prefillDebug,
  accessToken = null,
  onConfirm,
  onEditManual,
  onIgnore,
}: Props) {
  const inspectorLearningId = useMemo(
    () => resolveInspectorLearningIdFromAccessToken(accessToken),
    [accessToken],
  );

  const basePrefill = useMemo(
    () => resolveDocumentIntakePrefill(analysis, fusion),
    [analysis, fusion],
  );

  const learnedAnalysis = useMemo(
    () =>
      applyInspectorLearningToDocumentAnalysis(analysis, {
        inspector_id: inspectorLearningId,
        document_type: document.document_type,
      }),
    [analysis, document.document_type, inspectorLearningId],
  );

  const resolvedPrefill = useMemo(
    () => resolveDocumentIntakePrefill(learnedAnalysis, fusion),
    [learnedAnalysis, fusion],
  );

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.debug("[DocumentIntakeReview] document intake prefill", {
        basePrefill,
        analysis: learnedAnalysis,
        fusion,
        resolvedPrefill,
      });
    }
  }, [basePrefill, learnedAnalysis, fusion, resolvedPrefill]);

  const displayClientName = resolvedPrefill.clientName;
  const displayAddress = resolvedPrefill.address;

  const [clientName, setClientName] = useState(resolvedPrefill.clientName);
  const [address, setAddress] = useState(resolvedPrefill.address);
  const [inspectionType, setInspectionType] = useState(
    resolvedPrefill.inspectionType || "residential",
  );
  const profile = useMemo(() => buildBuildingProfileFromAnalysis(learnedAnalysis), [learnedAnalysis]);

  useEffect(() => {
    setClientName(resolvedPrefill.clientName);
    setAddress(resolvedPrefill.address);
    setInspectionType(resolvedPrefill.inspectionType || "residential");
  }, [resolvedPrefill.clientName, resolvedPrefill.address, resolvedPrefill.inspectionType]);

  const [showEditFields, setShowEditFields] = useState(false);

  const suggestedOrientation = useMemo(
    () => suggestFacadeOrientation(address || analysis.property.address || ""),
    [address, analysis.property.address],
  );

  const reportOrientationSource =
    profile.orientation.source === "previous_report" ? profile.orientation : null;

  // The selected radio must mirror the displayed suggestion until the inspector
  // changes it manually; a confirmed report orientation always takes precedence.
  const initialOrientation: BuildingProfileDirection =
    reportOrientationSource?.facade_direction ||
    suggestedOrientation?.suggested_direction ||
    profile.orientation.facade_direction ||
    analysis.orientation?.facade_direction ||
    "";
  const [selectedOrientation, setSelectedOrientation] =
    useState<BuildingProfileDirection>(initialOrientation);
  const [orientationTouched, setOrientationTouched] = useState(false);

  useEffect(() => {
    if (orientationTouched) return;
    const synced =
      reportOrientationSource?.facade_direction ||
      suggestedOrientation?.suggested_direction ||
      "";
    if (synced && synced !== selectedOrientation) {
      setSelectedOrientation(synced);
    }
  }, [orientationTouched, reportOrientationSource, suggestedOrientation, selectedOrientation]);

  const showNeedsReview = needsReview || document.extraction_status === "needs_review";
  const mainDataMissing = !showNeedsReview && isMainIntakeDataMissing(resolvedPrefill);
  const missingReasons = useMemo(() => {
    if (!mainDataMissing) return prefillDebug?.missingReasons ?? [];
    if (prefillDebug?.missingReasons?.length) return prefillDebug.missingReasons;
    if (process.env.NODE_ENV === "development") {
      return analyzePrefillMissingReasons(analysis, fusion, resolvedPrefill);
    }
    return [];
  }, [analysis, fusion, mainDataMissing, prefillDebug?.missingReasons, resolvedPrefill]);
  const isSteve = variant === "steve";
  const buildingTypeLabel = profile.type || analysis.property.buildingTypeLabel?.trim() || "";
  const buildingYear = profile.year_built || analysis.property.constructionYear?.trim() || "";
  const frontMaterial = profile.exterior.front_material || analysis.building?.facade_material || "";
  const sidesMaterial = profile.exterior.sides_material || analysis.building?.sides_material || "";
  const rearMaterial = profile.exterior.rear_material || analysis.building?.rear_material || "";
  const roofCovering = profile.roof.covering || analysis.building?.roof_covering?.trim() || "";
  const foundationType = profile.foundation.type || analysis.building?.foundation_type?.trim() || "";
  const buildingLabel =
    inspectionType === "commercial"
      ? "Commercial"
      : inspectionType === "multiplex"
        ? buildingTypeLabel || "Multiplex"
        : inspectionType === "condo"
          ? "Condominium"
          : buildingTypeLabel || "Résidentiel";

  const terrainNotes = useMemo(() => {
    const notes =
      fusion?.inspector_raw_notes_v1?.notes ??
      analysis.inspector_raw_notes_v1?.notes ??
      [];
    return notes.map((note) => note.text).filter(Boolean);
  }, [analysis.inspector_raw_notes_v1, fusion?.inspector_raw_notes_v1]);

  const [showRejectedNotes, setShowRejectedNotes] = useState(false);

  const steveIntelligence = learnedAnalysis.field_sheet_intelligence_v1;
  const rejectedOcrNotes = useMemo(
    () =>
      analysis.inspector_raw_notes_v1?.ocr_rejected_notes ??
      fusion?.inspector_raw_notes_v1?.ocr_rejected_notes ??
      [],
    [analysis.inspector_raw_notes_v1, fusion?.inspector_raw_notes_v1],
  );
  const terrainNotesFromIntel = useMemo(
    () =>
      steveIntelligence?.notes.raw_notes.map((note) => note.raw_text).filter(Boolean) ??
      terrainNotes,
    [steveIntelligence, terrainNotes],
  );

  const clientNeedsConfirmation =
    fusion?.client.name?.requires_confirmation ||
    learnedAnalysis.field_sheet_contact_v1?.client_name?.requires_confirmation ||
    steveIntelligence?.client.name?.requires_confirmation;
  const addressNeedsConfirmation =
    fusion?.property.address?.requires_confirmation ||
    learnedAnalysis.field_sheet_form_v1?.property.address?.requires_confirmation ||
    steveIntelligence?.property.address?.requires_confirmation;
  const addressCorrectedFromOcr = Boolean(
    steveIntelligence?.property.address?.corrections?.length ||
      learnedAnalysis.field_sheet_form_v1?.property.address?.original_value,
  );
  const clientHandwritingHeader =
    steveIntelligence?.client.name?.source === "handwriting_header" ||
    learnedAnalysis.field_sheet_contact_v1?.client_name?.source === "handwriting_header";

  const technicalSystemsFound = useMemo(() => {
    const systems = steveIntelligence?.systems;
    if (!systems) return [];
    return [
      systems.roof?.value ? { label: "Toiture", value: systems.roof.value } : null,
      systems.heating?.value ? { label: "Chauffage", value: systems.heating.value } : null,
      systems.electrical_panel?.value
        ? { label: "Panneau électrique", value: systems.electrical_panel.value }
        : fusion?.building.electrical_panel?.value
          ? { label: "Panneau électrique", value: fusion.building.electrical_panel.value }
          : null,
      systems.water_heater?.value
        ? { label: "Chauffe-eau", value: systems.water_heater.value }
        : null,
    ].filter(Boolean) as Array<{ label: string; value: string }>;
  }, [steveIntelligence]);

  const brokerDisplay =
    steveIntelligence?.contacts.broker_name?.value ??
    fusion?.broker.name?.value ??
    analysis.people.broker ??
    null;

  const clientSourceLabel = learnedAnalysis.field_sheet_contact_v1?.client_name?.value
    ? "note manuscrite"
    : fusion?.client.name?.source;
  const addressSourceLabel =
    fusion?.property.address?.document_type === "steve_field_notes" ||
    learnedAnalysis.field_sheet_form_v1?.property.address
      ? "formulaire Steve"
      : fusion?.property.address?.source;

  const sourceTag = (label?: string) =>
    label ? (
      <p className="text-xs text-slate-500">Source : {label}</p>
    ) : null;

  const confirmBadge = (label = "À confirmer") => (
    <span className="ml-2 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-900">
      <span aria-hidden>⚠</span>
      <span>{label}</span>
    </span>
  );

  const persistLearningOnConfirm = (confirmed: { clientName: string; address: string }) => {
    captureInspectorLearningOnIntakeConfirm({
      access_token: accessToken,
      analysis,
      fusion,
      document,
      confirmed,
      source: "intake_commencer",
    });
  };

  const confirmWithOrientation = () => {
    const direction = selectedOrientation;
    const confirmedAnalysis = direction
      ? attachConfirmedBuildingProfile(learnedAnalysis, direction)
      : learnedAnalysis;
    const confirmed = resolveDocumentIntakePrefill(confirmedAnalysis, fusion);
    const payload = {
      clientName: (clientName.trim() || confirmed.clientName || "Client").trim(),
      address: (address.trim() || confirmed.address).trim(),
      inspectionType,
      document,
      analysis: confirmedAnalysis,
    };
    persistLearningOnConfirm({
      clientName: payload.clientName,
      address: payload.address,
    });
    onConfirm(payload);
  };

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-bold text-slate-900">
          {mainDataMissing
            ? DOCUMENT_READ_NO_MAIN_DATA_MESSAGE
            : isSteve
              ? "Informations trouvées ✓"
              : "Informations trouvées"}
        </h3>
        {!isSteve ? (
          <p className="mt-1 text-sm text-slate-600">
            Source : {document.fileName}
            {showNeedsReview
              ? " — document reçu"
              : ` (${document.textLength} caractères analysés)`}
          </p>
        ) : null}
      </div>

      {showNeedsReview ? (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950"
          role="status"
        >
          {NEEDS_REVIEW_UI_MESSAGE}
        </div>
      ) : null}

      {mainDataMissing ? (
        <div
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950"
          role="alert"
        >
          <p>{DOCUMENT_READ_NO_MAIN_DATA_MESSAGE}</p>
          {process.env.NODE_ENV === "development" && missingReasons.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-red-900">
              {missingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs text-slate-500">{INSPECTOR_CONFIRMATION_NOTICE}</p>

      {!showNeedsReview && isSteve && !showEditFields ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Client</dt>
              <dd className="font-medium text-gray-900">
                {displayClientName || steveIntelligence?.client.name?.value || "—"}
                {clientNeedsConfirmation
                  ? confirmBadge(
                      clientHandwritingHeader
                        ? "À confirmer (écriture manuscrite)"
                        : "À confirmer",
                    )
                  : null}
              </dd>
              {clientSourceLabel ? sourceTag(clientSourceLabel) : null}
            </div>
            {brokerDisplay ? (
              <div>
                <dt className="text-slate-500">Courtier</dt>
                <dd className="font-medium text-gray-900">{brokerDisplay}</dd>
                {steveIntelligence?.contacts.broker_name?.requires_confirmation
                  ? confirmBadge()
                  : null}
                {fusion?.broker.name?.source ? sourceTag(fusion.broker.name.source) : null}
              </div>
            ) : null}
            <div>
              <dt className="text-slate-500">Adresse</dt>
              <dd className="font-medium text-gray-900">
                {displayAddress || steveIntelligence?.property.address?.value || "—"}
                {addressNeedsConfirmation ? confirmBadge() : null}
                {addressCorrectedFromOcr ? (
                  <span className="ml-2 text-xs font-normal text-blue-800">
                    ⚠ Corrigée depuis écriture
                  </span>
                ) : null}
              </dd>
              {addressSourceLabel ? sourceTag(addressSourceLabel) : null}
            </div>
            <div>
              <dt className="text-slate-500">Bâtiment</dt>
              <dd className="font-medium text-gray-900">
                {steveIntelligence?.property.building_type?.value ??
                  fusion?.property.type?.value ??
                  buildingLabel}
                {(steveIntelligence?.property.construction_year?.value ??
                  fusion?.property.year_built?.value ??
                  buildingYear)
                  ? ` · ${steveIntelligence?.property.construction_year?.value ?? fusion?.property.year_built?.value ?? buildingYear}`
                  : ""}
              </dd>
              {fusion?.property.year_built?.source || fusion?.property.type?.source ? (
                <p className="text-xs text-slate-500">
                  Source :{" "}
                  {fusion.property.year_built?.source ??
                    fusion.property.type?.source ??
                    "—"}
                </p>
              ) : null}
            </div>

            {frontMaterial || sidesMaterial || rearMaterial ? (
              <div>
                <dt className="text-slate-500">Extérieur</dt>
                <dd className="space-y-0.5 font-medium text-gray-900">
                  {frontMaterial ? <p>Façade : {frontMaterial}</p> : null}
                  {sidesMaterial ? <p>Côtés : {sidesMaterial}</p> : null}
                  {rearMaterial ? <p>Arrière : {rearMaterial}</p> : null}
                </dd>
              </div>
            ) : null}

            {roofCovering ? (
              <div>
                <dt className="text-slate-500">Toiture</dt>
                <dd className="font-medium text-gray-900">{roofCovering}</dd>
              </div>
            ) : null}

            {foundationType || fusion?.building.foundation?.value ? (
              <div>
                <dt className="text-slate-500">Fondation</dt>
                <dd className="font-medium text-gray-900">
                  {fusion?.building.foundation?.value ?? foundationType}
                </dd>
              </div>
            ) : null}

            {fusion && fusion.verification_points.length > 0 ? (
              <div>
                <dt className="text-slate-500">Points à vérifier</dt>
                <dd>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-amber-900">
                    {fusion.verification_points.slice(0, 6).map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}

            {technicalSystemsFound.length > 0 ? (
              <div>
                <dt className="text-slate-500">Infos techniques trouvées</dt>
                <dd>
                  <ul className="mt-1 space-y-1 text-sm text-emerald-900">
                    {technicalSystemsFound.map((system) => (
                      <li key={system.label} className="flex items-start gap-2">
                        <span aria-hidden>✓</span>
                        <span>
                          {system.label}
                          {system.value ? ` : ${system.value}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}

            <div>
              <dt className="mb-2 text-slate-500">Orientation façade</dt>
              {suggestedOrientation && !reportOrientationSource ? (
                <p className="mb-2 text-xs text-blue-800">
                  Orientation suggérée : {orientationLabelFr(suggestedOrientation.suggested_direction)}{" "}
                  ({Math.round(suggestedOrientation.confidence * 100)} % — à confirmer)
                </p>
              ) : null}
              <dd className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {ORIENTATION_OPTIONS.map((direction) => {
                  const checked = selectedOrientation === direction;
                  const fromReport =
                    reportOrientationSource?.facade_direction === direction;
                  return (
                    <label
                      key={direction}
                      className={`flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked
                          ? "border-blue-600 bg-blue-50 text-blue-950"
                          : "border-slate-200 bg-white text-slate-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name="facade-orientation"
                        checked={checked}
                        onChange={() => {
                          setOrientationTouched(true);
                          setSelectedOrientation(direction);
                        }}
                        className="h-4 w-4"
                      />
                      <span>
                        {orientationLabelFr(direction)}
                        {fromReport ? " (trouvé dans rapport)" : ""}
                      </span>
                    </label>
                  );
                })}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {!showNeedsReview && isSteve && terrainNotesFromIntel.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
          <h4 className="text-sm font-semibold text-amber-950">Notes terrain reconnues</h4>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {terrainNotesFromIntel.map((note) => (
              <li key={note} className="flex items-start gap-2">
                <span aria-hidden>✓</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
          {rejectedOcrNotes.length > 0 ? (
            <div className="mt-3 border-t border-amber-200/80 pt-3">
              <button
                type="button"
                onClick={() => setShowRejectedNotes((open) => !open)}
                className="text-xs font-medium text-amber-900 underline-offset-2 hover:underline"
              >
                Autres mots détectés (ignorés) ({rejectedOcrNotes.length})
              </button>
              {showRejectedNotes ? (
                <ul className="mt-2 space-y-1 text-xs text-amber-800/90">
                  {rejectedOcrNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-amber-800">
            Ces notes seront disponibles pendant l&apos;inspection. Elles ne seront pas ajoutées au
            rapport sans validation.
          </p>
        </section>
      ) : null}

      {!showNeedsReview && !isSteve ? (
        <>
          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">🏠 Propriété</h4>
            <dl className="mt-2 space-y-1 text-sm text-slate-700">
              <div>
                <dt className="text-slate-500">Adresse</dt>
                <dd>{displayAddress || "—"}</dd>
              </div>
              {analysis.property.city ? (
                <div>
                  <dt className="text-slate-500">Ville</dt>
                  <dd>{analysis.property.city}</dd>
                </div>
              ) : null}
              {analysis.property.province ? (
                <div>
                  <dt className="text-slate-500">Province</dt>
                  <dd>{analysis.property.province}</dd>
                </div>
              ) : null}
              {analysis.property.constructionYear ? (
                <div>
                  <dt className="text-slate-500">Année</dt>
                  <dd>{analysis.property.constructionYear}</dd>
                </div>
              ) : null}
              {analysis.property.buildingType ? (
                <div>
                  <dt className="text-slate-500">Type</dt>
                  <dd>{analysis.property.buildingType}</dd>
                </div>
              ) : null}
              {analysis.property.floorArea ? (
                <div>
                  <dt className="text-slate-500">Superficie</dt>
                  <dd>{analysis.property.floorArea}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h4 className="text-sm font-semibold text-slate-900">👥 Contacts</h4>
            <dl className="mt-2 space-y-1 text-sm text-slate-700">
              <div>
                <dt className="text-slate-500">Client</dt>
                <dd>{displayClientName || "—"}</dd>
              </div>
              {analysis.people.clientPhone ? (
                <div>
                  <dt className="text-slate-500">Téléphone client</dt>
                  <dd>{analysis.people.clientPhone}</dd>
                </div>
              ) : null}
              {analysis.people.clientEmail ? (
                <div>
                  <dt className="text-slate-500">Courriel client</dt>
                  <dd>{analysis.people.clientEmail}</dd>
                </div>
              ) : null}
              {analysis.people.broker ? (
                <div>
                  <dt className="text-slate-500">Courtier</dt>
                  <dd>{analysis.people.broker}</dd>
                </div>
              ) : null}
              {analysis.people.brokerAgency ? (
                <div>
                  <dt className="text-slate-500">Agence</dt>
                  <dd>{analysis.people.brokerAgency}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          {analysis.inspection.scheduledDate ? (
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-900">📅 Inspection</h4>
              <p className="mt-1 text-sm text-slate-700">{analysis.inspection.scheduledDate}</p>
            </section>
          ) : null}

          {analysis.risks.length > 0 || analysis.suggestedChecks.length > 0 ? (
            <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
              <h4 className="text-sm font-semibold text-amber-950">
                ⚠ Contexte déclaration (à valider sur place)
              </h4>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                {analysis.risks.slice(0, 5).map((r, i) => (
                  <li key={`${r.category}-${i}`}>
                    {r.category} — {r.location} : {r.note}
                  </li>
                ))}
                {analysis.suggestedChecks.slice(0, 4).map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}

      {(showNeedsReview || !isSteve || showEditFields) ? (
      <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
          {showNeedsReview
            ? isSteve
              ? "Vérification requise"
              : "Saisie manuelle requise"
            : isSteve
              ? "Modifier les informations"
              : "Ajuster avant création"}
        </p>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Client</span>
          <input
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            className={INSPECTION_FORM_INPUT_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Adresse</span>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            required
            className={INSPECTION_FORM_INPUT_CLASS}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Type</span>
          <select
            value={inspectionType}
            onChange={(e) => setInspectionType(e.target.value)}
            className={INSPECTION_FORM_SELECT_CLASS}
          >
            <option value="residential">Résidentiel</option>
            <option value="commercial">Commercial</option>
            <option value="multiplex">Multiplex</option>
            <option value="condo">Condominium</option>
          </select>
        </label>
      </div>
      ) : null}

      <div className="flex flex-col gap-2">
        {isSteve && !showEditFields && !showNeedsReview ? (
          <>
            <button
              type="button"
              disabled={busy || !(address.trim() || displayAddress.trim())}
              onClick={confirmWithOrientation}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {busy ? "Création…" : fusion ? "Commencer l'inspection" : "Commencer"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setShowEditFields(true)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-800"
            >
              Modifier
            </button>
          </>
        ) : (
        <>
        <button
          type="button"
          disabled={busy || !address.trim() || (!isSteve && !clientName.trim())}
          onClick={() => {
            const confirmed = resolveDocumentIntakePrefill(learnedAnalysis, fusion);
            const payload = {
              clientName: (clientName.trim() || confirmed.clientName || "Client").trim(),
              address: (address.trim() || confirmed.address).trim(),
              inspectionType,
              document,
              analysis: learnedAnalysis,
            };
            persistLearningOnConfirm({
              clientName: payload.clientName,
              address: payload.address,
            });
            onConfirm(payload);
          }}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-violet-600 px-4 text-base font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
        >
          {busy ? "Création…" : isSteve ? "Commencer" : "✓ Confirmer et créer inspection"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onEditManual({
              clientName: clientName.trim(),
              address: address.trim(),
              inspectionType,
            })
          }
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-800"
        >
          ✏ Modifier (formulaire)
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onIgnore}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-base font-medium text-slate-500 hover:text-slate-700"
        >
          ✕ Ignorer
        </button>
        </>
        )}
      </div>
    </div>
  );
}
