import type { APIRoute } from "astro";
import { requireActiveAccountAccess } from "@/lib/admin/account-access";
import type { AdminErrorCode } from "@/lib/admin/errors";
import { getSessionDataContext } from "@/lib/session-data/auth";
import { readSessionHistoryList } from "@/lib/session-flow/session-history";
import { sessionHistoryFailure, type SessionHistoryFailureCode } from "@/lib/session-flow/session-history-contract";

function getFailureStatus(code: SessionHistoryFailureCode) {
  if (code === "missing_auth") {
    return 401;
  }

  if (code === "account_blocked") {
    return 403;
  }

  if (code === "invalid_avatar" || code === "invalid_page") {
    return 400;
  }

  return 503;
}

function mapAccountAccessFailureCode(code: AdminErrorCode): SessionHistoryFailureCode {
  if (code === "missing_auth" || code === "account_blocked") {
    return code;
  }

  return "account_access_unavailable";
}

function jsonResponse(
  body: ReturnType<typeof sessionHistoryFailure> | Awaited<ReturnType<typeof readSessionHistoryList>>,
) {
  const status = body.ok ? 200 : getFailureStatus(body.code);
  return Response.json(body, { status });
}

export const GET: APIRoute = async (context) => {
  const sessionContext = getSessionDataContext(context);

  if (!sessionContext.ok) {
    return jsonResponse(sessionHistoryFailure(sessionContext.error.code));
  }

  const accountAccess = await requireActiveAccountAccess(context, sessionContext.data.supabase);

  if (!accountAccess.ok) {
    return jsonResponse(sessionHistoryFailure(mapAccountAccessFailureCode(accountAccess.error.code)));
  }

  const response = await readSessionHistoryList(sessionContext.data, {
    avatar: context.url.searchParams.get("avatar"),
    page: context.url.searchParams.get("page"),
  });

  return jsonResponse(response);
};
