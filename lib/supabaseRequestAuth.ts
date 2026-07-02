/**
 * Pilot #0.8 — unified Supabase auth resolution for document intake API routes.
 *
 * Browser sessions are read from Authorization Bearer (client) or Supabase auth cookies.
 */
import type { NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  traceDocumentAuthFlow,
  type DocumentAuthSource,
} from "@/lib/documentAuthTrace";
import { isDevAuthBypass } from "@/lib/devInspectorMode";
import { resolveDevSupabaseUserId } from "@/lib/devInspectorUserId";

export type RequestAuthState = {
  hasSession: boolean;
  hasUser: boolean;
  userId: string | null;
  authSource: DocumentAuthSource;
  accessToken: string | null;
};

function createAnonSupabaseClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)/i.exec(auth.trim());
  return match?.[1] ?? null;
}

export function parseSupabaseAuthCookieValue(raw: string): string | null {
  const candidates = [raw, decodeURIComponent(raw)];
  for (const value of candidates) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed) && typeof parsed[0] === "string" && parsed[0].length > 0) {
        return parsed[0];
      }
      if (
        parsed &&
        typeof parsed === "object" &&
        "access_token" in parsed &&
        typeof (parsed as { access_token?: unknown }).access_token === "string"
      ) {
        return (parsed as { access_token: string }).access_token;
      }
    } catch {
      /* try next decode */
    }
  }
  return null;
}

export function readSupabaseAuthCookieToken(req: NextRequest): string | null {
  for (const cookie of req.cookies.getAll()) {
    if (!cookie.name.includes("auth-token")) continue;
    const token = parseSupabaseAuthCookieValue(cookie.value);
    if (token) return token;
  }
  return null;
}

async function resolveUserFromToken(
  token: string,
  authSource: Exclude<DocumentAuthSource, "none" | "supabase">,
): Promise<RequestAuthState> {
  const supabase = createAnonSupabaseClient();
  if (!supabase) {
    return {
      hasSession: true,
      hasUser: false,
      userId: null,
      authSource: "none",
      accessToken: token,
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  const userId = !error && data?.user?.id ? data.user.id : null;

  return {
    hasSession: true,
    hasUser: Boolean(userId),
    userId,
    authSource: userId ? authSource : "none",
    accessToken: token,
  };
}

export async function resolveRequestAuth(
  req: NextRequest,
  route: string,
): Promise<RequestAuthState> {
  const bearer = readBearerToken(req);
  const cookieToken = readSupabaseAuthCookieToken(req);
  const token = bearer ?? cookieToken;

  let state: RequestAuthState = {
    hasSession: false,
    hasUser: false,
    userId: null,
    authSource: "none",
    accessToken: null,
  };

  if (token) {
    state = await resolveUserFromToken(token, bearer ? "client" : "cookie");
  }

  if (!state.hasUser && isDevAuthBypass()) {
    const userId = await resolveDevSupabaseUserId();
    if (userId) {
      state = {
        hasSession: true,
        hasUser: true,
        userId,
        authSource: "client",
        accessToken: token,
      };
    }
  }

  traceDocumentAuthFlow({
    route,
    hasSession: state.hasSession,
    hasUser: state.hasUser,
    userId: state.userId,
    authSource: state.authSource,
  });

  return state;
}

export async function requireRequestAuth(
  req: NextRequest,
  route: string,
): Promise<RequestAuthState | null> {
  const state = await resolveRequestAuth(req, route);
  return state.hasUser ? state : null;
}
