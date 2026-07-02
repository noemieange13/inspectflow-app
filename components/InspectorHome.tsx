"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import InspectionCard from "@/components/InspectionCard";
import FirstInspectionGuide from "@/components/FirstInspectionGuide";
import InspectorSetupWizard from "@/components/onboarding/InspectorSetupWizard";
import InspectorNav from "@/components/InspectorNav";
import InspectorProfileSetupBanner from "@/components/InspectorProfileSetupBanner";
import NewInspectionSheet from "@/components/NewInspectionSheet";
import OfflineDevBanner from "@/components/OfflineDevBanner";
import StevePilotFrictionButton from "@/components/StevePilotFrictionButton";
import type { InspectorHomeListItem, InspectorHomeWeekStats } from "@/lib/inspectorHomeList";
import {
  DEV_INSPECTOR_DISPLAY_NAME,
  DEV_MODE_BANNER_LABEL,
  isDevInspectorDashboardMode,
} from "@/lib/devInspectorMode";
import {
  OFFLINE_INSPECTION_CREATED_EVENT,
  readOfflineInspectionsClientSide,
} from "@/lib/devOffline/clientStore";
import { offlineInspectionToHomeListItem } from "@/lib/devOffline/homeList";
import { createBrowserSupabaseClient } from "@/lib/supabaseBrowser";
import { humanInspectorError } from "@/lib/commercialCopy8g";
import { resolveDocumentIntakePrefill } from "@/lib/documentIntakePrefill";
import { useSupabaseAccessToken } from "@/lib/useSupabaseAccessToken";
import {
  computeWeekStats,
  pickActiveInspection,
} from "@/lib/inspectorHomeList";

export { resolveDocumentIntakePrefill };

type HomeResponse = {
  success?: boolean;
  error?: string;
  organization_id?: string | null;
  show_admin_nav?: boolean;
  active?: InspectorHomeListItem | null;
  items?: InspectorHomeListItem[];
  week_stats?: InspectorHomeWeekStats;
};

function greetingName(
  email: string | undefined,
  metadata: Record<string, unknown> | undefined,
): string {
  const full =
    typeof metadata?.full_name === "string"
      ? metadata.full_name.trim()
      : typeof metadata?.name === "string"
        ? metadata.name.trim()
        : "";
  if (full) return full.split(/\s+/)[0] ?? full;
  if (email?.includes("@")) return email.split("@")[0] ?? "Inspecteur";
  return "Inspecteur";
}

export default function InspectorHome() {
  const accessToken = useSupabaseAccessToken();
  const devDashboardMode = isDevInspectorDashboardMode();
  const searchParams = useSearchParams();
  const [displayName, setDisplayName] = useState("Inspecteur");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [active, setActive] = useState<InspectorHomeListItem | null>(null);
  const [items, setItems] = useState<InspectorHomeListItem[]>([]);
  const [weekStats, setWeekStats] = useState<InspectorHomeWeekStats>({
    completedThisWeek: 0,
    draftsThisWeek: 0,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAdminLinks, setShowAdminLinks] = useState(false);
  const [profileConfigured, setProfileConfigured] = useState<boolean | null>(null);
  const [wizardDismissed, setWizardDismissed] = useState(false);
  const [offlineDevActive, setOfflineDevActive] = useState(false);

  const applyOfflineDashboardItems = useCallback(() => {
    const offlineItems = readOfflineInspectionsClientSide().map(offlineInspectionToHomeListItem);
    setItems(offlineItems);
    setActive(pickActiveInspection(offlineItems));
    setWeekStats(computeWeekStats(offlineItems));
  }, []);

  useEffect(() => {
    if (!devDashboardMode) return;
    let cancelled = false;
    void fetch("/api/dev/supabase-health")
      .then((res) => res.json())
      .then((body: { offline_dev?: boolean }) => {
        if (!cancelled) setOfflineDevActive(body.offline_dev === true);
      })
      .catch(() => {
        if (!cancelled) setOfflineDevActive(true);
      });
    return () => {
      cancelled = true;
    };
  }, [devDashboardMode]);

  useEffect(() => {
    if (!devDashboardMode || !offlineDevActive) return;
    applyOfflineDashboardItems();
    const onCreated = () => applyOfflineDashboardItems();
    window.addEventListener(OFFLINE_INSPECTION_CREATED_EVENT, onCreated);
    return () => window.removeEventListener(OFFLINE_INSPECTION_CREATED_EVENT, onCreated);
  }, [applyOfflineDashboardItems, devDashboardMode, offlineDevActive]);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setSheetOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    void createBrowserSupabaseClient()
      .auth.getUser()
      .then(({ data }) => {
        if (cancelled || !data.user) return;
        setDisplayName(
          greetingName(data.user.email, data.user.user_metadata as Record<string, unknown>),
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const useDevApi = devDashboardMode && !accessToken?.trim();
    if (!useDevApi && !accessToken?.trim()) {
      setProfileConfigured(null);
      return;
    }
    let cancelled = false;
    const headers: Record<string, string> = {};
    if (!useDevApi && accessToken?.trim()) {
      headers.Authorization = `Bearer ${accessToken.trim()}`;
    }
    void fetch("/api/inspector-profile", { headers })
      .then((res) => res.json())
      .then((body: { configured?: boolean }) => {
        if (!cancelled) setProfileConfigured(body.configured === true);
      })
      .catch(() => {
        if (!cancelled) setProfileConfigured(null);
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, devDashboardMode]);

  const loadHome = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!accessToken?.trim()) {
      if (devDashboardMode) {
        setDisplayName(DEV_INSPECTOR_DISPLAY_NAME);
        setOrganizationId(null);
        setShowAdminLinks(false);
        if (offlineDevActive || readOfflineInspectionsClientSide().length > 0) {
          applyOfflineDashboardItems();
        } else {
          setActive(null);
          setItems([]);
          setWeekStats({ completedThisWeek: 0, draftsThisWeek: 0 });
        }
        setLoading(false);
        return;
      }
      setLoading(false);
      setError("connect");
      return;
    }
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken.trim()}`,
      };
      const res = await fetch("/api/inspector-home", { headers });
      const body = (await res.json().catch(() => null)) as HomeResponse | null;
      if (!res.ok || !body?.success) {
        console.error("INSPECTOR_HOME:", body?.error ?? res.status);
        setError(
          humanInspectorError({
            status: res.status,
            raw: body?.error ?? undefined,
          }),
        );
        return;
      }
      setOrganizationId(body.organization_id ?? null);
      setShowAdminLinks(body.show_admin_nav === true);
      setActive(body.active ?? null);
      setItems(body.items ?? []);
      setWeekStats(
        body.week_stats ?? { completedThisWeek: 0, draftsThisWeek: 0 },
      );
    } catch (e) {
      console.error("INSPECTOR_HOME:", e);
      setError(humanInspectorError({ kind: "network" }));
    } finally {
      setLoading(false);
    }
  }, [accessToken, applyOfflineDashboardItems, devDashboardMode, offlineDevActive]);

  useEffect(() => {
    void loadHome();
  }, [loadHome]);

  const recentItems = useMemo(() => {
    const merged = active ? [active, ...items.filter((i) => i.reportId !== active.reportId)] : items;
    return merged;
  }, [active, items]);

  return (
    <div className="min-h-screen bg-slate-50">
      <InspectorNav
        organizationId={organizationId}
        accessToken={accessToken}
        showAdminLinks={showAdminLinks}
      />

      <main className="mx-auto max-w-2xl px-4 py-6 pb-24">
        {devDashboardMode && !accessToken?.trim() ? (
          <div
            className="mb-4 rounded-lg border border-violet-300 bg-violet-100 px-4 py-2 text-center text-sm font-semibold text-violet-900"
            role="status"
          >
            {DEV_MODE_BANNER_LABEL}
          </div>
        ) : null}

        <OfflineDevBanner />

        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Bonjour {displayName} 👋
          </h1>
        </header>

        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mb-6 inline-flex min-h-[60px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 text-lg font-semibold text-white shadow-md hover:bg-blue-700"
        >
          + Nouvelle inspection
        </button>

        {loading ? (
          <div className="space-y-4">
            <div className="h-24 animate-pulse rounded-xl bg-slate-200" />
            <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />
          </div>
        ) : error === "connect" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
            <p className="font-medium">Connectez-vous pour voir vos inspections</p>
            <p className="mt-2 text-amber-800">
              Ouvrez InspectFlow depuis votre compte Supabase ou le lien reçu par courriel.
            </p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-800">
            {error}
          </div>
        ) : (
          <>
            {profileConfigured === false && !wizardDismissed ? (
              <div className="mb-8">
                <InspectorSetupWizard
                  organizationId={organizationId}
                  onComplete={() => setProfileConfigured(true)}
                  onDismiss={() => setWizardDismissed(true)}
                />
              </div>
            ) : profileConfigured === false ? (
              <InspectorProfileSetupBanner />
            ) : null}

            <section
              className="mb-8 rounded-xl border border-slate-200 bg-white p-5"
              aria-label="Cette semaine"
            >
              <h2 className="text-sm font-semibold text-slate-900">Cette semaine</h2>
              <div className="mt-3 flex flex-wrap gap-6 text-sm">
                <p>
                  <span className="text-2xl font-bold tabular-nums text-slate-900">
                    {weekStats.completedThisWeek}
                  </span>
                  <span className="ml-2 text-slate-600">rapports terminés</span>
                </p>
                <p>
                  <span className="text-2xl font-bold tabular-nums text-slate-900">
                    {weekStats.draftsThisWeek}
                  </span>
                  <span className="ml-2 text-slate-600">en préparation</span>
                </p>
              </div>
            </section>

            {recentItems.length === 0 ? (
              <FirstInspectionGuide displayName={displayName} />
            ) : (
              <section className="mb-8" aria-label="Dernières inspections">
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Dernières inspections
                </h2>
                <ul className="space-y-3">
                  {recentItems.map((item, index) => (
                    <li key={item.reportId}>
                      <InspectionCard
                        item={item}
                        variant={index === 0 && active ? "hero" : "list"}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <section id="parametres" className="mt-8 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Paramètres</h2>
          <p className="mt-2 text-sm text-slate-600">
            Gérez votre profil professionnel et vos préférences.
          </p>
          <a
            href="/dashboard/settings/profile"
            className="mt-3 inline-flex min-h-[40px] items-center text-sm font-medium text-blue-600 hover:underline"
          >
            Profil inspecteur →
          </a>
        </section>
      </main>

      <NewInspectionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        accessToken={accessToken}
        devDashboardMode={devDashboardMode}
      />

      <StevePilotFrictionButton language="fr" screen="dashboard" />
    </div>
  );
}
