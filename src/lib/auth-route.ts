/**
 * Shared plumbing for the form-based auth endpoints: one place that builds the
 * operational context, resolves the Supabase SSR client, and pairs each
 * redirect with its operational log entry so the two can't drift apart.
 */
import type { APIContext } from "astro";
import { getAuthErrorRedirect, type AuthErrorCode } from "@/lib/auth-errors";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import { buildOperationalRequestContext } from "@/lib/operational-visibility/request-context";
import type {
  OperationalEventLevel,
  OperationalEventName,
  OperationalEventOutcome,
  OperationalEventProvider,
  OperationalReasonCode,
} from "@/lib/operational-visibility/types";
import { createClient } from "@/lib/supabase";

interface AuthFailureOptions {
  level?: OperationalEventLevel;
  /** Defaults to `failure`; `blocked` marks a provider-side rate limit. */
  outcome?: Extract<OperationalEventOutcome, "failure" | "blocked">;
  provider?: OperationalEventProvider;
  status?: 302 | 303;
}

interface AuthSuccessOptions {
  provider?: OperationalEventProvider;
  status?: 302 | 303;
}

// Wspólny czytnik formularzy żyje w `auth-validation.ts` (nie ciągnie
// `astro:env`); tu zostaje re-eksport dla dotychczasowych importów.
export { readFormData } from "@/lib/auth-validation";

export async function createAuthRoute(context: APIContext, event: OperationalEventName) {
  const operationalContext = await buildOperationalRequestContext(context);
  const supabase = createClient(context.request.headers, context.cookies);

  function logFailure(reasonCode: OperationalReasonCode, options: AuthFailureOptions = {}) {
    logOperationalEvent(
      {
        event,
        level: options.level ?? "warn",
        outcome: options.outcome ?? "failure",
        status: options.status ?? 303,
        reasonCode,
        ...(options.provider ? { provider: options.provider } : {}),
      },
      operationalContext,
    );
  }

  function failureRedirect(errorPath: string, reasonCode: AuthErrorCode, options: AuthFailureOptions = {}) {
    logFailure(reasonCode, options);
    return context.redirect(getAuthErrorRedirect(errorPath, reasonCode), options.status ?? 303);
  }

  function successRedirect(target: string, options: AuthSuccessOptions = {}) {
    logOperationalEvent(
      {
        event,
        level: "info",
        outcome: "success",
        status: options.status ?? 303,
        provider: options.provider ?? "supabase",
      },
      operationalContext,
    );

    return context.redirect(target, options.status ?? 303);
  }

  return { supabase, operationalContext, logFailure, failureRedirect, successRedirect };
}
