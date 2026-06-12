import { useEffect, useRef, useState } from "react";
import { requestApiJson } from "@/lib/api-client";
import type { LatestSessionSummaryState } from "@/lib/session-data/types";
import {
  isSessionSummaryApprovedSuccess,
  isSessionSummaryFailure,
  isSessionSummaryGeneratedSuccess,
  type SessionSummaryFailureCode,
} from "@/lib/session-flow/session-summary-contract";

export type SessionSummaryStatus = "idle" | "generating" | "approving";

export function useSessionSummary(initialSummary?: LatestSessionSummaryState | null) {
  const [summaryState, setSummaryState] = useState<LatestSessionSummaryState>(
    initialSummary ?? {
      kind: "none",
    },
  );
  const [summaryStatus, setSummaryStatus] = useState<SessionSummaryStatus>("idle");
  const [summaryErrorCode, setSummaryErrorCode] = useState<SessionSummaryFailureCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function startRequest() {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    return controller;
  }

  async function generateSummary(sessionId: string) {
    const controller = startRequest();

    setSummaryStatus("generating");
    setSummaryErrorCode(null);

    const result = await requestApiJson(`/api/session/summary/${encodeURIComponent(sessionId)}`, {
      method: "POST",
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      return;
    }

    const body = result.kind === "json" ? result.body : null;

    if (!isSessionSummaryGeneratedSuccess(body)) {
      setSummaryErrorCode(isSessionSummaryFailure(body) ? body.code : "provider_unavailable");
      setSummaryStatus("idle");
      return;
    }

    setSummaryState({
      kind: "preview",
      summary: body.summary,
    });
    setSummaryStatus("idle");
  }

  async function approveSummary(sessionId: string) {
    if (summaryState.kind === "none") {
      return;
    }

    const controller = startRequest();

    setSummaryStatus("approving");
    setSummaryErrorCode(null);

    const result = await requestApiJson(`/api/session/summary/${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      body: JSON.stringify({
        revision: summaryState.summary.revision,
      }),
      signal: controller.signal,
    });

    if (controller.signal.aborted) {
      return;
    }

    const body = result.kind === "json" ? result.body : null;

    if (!isSessionSummaryApprovedSuccess(body)) {
      setSummaryErrorCode(isSessionSummaryFailure(body) ? body.code : "approval_failed");
      setSummaryStatus("idle");
      return;
    }

    setSummaryState({
      kind: "approved",
      summary: body.summary,
    });
    setSummaryStatus("idle");
  }

  function syncSummary(next: LatestSessionSummaryState) {
    setSummaryState(next);
    setSummaryErrorCode(null);
  }

  function resetSummary() {
    setSummaryState({
      kind: "none",
    });
    setSummaryErrorCode(null);
  }

  return {
    summaryState,
    summaryStatus,
    summaryErrorCode,
    generateSummary,
    approveSummary,
    syncSummary,
    resetSummary,
  };
}
