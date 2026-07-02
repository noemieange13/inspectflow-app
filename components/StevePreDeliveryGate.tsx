"use client";



import { useMemo, useState } from "react";



import PreDeliveryConfidenceCheck from "@/components/PreDeliveryConfidenceCheck";

import ReportPreview from "@/components/ReportPreview";

import { validatePreDelivery8z } from "@/lib/preDeliveryValidation8z";

import { attachReportBackupToPayload, REPORT_BACKUP_SNAPSHOT_V1_KEY } from "@/lib/reportBackupSnapshot";

import { validatePhotoFindingAssociations } from "@/lib/photoFindingValidation";

import {

  buildProfessionalReportTemplate,

  renderProfessionalReportHtml,

} from "@/lib/report_template_engine";

import {

  buildPreDeliveryReadiness,

  recordStevePilotPreviewOpened,

  type PreDeliveryReadiness,

} from "@/lib/stevePilotMode";

import { readInspectionWeatherFromPayload } from "@/lib/weather/inspectionWeather";

import { readReportReadySnapshotFromPayload } from "@/lib/report_readiness_engine";
import { recordPilotObservation } from "@/lib/stevePilotObservability";



export type StevePreDeliveryStep = "confidence" | "preview";



type Props = {

  language: "fr" | "en";

  payload: Record<string, unknown>;

  photoCount: number;

  findingsCount: number;

  loading?: boolean;

  onModify: () => void;

  onCreatePdf: () => void;

  onCancel?: () => void;

  initialStep?: StevePreDeliveryStep;

};



export default function StevePreDeliveryGate({

  language,

  payload,

  photoCount,

  findingsCount,

  loading = false,

  onModify,

  onCreatePdf,

  onCancel,

  initialStep = "confidence",

}: Props) {

  const [step, setStep] = useState<StevePreDeliveryStep>(initialStep);



  const readySnap = readReportReadySnapshotFromPayload(payload);

  const weather = readInspectionWeatherFromPayload(payload);



  const previewHtml = useMemo(() => {

    const template = buildProfessionalReportTemplate(payload, {

      locale: language === "en" ? "en-CA" : "fr-CA",

    });

    if (!template) return "";

    return renderProfessionalReportHtml(template, language === "en" ? "en-CA" : "fr-CA");

  }, [payload, language]);



  const readiness: PreDeliveryReadiness = useMemo(

    () =>

      buildPreDeliveryReadiness({

        payload,

        photoCount,

        findingsCount,

        weatherPresent: weather != null,

        photosReady: readySnap?.photos_ready,

        observationsReady: readySnap?.observations_ready,

      }),

    [payload, photoCount, findingsCount, weather, readySnap],

  );



  const validation = useMemo(

    () =>

      validatePreDelivery8z({

        payload,

        photoCount,

        html: previewHtml,

        language,

      }),

    [payload, photoCount, previewHtml, language],

  );



  const photoValidation = useMemo(

    () => validatePhotoFindingAssociations({ payload, language }),

    [payload, language],

  );



  const mergedValidation = useMemo(

    () => ({

      ...validation,

      warnings: [

        ...validation.warnings,

        ...photoValidation.items.map((i) =>
          language === "en" ? i.message_en : i.message_fr,
        ),

      ],

      verifyBeforeSend:

        validation.verifyBeforeSend || photoValidation.items.length > 0,

    }),

    [validation, photoValidation],

  );



  const handleCreatePdf = () => {
    const withBackup = attachReportBackupToPayload(payload);
    payload[REPORT_BACKUP_SNAPSHOT_V1_KEY] = withBackup[REPORT_BACKUP_SNAPSHOT_V1_KEY];
    recordPilotObservation("report_approved");
    onCreatePdf();
  };



  if (step === "preview") {

    return (

      <ReportPreview

        payload={payload}

        language={language}

        loading={loading}

        onModify={() => {

          setStep("confidence");

          onModify();

        }}

        onApprove={handleCreatePdf}

      />

    );

  }



  return (

    <PreDeliveryConfidenceCheck

      language={language}

      readiness={readiness}

      validation={mergedValidation}

      loading={loading}

      onPreview={() => {

        recordStevePilotPreviewOpened();

        recordPilotObservation("pdf_preview_opened");

        setStep("preview");

      }}

      onCreatePdf={handleCreatePdf}

      onCancel={onCancel}

    />

  );

}


