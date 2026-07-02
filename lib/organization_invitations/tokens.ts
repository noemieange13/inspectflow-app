import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const INVITATION_TOKEN_BYTES = 32;
export const DEFAULT_INVITATION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export function normalizeInvitationEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashInvitationEmail(email: string): string {
  return createHash("sha256")
    .update(normalizeInvitationEmail(email), "utf8")
    .digest("hex");
}

export function generateInvitationToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString("hex");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim(), "utf8").digest("hex");
}

export function invitationTokensMatch(rawToken: string, storedHash: string): boolean {
  const computed = hashInvitationToken(rawToken);
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(storedHash.trim(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function defaultInvitationExpiresAt(msFromNow = DEFAULT_INVITATION_TTL_MS): Date {
  return new Date(Date.now() + msFromNow);
}

export function buildInvitationLink(rawToken: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return `${base}/organization/join?token=${encodeURIComponent(rawToken)}`;
}
