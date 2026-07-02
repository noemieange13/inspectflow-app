/**
 * Phase 6D — organization_invitations
 * `npm run test:organization-invitations-6d`
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  buildAccessContext,
  canManageOrganization,
} from "@/lib/access_control";
import {
  acceptOrganizationInvitation,
  canAcceptInvitationAsUser,
  canManageInvitations,
  createOrganizationInvitation,
  hashInvitationEmail,
  hashInvitationToken,
  invitationTokensMatch,
  revokeOrganizationInvitation,
} from "@/lib/organization_invitations";

const ORG = "22222222-2222-2222-2222-222222222222";
const ADMIN = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const ASSIST = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const USER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

type Row = Record<string, unknown>;

function mockSupabase() {
  const invitations: Row[] = [];
  const members: Row[] = [];
  let idSeq = 0;

  return {
    invitations,
    members,
    client: {
      from(table: string) {
        if (table === "organization_invitations") {
          return {
            select: () => ({
              eq: (col: string, val: unknown) => ({
                eq: (col2: string, val2: unknown) => ({
                  eq: (col3: string, val3: unknown) => ({
                    async then() {
                      return { data: [], error: null };
                    },
                  }),
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
                maybeSingle: async () => {
                  const row = invitations.find((r) => r[col] === val);
                  return { data: row ?? null, error: null };
                },
              }),
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
              maybeSingle: async () => {
                const row = invitations.find((r) => r.token_hash === val);
                return { data: row ?? null, error: null };
              },
            }),
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  idSeq += 1;
                  const row = { ...payload, id: `inv-${idSeq}`, created_at: new Date().toISOString() };
                  invitations.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
            update: (patch: Row) => ({
              eq: (col: string, val: unknown) => ({
                eq: (col2: string, val2: unknown) => ({
                  eq: (col3: string, val3: unknown) => ({
                    select: () => ({
                      maybeSingle: async () => {
                        const row = invitations.find(
                          (r) => r[col] === val && r[col2] === val2 && r.status === val3,
                        );
                        if (row) Object.assign(row, patch);
                        return { data: row ?? null, error: null };
                      },
                    }),
                  }),
                  select: () => ({
                    maybeSingle: async () => {
                      const row = invitations.find((r) => r[col] === val);
                      if (row) Object.assign(row, patch);
                      return { data: row ?? null, error: null };
                    },
                  }),
                }),
                select: () => ({
                  maybeSingle: async () => {
                    const row = invitations.find((r) => r[col] === val);
                    if (row) Object.assign(row, patch);
                    return { data: row ?? null, error: null };
                  },
                }),
              }),
            }),
          };
        }
        if (table === "organization_members") {
          return {
            select: () => ({
              eq: (col: string, val: unknown) => ({
                eq: (col2: string, val2: unknown) => ({
                  maybeSingle: async () => {
                    const row = members.find((m) => m[col] === val && m[col2] === val2);
                    return { data: row ?? null, error: null };
                  },
                }),
              }),
            }),
            insert: (payload: Row) => ({
              select: () => ({
                single: async () => {
                  idSeq += 1;
                  const row = { ...payload, id: `mem-${idSeq}` };
                  members.push(row);
                  return { data: row, error: null };
                },
              }),
            }),
            update: (patch: Row) => ({
              eq: () => ({
                async then() {
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === "reports") {
          return {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      },
    },
  };
}

describe("Phase 6D organization invitations", () => {
  it("A) admin invite inspecteur → invitation pending", async () => {
    const mock = mockSupabase();
    const created = await createOrganizationInvitation(mock.client as never, {
      organization_id: ORG,
      email: "inspector@example.com",
      role: "inspector",
      invited_by_user_id: ADMIN,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;
    assert.equal(created.result.invitation.status, "pending");
    assert.equal(created.result.invitation.role, "inspector");
    assert.ok(created.result.invitation_token.length >= 32);
    assert.doesNotMatch(
      JSON.stringify(mock.invitations[0]),
      new RegExp(created.result.invitation_token),
    );
    assert.equal(
      mock.invitations[0]?.token_hash,
      hashInvitationToken(created.result.invitation_token),
    );
  });

  it("B) utilisateur accepte → organization_member active", async () => {
    const email = "joiner@example.com";
    const rawToken = "abc123def456abc123def456abc123def456abc123def456abc123def456";
    const mock = mockSupabase();
    mock.invitations.push({
      id: "inv-1",
      organization_id: ORG,
      email_hash: hashInvitationEmail(email),
      role: "inspector",
      invited_by_user_id: ADMIN,
      token_hash: hashInvitationToken(rawToken),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      accepted_at: null,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    const result = await acceptOrganizationInvitation(mock.client as never, {
      rawToken,
      userId: USER,
      userEmail: email,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.role, "inspector");
    assert.equal(mock.members.length, 1);
    assert.equal(mock.members[0]?.status, "active");
    assert.equal(mock.invitations[0]?.status, "accepted");
  });

  it("C) token expiré → refus", async () => {
    const email = "late@example.com";
    const rawToken = "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const mock = mockSupabase();
    mock.invitations.push({
      id: "inv-exp",
      organization_id: ORG,
      email_hash: hashInvitationEmail(email),
      role: "inspector",
      invited_by_user_id: ADMIN,
      token_hash: hashInvitationToken(rawToken),
      expires_at: new Date(Date.now() - 1000).toISOString(),
      accepted_at: null,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    const result = await acceptOrganizationInvitation(mock.client as never, {
      rawToken,
      userId: USER,
      userEmail: email,
    });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "expired");
  });

  it("D) assistant tente inviter → interdit", () => {
    const ctx = buildAccessContext(
      {
        id: ASSIST,
        membership: { organization_id: ORG, role: "assistant", status: "active" },
      },
      {
        report_id: "",
        inspection_id: null,
        organization_id: ORG,
        owner_user_id: ADMIN,
      },
      null,
    );
    assert.equal(canManageInvitations(ctx), false);
    assert.equal(canManageOrganization(ctx), false);
  });

  it("E) révocation → token invalide", async () => {
    const rawToken = "revokeme1234567890revokeme1234567890revokeme1234567890ab";
    const mock = mockSupabase();
    mock.invitations.push({
      id: "inv-rev",
      organization_id: ORG,
      email_hash: hashInvitationEmail("x@example.com"),
      role: "inspector",
      invited_by_user_id: ADMIN,
      token_hash: hashInvitationToken(rawToken),
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      accepted_at: null,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    const revoked = await revokeOrganizationInvitation(mock.client as never, {
      organization_id: ORG,
      invitation_id: "inv-rev",
    });
    assert.equal(revoked.ok, true);
    assert.equal(mock.invitations[0]?.status, "revoked");

    const accept = await acceptOrganizationInvitation(mock.client as never, {
      rawToken,
      userId: USER,
      userEmail: "x@example.com",
    });
    assert.equal(accept.ok, false);
    if (accept.ok) return;
    assert.equal(accept.reason, "revoked");
  });
});

describe("Phase 6D tokens", () => {
  it("hash email stable + token jamais égal au hash stocké en clair", () => {
    const email = "Test@Example.COM";
    assert.equal(hashInvitationEmail(email), hashInvitationEmail("test@example.com"));
    const raw = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    assert.ok(invitationTokensMatch(raw, hashInvitationToken(raw)));
    assert.notEqual(raw, hashInvitationToken(raw));
  });

  it("email mismatch on accept", () => {
    assert.equal(
      canAcceptInvitationAsUser({
        userEmail: "other@example.com",
        invitationEmailHash: hashInvitationEmail("target@example.com"),
      }),
      false,
    );
  });
});

describe("Phase 6D non-régression", () => {
  const root = join(process.cwd());

  it("6A access_control permissions.ts inchangé structure", () => {
    const perms = readFileSync(join(root, "lib/access_control/permissions.ts"), "utf8");
    assert.match(perms, /export function canManageOrganization/);
    assert.doesNotMatch(perms, /organization_invitations/);
  });

  it("6B usage_control inchangé", () => {
    const u = readFileSync(join(root, "lib/usage_control/trackUsage.ts"), "utf8");
    assert.doesNotMatch(u, /organization_invitations/);
  });

  it("6C inspection_assignments inchangé", () => {
    const a = readFileSync(join(root, "lib/team_collaboration/assignments.ts"), "utf8");
    assert.doesNotMatch(a, /organization_invitations/);
  });

  it("PDF / photos / IA intacts", () => {
    assert.doesNotMatch(
      readFileSync(join(root, "supabase/functions/reports-pdf/index.ts"), "utf8"),
      /organization_invitations/,
    );
    assert.doesNotMatch(
      readFileSync(join(root, "app/api/upload-photo/route.ts"), "utf8"),
      /organization_invitations/,
    );
    assert.doesNotMatch(
      readFileSync(join(root, "lib/analyzeInspectionPhoto.ts"), "utf8"),
      /organization_invitations/,
    );
  });
});
