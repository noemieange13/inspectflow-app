type Props = {
  label: string;
  used: number;
  limit: number | null;
  percent: number | null;
  unit?: string;
};

function formatLimit(limit: number | null, unit?: string): string {
  if (limit === null || limit < 0) return "∞";
  return unit ? `${limit} ${unit}` : String(limit);
}

export default function UsageMeter({ label, used, limit, percent, unit }: Props) {
  const pct = percent ?? (limit && limit > 0 ? Math.min(100, (used / limit) * 100) : 0);
  const width = limit === null || limit < 0 ? 0 : Math.min(100, pct);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <span className="tabular-nums text-slate-600">
          {used} / {formatLimit(limit, unit)} utilisé{used > 1 ? "s" : ""}
        </span>
      </div>
      {limit !== null && limit >= 0 ? (
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              width >= 100 ? "bg-rose-500" : width >= 80 ? "bg-amber-500" : "bg-emerald-500"
            }`}
            style={{ width: `${width}%` }}
          />
        </div>
      ) : (
        <p className="text-xs text-slate-500">Illimité</p>
      )}
    </div>
  );
}
