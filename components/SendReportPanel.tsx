"use client";

import { useMemo, useState } from "react";

import { buildDefaultSendMessage } from "@/lib/reportDeliveryClient";

type Props = {
  open: boolean;
  language?: "fr" | "en";
  initialEmail?: string | null;
  initialName?: string | null;
  busy?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  onClose: () => void;
  onSend: (payload: { clientEmail: string; clientName: string; message: string }) => void;
};

export default function SendReportPanel({
  open,
  language = "fr",
  initialEmail,
  initialName,
  busy = false,
  errorMessage,
  successMessage,
  onClose,
  onSend,
}: Props) {
  const defaultMessage = useMemo(
    () =>
      buildDefaultSendMessage({
        clientName: initialName ?? undefined,
        language,
      }),
    [initialName, language],
  );

  const [clientEmail, setClientEmail] = useState(initialEmail ?? "");
  const [clientName, setClientName] = useState(initialName ?? "");
  const [message, setMessage] = useState(defaultMessage);

  if (!open) return null;

  const labels =
    language === "en"
      ? {
          title: "Send to client",
          email: "Client email",
          name: "Client name",
          message: "Message",
          send: "Send",
          cancel: "Cancel",
        }
      : {
          title: "Envoyer au client",
          email: "Courriel du client",
          name: "Nom du client",
          message: "Message",
          send: "Envoyer",
          cancel: "Annuler",
        };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="send-report-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 id="send-report-title" className="text-lg font-bold text-slate-900">
          {labels.title}
        </h2>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">{labels.email}</span>
            <input
              type="email"
              autoComplete="email"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{labels.name}</span>
            <input
              type="text"
              autoComplete="name"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-slate-700">{labels.message}</span>
            <textarea
              rows={8}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {errorMessage ? (
          <p className="mt-3 text-sm text-red-700" role="alert">
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p className="mt-3 text-sm text-emerald-700" role="status">
            {successMessage}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSend({
                clientEmail: clientEmail.trim(),
                clientName: clientName.trim(),
                message: message.trim(),
              })
            }
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? (language === "en" ? "Sending…" : "Envoi…") : labels.send}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-slate-300 font-medium text-slate-800"
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function clientNameFromPayload(payload: Record<string, unknown> | null): string | null {
  const cover = payload?.cover_v1;
  if (!cover || typeof cover !== "object") return null;
  const prop = (cover as { propriete?: { client_nom?: string; client_name?: string } }).propriete;
  const name = prop?.client_nom?.trim() || prop?.client_name?.trim();
  return name && name.length > 0 ? name : null;
}

export function clientEmailFromPayload(payload: Record<string, unknown> | null): string | null {
  const cover = payload?.cover_v1;
  if (!cover || typeof cover !== "object") return null;
  const prop = (cover as { propriete?: { client_courriel?: string } }).propriete;
  const email = prop?.client_courriel?.trim();
  if (email && email.includes("@")) return email;
  return null;
}
