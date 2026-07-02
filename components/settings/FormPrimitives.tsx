"use client";

export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function Field({
  label,
  id,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}

export function TextArea({
  label,
  id,
  value,
  onChange,
  placeholder,
  hint,
  rows = 3,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}) {
  return (
    <label htmlFor={id} className="block text-sm">
      <span className="font-medium text-slate-700">{label}</span>
      {hint ? <span className="mt-0.5 block text-xs text-slate-500">{hint}</span> : null}
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
      />
    </label>
  );
}

export function SaveBar({
  saving,
  saved,
  disabled,
  onSave,
  saveLabel = "Enregistrer",
}: {
  saving: boolean;
  saved: boolean;
  disabled?: boolean;
  onSave: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={onSave}
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-blue-600 px-6 text-base font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {saving ? "Enregistrement…" : saveLabel}
      </button>
      {saved ? (
        <span className="text-sm text-emerald-700">Enregistré</span>
      ) : null}
    </div>
  );
}

export function useProfileFieldSetter(
  setForm: React.Dispatch<React.SetStateAction<import("@/lib/inspectorProfile").InspectorProfileInput>>,
  setSaved: (v: boolean) => void,
) {
  return (key: keyof import("@/lib/inspectorProfile").InspectorProfileInput) =>
    (value: string) => {
      setForm((prev) => ({ ...prev, [key]: value.trim() || null }));
      setSaved(false);
    };
}
