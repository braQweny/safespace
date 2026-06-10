import { createClient } from "@/lib/supabase";
import { adminError, adminOk, type AdminResult } from "./errors";
import type { AccountAccessState, AdminBlockReasonCode, AdminRouteContext, AdminSupabaseClient } from "./types";
import { isRecord } from "@/lib/type-guards";

const ACCOUNT_ACCESS_SELECT = "user_id,blocked_at,block_reason_code";

interface AccountAccessRow {
  user_id: string;
  blocked_at: string | null;
  block_reason_code: AdminBlockReasonCode | null;
}

function coerceAccountAccessRow(value: unknown): AccountAccessRow | null {
  if (!isRecord(value) || typeof value.user_id !== "string") {
    return null;
  }

  const blockedAt = typeof value.blocked_at === "string" ? value.blocked_at : null;
  const blockReasonCode = typeof value.block_reason_code === "string" ? value.block_reason_code : null;

  return {
    user_id: value.user_id,
    blocked_at: blockedAt,
    block_reason_code: blockReasonCode as AdminBlockReasonCode | null,
  };
}

export function toAccountAccessState(userId: string, row: AccountAccessRow | null): AccountAccessState {
  if (!row?.blocked_at) {
    return {
      userId,
      status: "active",
      blockedAt: null,
      blockReasonCode: null,
    };
  }

  return {
    userId,
    status: "blocked",
    blockedAt: row.blocked_at,
    blockReasonCode: row.block_reason_code,
  };
}

export async function readAccountAccessState(
  context: AdminRouteContext,
  client?: AdminSupabaseClient | null,
): Promise<AdminResult<AccountAccessState>> {
  const user = context.locals.user;

  if (!user) {
    return adminError("missing_auth");
  }

  const accountClient = client === undefined ? createClient(context.request.headers, context.cookies) : client;

  if (!accountClient) {
    return adminError("account_access_unavailable");
  }

  const { data, error } = await accountClient
    .from("admin_user_profiles")
    .select(ACCOUNT_ACCESS_SELECT)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return adminError("account_access_unavailable");
  }

  return adminOk(toAccountAccessState(user.id, coerceAccountAccessRow(data)));
}

export async function requireActiveAccountAccess(
  context: AdminRouteContext,
  client?: AdminSupabaseClient | null,
): Promise<AdminResult<AccountAccessState>> {
  const access = await readAccountAccessState(context, client);

  if (!access.ok) {
    return access;
  }

  if (access.data.status === "blocked") {
    return adminError("account_blocked");
  }

  return access;
}
