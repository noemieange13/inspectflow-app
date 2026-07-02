"use client";

import Link from "next/link";

type Props = {
  organizationId?: string | null;
  accessToken?: string | null;
  showAdminLinks?: boolean;
};

function navHref(
  path: string,
  organizationId?: string | null,
  accessToken?: string | null,
): string {
  const params = new URLSearchParams();
  if (organizationId?.trim()) params.set("organization_id", organizationId.trim());
  if (accessToken?.trim()) params.set("access_token", accessToken.trim());
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export default function InspectorNav({
  organizationId,
  accessToken,
  showAdminLinks = false,
}: Props) {
  const linkClass =
    "inline-flex min-h-[44px] items-center rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100";

  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 py-2 sm:px-4"
      aria-label="Navigation inspecteur"
    >
      <Link href="/dashboard/simple" className={`${linkClass} bg-slate-100 text-slate-900`}>
        Mes inspections
      </Link>
      <Link href={navHref("/dashboard/team", organizationId, accessToken)} className={linkClass}>
        Équipe
      </Link>
      <Link
        href={navHref("/dashboard/settings/billing", organizationId, accessToken)}
        className={linkClass}
      >
        Abonnement
      </Link>
      <Link
        href="/dashboard/settings/profile"
        className={linkClass}
      >
        Profil inspecteur
      </Link>
      <Link href="/dashboard/simple#parametres" className={linkClass}>
        Paramètres
      </Link>
      {showAdminLinks ? (
        <>
          <Link href="/dashboard/system-health" className={`${linkClass} text-slate-500`}>
            Monitoring
          </Link>
          <Link href="/dashboard/organization-usage" className={`${linkClass} text-slate-500`}>
            Usage
          </Link>
        </>
      ) : null}
    </nav>
  );
}
