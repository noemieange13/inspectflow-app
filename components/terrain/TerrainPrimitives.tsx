"use client";

/**
 * Patterns UX terrain-first (badges, champs surlignés, entrée DV).
 */

export function TerrainAutoFillBadge() {
  return (
    <p className="text-xs font-medium text-sky-800">
      <span aria-hidden>✨</span> Rempli automatiquement à partir de la DV — modifiable
    </p>
  );
}

export function TerrainWeatherGpsBadge() {
  return (
    <p className="mt-1 text-xs font-medium text-sky-700">
      <span aria-hidden>🌤️</span> Météo détectée automatiquement — modifiable
    </p>
  );
}

export function TerrainDescriptionModePills(props: {
  modeManuel: boolean;
  onManuel: () => void;
  onAutoIa: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-1">
      <button
        type="button"
        onClick={props.onAutoIa}
        className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
          !props.modeManuel
            ? "bg-blue-700 text-white shadow-sm"
            : "bg-transparent text-slate-700 hover:bg-white"
        }`}
      >
        AUTO (IA)
      </button>
      <button
        type="button"
        onClick={props.onManuel}
        className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
          props.modeManuel
            ? "bg-slate-800 text-white shadow-sm"
            : "bg-transparent text-slate-700 hover:bg-white"
        }`}
      >
        MANUEL
      </button>
    </div>
  );
}

type TerrainSmartEntryHeroProps = {
  dvLoading: boolean;
  onDvFile: (file: File | null) => void;
  onManual: () => void;
  showDvSuccessHint: boolean;
};

export function TerrainSmartEntryHero({
  dvLoading,
  onDvFile,
  onManual,
  showDvSuccessHint,
}: TerrainSmartEntryHeroProps) {
  return (
    <section
      id="terrain-smart-entry"
      className="rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 via-white to-white p-4 shadow-sm"
    >
      <h2 className="text-base font-semibold text-slate-900">Création du rapport</h2>
      <p className="mt-1 text-sm text-slate-600">
        Scannez la déclaration du vendeur pour préremplir les champs, ou saisissez à la main.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label
          className={`inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-700 px-5 py-3 text-sm font-semibold text-white shadow-md hover:bg-blue-800 ${
            dvLoading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={dvLoading}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              void onDvFile(f);
            }}
          />
          {dvLoading ? "Analyse DV…" : "Scanner DV (recommandé)"}
        </label>
        <button
          type="button"
          onClick={onManual}
          className="inline-flex items-center justify-center rounded-lg border-2 border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Remplir manuellement
        </button>
      </div>
      {showDvSuccessHint ? (
        <div className="mt-3 rounded-md border border-sky-100 bg-sky-50/90 px-3 py-2">
          <TerrainAutoFillBadge />
        </div>
      ) : null}
    </section>
  );
}

export function terrainAutoFieldClass(active: boolean): string {
  return active
    ? "mt-1 w-full rounded-md border border-sky-200 bg-sky-50/90 px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    : "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
}
