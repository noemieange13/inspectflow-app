"use client";

import { useCallback, useEffect, useState } from "react";

import type { OrganizationMember } from "@/lib/access_control/types";
import type { InvitationMemberRole } from "@/lib/organization_invitations/types";
import type { InspectionAssignmentRole } from "@/lib/team_collaboration/types";

const ROLE_LABEL: Record<OrganizationMember["role"], string> = {
  owner: "Propriétaire",
  admin: "Administrateur",
  inspector: "Inspecteur",
  assistant: "Assistant",
};

const STATUS_LABEL: Record<OrganizationMember["status"], string> = {
  active: "Actif",
  invited: "Invité",
  disabled: "Désactivé",
};

const INVITE_STATUS_LABEL: Record<string, string> = {
  pending: "En attente",
  accepted: "Acceptée",
  expired: "Expirée",
  revoked: "Révoquée",
};

type InvitationRow = {
  id: string;
  email_hash: string;
  role: InvitationMemberRole;
  status: string;
  expires_at: string;
  created_at: string;
};

type Props = {
  organizationId: string;
  accessToken?: string;
  reportId?: string;
};

export default function OrganizationMembersPanel({
  organizationId,
  accessToken,
  reportId,
}: Props) {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assignOpen, setAssignOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [assignUserId, setAssignUserId] = useState("");
  const [assignRole, setAssignRole] = useState<InspectionAssignmentRole>("lead_inspector");
  const [assignStatus, setAssignStatus] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InvitationMemberRole>("inspector");
  const [inviteStatus, setInviteStatus] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);

  const authHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = {};
    if (accessToken?.trim()) {
      headers.Authorization = `Bearer ${accessToken.trim()}`;
    }
    return headers;
  }, [accessToken]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersRes, invRes] = await Promise.all([
        fetch(
          `/api/organization/members?organization_id=${encodeURIComponent(organizationId)}`,
          { headers: authHeaders() },
        ),
        fetch(
          `/api/organization/invitations?organization_id=${encodeURIComponent(organizationId)}`,
          { headers: authHeaders() },
        ),
      ]);
      const membersBody = (await membersRes.json().catch(() => null)) as
        | { members?: OrganizationMember[]; error?: string }
        | null;
      const invBody = (await invRes.json().catch(() => null)) as
        | { invitations?: InvitationRow[]; error?: string }
        | null;

      if (!membersRes.ok) {
        setError(membersBody?.error ?? `Erreur ${membersRes.status}`);
        setMembers([]);
      } else {
        setMembers(Array.isArray(membersBody?.members) ? membersBody.members : []);
      }

      if (invRes.ok && Array.isArray(invBody?.invitations)) {
        setInvitations(invBody.invitations);
      } else {
        setInvitations([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [organizationId, authHeaders]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function submitAssignment(action: "assign" | "unassign") {
    if (!reportId?.trim() || !assignUserId.trim()) {
      setAssignStatus("Rapport et membre requis.");
      return;
    }
    setAssignBusy(true);
    setAssignStatus(null);
    try {
      const res = await fetch("/api/inspection-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          report_id: reportId.trim(),
          organization_id: organizationId,
          assigned_to_user_id: assignUserId.trim(),
          role: assignRole,
          action,
        }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setAssignStatus(body?.error ?? `Erreur ${res.status}`);
        return;
      }
      setAssignStatus(action === "assign" ? "Assignation enregistrée." : "Assignation retirée.");
      setAssignOpen(false);
    } catch (e) {
      setAssignStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setAssignBusy(false);
    }
  }

  async function submitInvite() {
    if (!inviteEmail.trim()) {
      setInviteStatus("Courriel requis.");
      return;
    }
    setInviteBusy(true);
    setInviteStatus(null);
    setInviteLink(null);
    try {
      const res = await fetch("/api/organization/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          organization_id: organizationId,
          email: inviteEmail.trim(),
          role: inviteRole,
          action: "create",
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        invitation_link?: string;
      } | null;
      if (!res.ok) {
        setInviteStatus(body?.error ?? `Erreur ${res.status}`);
        return;
      }
      setInviteStatus("Invitation créée.");
      setInviteLink(body?.invitation_link ?? null);
      setInviteOpen(false);
      await reload();
    } catch (e) {
      setInviteStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(invitationId: string) {
    setInviteBusy(true);
    try {
      const res = await fetch("/api/organization/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({
          organization_id: organizationId,
          invitation_id: invitationId,
          action: "revoke",
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setInviteStatus(body?.error ?? "Révocation échouée");
        return;
      }
      await reload();
    } finally {
      setInviteBusy(false);
    }
  }

  const activeMembers = members.filter((m) => m.status === "active");

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Membres de l&apos;organisation</h2>
          <p className="mt-1 text-sm text-slate-600">
            Invitations (6D) et assignations d&apos;inspections (6C).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            disabled={inviteBusy}
            onClick={() => setInviteOpen((v) => !v)}
          >
            Inviter membre
          </button>
          {reportId?.trim() ? (
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              disabled={assignBusy}
              onClick={() => setAssignOpen((v) => !v)}
            >
              Assigner inspection
            </button>
          ) : null}
        </div>
      </div>

      {inviteOpen ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
          <label className="block text-slate-600">
            Courriel
            <input
              type="email"
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="inspecteur@exemple.com"
            />
          </label>
          <label className="mt-2 block text-slate-600">
            Rôle
            <select
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InvitationMemberRole)}
            >
              <option value="admin">Administrateur</option>
              <option value="inspector">Inspecteur</option>
              <option value="assistant">Assistant</option>
            </select>
          </label>
          <button
            type="button"
            disabled={inviteBusy}
            className="mt-3 rounded bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void submitInvite()}
          >
            Envoyer invitation
          </button>
        </div>
      ) : null}

      {inviteStatus ? <p className="mt-3 text-sm text-slate-600">{inviteStatus}</p> : null}
      {inviteLink ? (
        <p className="mt-1 break-all text-xs text-slate-500">
          Lien : {inviteLink}
        </p>
      ) : null}

      {assignOpen && reportId?.trim() ? (
        <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-800">Rapport {reportId.slice(0, 8)}…</p>
          <label className="mt-2 block text-slate-600">
            Membre
            <select
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5"
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
            >
              <option value="">— Choisir —</option>
              {activeMembers.map((m) => (
                <option key={m.id} value={m.user_id}>
                  {m.user_id.slice(0, 8)}… ({ROLE_LABEL[m.role]})
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-slate-600">
            Rôle d&apos;assignation
            <select
              className="mt-1 w-full rounded border border-slate-200 bg-white px-2 py-1.5"
              value={assignRole}
              onChange={(e) => setAssignRole(e.target.value as InspectionAssignmentRole)}
            >
              <option value="lead_inspector">Inspecteur principal</option>
              <option value="assistant">Assistant</option>
            </select>
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={assignBusy}
              className="rounded bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
              onClick={() => void submitAssignment("assign")}
            >
              Assigner
            </button>
            <button
              type="button"
              disabled={assignBusy}
              className="rounded border border-slate-300 px-3 py-1.5 text-slate-700 hover:bg-white disabled:opacity-50"
              onClick={() => void submitAssignment("unassign")}
            >
              Retirer
            </button>
          </div>
          {assignStatus ? <p className="mt-2 text-slate-600">{assignStatus}</p> : null}
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Chargement…</p>
      ) : error ? (
        <p className="mt-4 text-sm text-rose-700">{error}</p>
      ) : (
        <>
          {invitations.length > 0 ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-800">Invitations</h3>
              <ul className="mt-2 divide-y divide-slate-100">
                {invitations.map((inv) => (
                  <li
                    key={inv.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <span className="font-mono text-xs text-slate-500">
                      {inv.email_hash.slice(0, 12)}…
                    </span>
                    <span>{ROLE_LABEL[inv.role]}</span>
                    <span className="text-slate-600">
                      {INVITE_STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                    {inv.status === "pending" ? (
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        disabled={inviteBusy}
                        onClick={() => void revokeInvite(inv.id)}
                      >
                        Révoquer
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {members.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Aucun membre.</p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
                >
                  <span className="font-mono text-slate-800">{member.user_id.slice(0, 8)}…</span>
                  <span className="text-slate-600">{ROLE_LABEL[member.role]}</span>
                  <span
                    className={
                      member.status === "active"
                        ? "text-emerald-700"
                        : member.status === "disabled"
                          ? "text-rose-700"
                          : "text-amber-700"
                    }
                  >
                    {STATUS_LABEL[member.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
