import { createClient } from "@/lib/supabase";
import { adminError, adminOk, type AdminResult } from "./errors";
import { readAccountAccessState } from "./account-access";
import type { AdminContext, AdminRouteContext } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readBooleanRpcResult(value: unknown) {
  if (!isRecord(value) || !("data" in value) || !("error" in value)) {
    return null;
  }

  return {
    data: value.data,
    error: value.error,
  };
}

export async function getAdminContext(context: AdminRouteContext): Promise<AdminResult<AdminContext>> {
  const user = context.locals.user;

  if (!user) {
    return adminError("missing_auth");
  }

  const supabase = createClient(context.request.headers, context.cookies);

  if (!supabase) {
    return adminError("admin_data_unavailable");
  }

  const account = await readAccountAccessState(context, supabase);

  if (!account.ok) {
    return adminError(account.error.code === "missing_auth" ? "missing_auth" : "admin_data_unavailable");
  }

  if (account.data.status === "blocked") {
    return adminError("blocked_admin");
  }

  const adminMembership = readBooleanRpcResult(await supabase.rpc("is_private_admin"));

  if (!adminMembership || adminMembership.error || typeof adminMembership.data !== "boolean") {
    return adminError("admin_data_unavailable");
  }

  if (!adminMembership.data) {
    return adminError("not_admin");
  }

  return adminOk({
    supabase,
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    account: account.data,
  });
}
