"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

import AIReportReviewScreen from "@/components/AIReportReviewScreen";
import FieldTestChecklist from "@/components/FieldTestChecklist";
import InspectionReviewWorkspace from "@/components/InspectionReviewWorkspace";
import InspectorSimpleWorkspace from "@/components/InspectorSimpleWorkspace";
import InspectionWorkspace from "@/components/InspectionWorkspace";
import InspectionDeliveryWorkspace from "@/components/InspectionDeliveryWorkspace";
import PostInspectionWorkspace from "@/components/PostInspectionWorkspace";
import ReportPageReadiness from "@/components/ReportPageReadiness";
import SteveTestObserver from "@/components/SteveTestObserver";
import ZeroDraftReportComposer from "@/components/ZeroDraftReportComposer";
import type { FastReportReadiness } from "@/lib/fast_report_engine";
import { isPostInspectionWorkflow } from "@/lib/inspectorWorkflow";
import type { ReportServerData } from "@/lib/reportViewerServer";

type ViewMode = "field" | "post" | "classic" | "review" | "ai-review" | "delivery" | "advanced";

type Props = {
  reportId: string;
  viewerToken?: string;
  reportData: ReportServerData;
  coverRaw: unknown;
  couvertureBaseHref: string;
  reportSelfHref: string;
  photoCount?: number;
};

function ReportFieldPageInner({
  reportId,
  viewerToken,
  reportData,
  coverRaw,
  couvertureBaseHref,
  reportSelfHref,
  photoCount,
}: Props) {
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode");
  const [fastReadiness, setFastReadiness] = useState<FastReportReadiness | null>(null);
  const [reviewMode, setReviewMode] = useState<"full" | "fast">(
    initialMode === "fast" ? "fast" : "full",
  );
  const reportPayload =
    reportData.payload && typeof reportData.payload === "object"
      ? reportData.payload
      : null;

  const postInspectionMode = isPostInspectionWorkflow(
    reportPayload as Record<string, unknown> | null,
  );

  const [view, setView] = useState<ViewMode>(() => {
    if (initialMode === "advanced") return "advanced";
    if (initialMode === "delivery") return "delivery";
    if (initialMode === "ai-review") return "ai-review";
    if (initialMode === "review" || initialMode === "fast") return "review";
    if (initialMode === "classic") return "classic";
    if (initialMode === "post") return "post";
    if (
      postInspectionMode &&
      initialMode !== "field" &&
      initialMode !== "classic"
    ) {
      return "post";
    }
    return "field";
  });

  const fieldTestOverlay = (
    <FieldTestChecklist reportId={reportId} view={view} hasPdf={reportData.hasPdf} />
  );

  if (view === "field") {
    return (
      <>
        <InspectorSimpleWorkspace
          reportId={reportId}
          viewerToken={viewerToken}
          initialData={reportData}
          onReview={() => {
            setReviewMode("full");
            setView("review");
          }}
          onAdvancedMode={() => setView("advanced")}
          onFastReportComplete={({ readiness, nextRoute }) => {
            setFastReadiness(readiness);
            if (nextRoute === "delivery") {
              setReviewMode("full");
              setView("delivery");
            } else if (nextRoute === "review") {
              setReviewMode("fast");
              setView("review");
            } else {
              setReviewMode("full");
              setView("field");
            }
          }}
        />
        <SteveTestObserver screen="field" />
        {fieldTestOverlay}
      </>
    );
  }

  if (view === "post") {
    return (
      <>
        <PostInspectionWorkspace
          reportId={reportId}
          viewerToken={viewerToken}
          initialData={reportData}
          onReview={() => {
            setReviewMode("full");
            setView("review");
          }}
          onDelivery={() => setView("delivery")}
          onAdvancedMode={() => setView("advanced")}
        />
        {fieldTestOverlay}
      </>
    );
  }

  if (view === "classic") {
    return (
      <>
        <InspectionWorkspace
          reportId={reportId}
          viewerToken={viewerToken}
          initialData={reportData}
          onReview={() => setView("review")}
          onAdvancedMode={() => setView("advanced")}
        />
        {fieldTestOverlay}
      </>
    );
  }

  if (view === "review") {
    return (
      <>
        <InspectionReviewWorkspace
          reportId={reportId}
          viewerToken={viewerToken}
          initialData={reportData}
          mode={reviewMode}
          fastReadiness={reviewMode === "fast" ? fastReadiness : null}
          onBackToField={() => {
            setReviewMode("full");
            setView(postInspectionMode ? "post" : "field");
          }}
          onGoToDelivery={() => {
            setReviewMode("full");
            setView("delivery");
          }}
          onAdvancedEdit={() => setView("advanced")}
        />
        {fieldTestOverlay}
      </>
    );
  }

  if (view === "ai-review") {
    return (
      <>
        <AIReportReviewScreen
          reportId={reportId}
          viewerToken={viewerToken}
          initialData={reportData}
          onGenerateReport={() => setView("delivery")}
          onBack={() => setView("field")}
          onAdvancedEdit={() => setView("advanced")}
        />
        {fieldTestOverlay}
      </>
    );
  }

  if (view === "delivery") {
    return (
      <>
        <InspectionDeliveryWorkspace
          reportId={reportId}
          viewerToken={viewerToken}
          initialData={reportData}
          onBackToReview={() => setView("review")}
          onBackToField={() => setView(postInspectionMode ? "post" : "field")}
          onAdvancedEdit={() => setView("advanced")}
        />
        {fieldTestOverlay}
      </>
    );
  }

  return (
    <>
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <button
        type="button"
        onClick={() => setView("field")}
        className="mb-4 inline-flex min-h-[44px] items-center rounded-lg px-2 text-sm font-medium text-blue-600 hover:text-blue-800"
      >
        ← Retour terrain
      </button>

      <Suspense
        fallback={
          <div className="mb-6 h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        }
      >
        <ReportPageReadiness
          reportId={reportId}
          coverRaw={coverRaw}
          reportPayload={reportPayload}
          photoCount={photoCount}
          couvertureBaseHref={couvertureBaseHref}
          reportSelfHref={reportSelfHref}
          viewerAccessToken={viewerToken}
          reportHasPdf={reportData.hasPdf}
          simpleMode
        />
      </Suspense>

      <ZeroDraftReportComposer
        reportId={reportId}
        viewerToken={viewerToken}
        initialData={reportData}
      />
    </div>
    {fieldTestOverlay}
    </>
  );
}

export default function ReportFieldPageClient(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-500">
          Chargement…
        </div>
      }
    >
      <ReportFieldPageInner {...props} />
    </Suspense>
  );
}
