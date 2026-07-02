"use client";

import Link from "next/link";

type Props = {
  language?: "fr" | "en";
};

export default function InspectorProfileSetupBanner({ language = "fr" }: Props) {
  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
      <p className="text-sm font-semibold text-blue-950">
        {language === "en"
          ? "Complete your professional profile"
          : "Complétez votre profil professionnel"}
      </p>
      <p className="mt-1 text-sm text-blue-900">
        {language === "en"
          ? "Set up your company and certification once — reports will include them automatically."
          : "Configurez votre entreprise et vos certifications une seule fois — vos rapports les incluront automatiquement."}
      </p>
      <Link
        href="/dashboard/settings/profile"
        className="mt-3 inline-flex min-h-[40px] items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700"
      >
        {language === "en" ? "Set up profile" : "Configurer mon profil"}
      </Link>
    </div>
  );
}
