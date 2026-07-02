import { Suspense } from "react";

import InspectorHome from "@/components/InspectorHome";

export const dynamic = "force-dynamic";

export default function InspectorSimpleDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Chargement…
        </div>
      }
    >
      <InspectorHome />
    </Suspense>
  );
}
