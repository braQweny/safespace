import type { Locale } from "@/lib/i18n/locale";
import type { LiveSideband, LiveSidebandCommand } from "@/lib/openai/live";
import { logOperationalEvent } from "@/lib/operational-visibility/logger";
import {
  buildSessionSafetyEvaluatedEventFromDecision,
  buildSessionVoiceClosedEvent,
  buildSessionVoiceObserverEvent,
  type SessionVoiceObserverReasonCode,
} from "@/lib/operational-visibility/session-events";
import { resolveSessionPhase } from "@/lib/session-flow/session-phase";
import { parseVoiceLiveEvent } from "@/lib/session-flow/voice-live-events";
import {
  createVoiceTranscriptState,
  flushAllVoiceUtterances,
  flushIdleVoiceUtterances,
  nextIdleFlushAt,
  pushVoiceFragment,
  type VoiceTranscriptState,
  type VoiceUtterance,
} from "@/lib/session-flow/voice-transcript";
import { evaluateSessionSafety } from "@/lib/session-safety/evaluate-session-safety";
import type { SessionSafetyProvider } from "@/lib/session-safety/provider";
import { isFailClosedSessionSafetyReasonCode } from "@/lib/session-safety/reason-codes";
import type { SessionSafetyDecision } from "@/lib/session-safety/types";
import { VOICE_DRAIN_BATCH, VOICE_HANDOFF_GRACE_MS, VOICE_SAFETY_CONTEXT_UTTERANCES } from "./constants";
import {
  acceptsEpoch,
  applySafetyOutcome,
  armObserverState,
  closeObserverState,
  createInitialObserverState,
  decideAlarm,
  nextAlarmAt,
  resolveVoiceDeadlineAtMs,
  scheduleCrisisHangup,
  shouldAppendConstraints,
  shouldAppendPhase,
  type VoiceCloseReason,
  type VoiceObserverState,
} from "./observer-state";
import type { StoredVoiceUtterance, VoiceObserverStore } from "./observer-store";
import { buildVoiceConstraintsLine, getVoicePhaseLine, getVoiceSteeringCopy } from "./steering-copy";

/**
 * Rdzeń obserwatora rozmowy głosowej — cała logika Durable Object bez
 * runtime Cloudflare: zależności (sideband, hangup, klasyfikator, alarm,
 * zegar, timer) są wstrzykiwane, stan i bufor idą przez `VoiceObserverStore`.
 *
 * Co robi: przyjmuje transkrypt obu ról z sideband, grupuje go w wypowiedzi
 * (`voice-transcript.ts`), zapisuje je do bufora **przed** klasyfikacją,
 * klasyfikuje każdą wypowiedź użytkownika, steruje modelem (faza rozmowy,
 * ograniczenia, pauza przy awarii klasyfikatora, zdanie przekazania przy
 * kryzysie), rotuje sideband co 12 minut, rozłącza na termin i utratę pulsu.
 * Zapis do bazy robi trasa heartbeatu pod RLS właściciela (`drain` + `ack`).
 *
 * Nigdy nie loguje treści, identyfikatora sesji live ani czasów wypowiedzi.
 */
export interface VoiceObserverDeps {
  openSideband(liveSessionId: string): Promise<LiveSideband>;
  hangup(liveSessionId: string): Promise<"closed" | "already_closed">;
  safetyProvider: SessionSafetyProvider;
  scheduleAlarm(atMs: number | null): Promise<void>;
  now(): number;
  randomUUID(): string;
  setTimer(callback: () => void, delayMs: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface ArmVoiceObserverInput {
  liveSessionId: string;
  startedAtMs: number;
  expiresAtMs: number;
  locale: Locale;
  avatarName: string;
}

export interface VoiceObserverSnapshot {
  epoch: number;
  /** Sesja live nie została przez nas zamknięta (może być w trakcie zamykania po kryzysie). */
  live: boolean;
  closeReason: VoiceCloseReason | null;
  deadlineAtMs: number | null;
  armedAtMs: number | null;
  /** Czy sideband jest w tej chwili otwarty. */
  observing: boolean;
  pendingUtterances: number;
}

export interface DrainedVoiceUtterance {
  ordinal: number;
  utteranceId: string;
  role: "user" | "assistant";
  content: string;
}

export interface VoiceObserverDrainResult extends VoiceObserverSnapshot {
  utterances: DrainedVoiceUtterance[];
}

const PROVIDER = "openai" as const;

export class VoiceObserverCore {
  private state: VoiceObserverState;
  private sideband: LiveSideband | null = null;
  private transcript: VoiceTranscriptState = createVoiceTranscriptState();
  private idleTimer: unknown = null;

  constructor(
    private readonly store: VoiceObserverStore,
    private readonly deps: VoiceObserverDeps,
  ) {
    this.state = store.loadState() ?? createInitialObserverState();
  }

  async arm(input: ArmVoiceObserverInput): Promise<{ epoch: number; deadlineAtMs: number | null; observing: boolean }> {
    const now = this.deps.now();
    this.closeTranscript();

    if (this.state.liveSessionId && this.state.closedAtMs === null) {
      // Reconnect: the previous live session is replaced, never left running.
      await this.hangupProvider(this.state.liveSessionId);
      this.log(
        buildSessionVoiceClosedEvent({
          reasonCode: this.state.closeReason ?? "reconnected",
          durationMs: this.liveDurationMs(now),
          provider: PROVIDER,
        }),
      );
    }

    this.detachSideband();
    this.state = armObserverState(this.state, { ...input, nowMs: now });
    this.transcript = createVoiceTranscriptState();
    this.persist();
    const observing = await this.attach("observer_attached");
    await this.rescheduleAlarm();

    return { epoch: this.state.epoch, deadlineAtMs: resolveVoiceDeadlineAtMs(this.state.expiresAtMs), observing };
  }

  async beat(): Promise<VoiceObserverSnapshot> {
    if (this.state.closeReason === null && this.state.liveSessionId) {
      this.state = { ...this.state, lastBeatAtMs: this.deps.now() };
      this.persist();

      if (!this.sideband?.open) {
        await this.attach("observer_reattached");
      }

      await this.rescheduleAlarm();
    }

    return this.snapshot();
  }

  drain(limit: number = VOICE_DRAIN_BATCH): Promise<VoiceObserverDrainResult> {
    this.flushIdle();
    const utterances = this.store
      .listPending(Math.min(Math.max(1, limit), VOICE_DRAIN_BATCH))
      .map(({ ordinal, utteranceId, role, content }) => ({ ordinal, utteranceId, role, content }));

    return Promise.resolve({ ...this.snapshot(), utterances });
  }

  ack(ordinals: readonly number[]): Promise<void> {
    this.store.markDrained(ordinals.filter((ordinal) => Number.isInteger(ordinal) && ordinal > 0));
    return Promise.resolve();
  }

  async hangupNow(reason: VoiceCloseReason): Promise<VoiceObserverSnapshot> {
    const now = this.deps.now();
    this.closeTranscript();

    // `closedAtMs` means the provider hangup happened; a reason scheduled
    // earlier (crisis handoff) wins over the one the alarm passes in.
    if (this.state.liveSessionId && this.state.closedAtMs === null) {
      await this.hangupProvider(this.state.liveSessionId);
      this.state = closeObserverState(this.state, reason, now);
      this.persist();
      this.log(
        buildSessionVoiceClosedEvent({
          reasonCode: this.state.closeReason ?? reason,
          durationMs: this.liveDurationMs(now),
          provider: PROVIDER,
        }),
      );
    }

    this.detachSideband();
    await this.rescheduleAlarm();

    return this.snapshot();
  }

  async purge(): Promise<void> {
    this.detachSideband();
    this.clearIdleTimer();
    this.store.deleteAll();
    this.state = createInitialObserverState();
    this.transcript = createVoiceTranscriptState();
    await this.deps.scheduleAlarm(null);
  }

  getState(): Promise<VoiceObserverSnapshot> {
    return Promise.resolve(this.snapshot());
  }

  async alarm(): Promise<void> {
    const decision = decideAlarm(this.state, this.deps.now(), this.sideband?.open ?? false);

    switch (decision.action) {
      case "hangup":
        await this.hangupNow(decision.reason);
        return;
      case "purge":
        await this.purge();
        return;
      case "reattach":
        await this.attach("observer_reattached");
        break;
      case "rotate":
        await this.attach("observer_rotated");
        break;
      case "idle":
        break;
    }

    await this.rescheduleAlarm();
  }

  // ---------- sideband ----------

  private async attach(reason: SessionVoiceObserverReasonCode): Promise<boolean> {
    const liveSessionId = this.state.liveSessionId;

    if (!liveSessionId || this.state.closeReason !== null) {
      return false;
    }

    const epoch = this.state.epoch;
    const startedAt = this.deps.now();
    let sideband: LiveSideband;

    try {
      sideband = await this.deps.openSideband(liveSessionId);
    } catch {
      this.log(
        buildSessionVoiceObserverEvent({
          outcome: "failure",
          reasonCode: "observer_attach_failed",
          durationMs: this.deps.now() - startedAt,
          provider: PROVIDER,
        }),
      );
      return false;
    }

    if (!acceptsEpoch(this.state, epoch)) {
      sideband.close();
      return false;
    }

    const previous = this.sideband;
    this.sideband = sideband;
    this.state = { ...this.state, sidebandOpenedAtMs: this.deps.now() };
    this.persist();
    sideband.onEvent((raw) => {
      this.handleRaw(raw, epoch);
    });
    sideband.onClose(() => {
      if (this.sideband === sideband) {
        this.sideband = null;
      }
    });

    // Rotation: the old socket closes only after the new one is live, so no
    // fragment falls into the gap; duplicates are dropped by the grouping key.
    if (previous) {
      previous.close();
    }
    this.log(
      buildSessionVoiceObserverEvent({
        outcome: "success",
        reasonCode: reason,
        durationMs: this.deps.now() - startedAt,
        provider: PROVIDER,
      }),
    );

    return true;
  }

  private detachSideband() {
    const sideband = this.sideband;
    this.sideband = null;
    sideband?.close();
  }

  private handleRaw(raw: string, epoch: number) {
    if (!acceptsEpoch(this.state, epoch)) {
      return;
    }

    const event = parseVoiceLiveEvent(raw);

    if (event.kind === "input_fragment" || event.kind === "output_fragment") {
      const now = this.deps.now();
      const { state, closed } = pushVoiceFragment(
        this.transcript,
        {
          speaker: event.kind === "input_fragment" ? "user" : "assistant",
          text: event.delta,
          startMs: event.startMs,
          endMs: event.endMs,
          epoch,
        },
        now,
      );
      this.transcript = state;
      this.onUtterances(closed, epoch);
      this.scheduleIdleFlush();
      return;
    }

    if (event.kind === "session_closed") {
      this.closeTranscript();

      if (this.state.closeReason === null) {
        const now = this.deps.now();
        this.state = closeObserverState(this.state, "provider_closed", now);
        this.persist();
        this.log(
          buildSessionVoiceClosedEvent({
            reasonCode: "provider_closed",
            durationMs: this.liveDurationMs(now),
            provider: PROVIDER,
          }),
        );
        void this.rescheduleAlarm();
      }
    }
  }

  // ---------- transcript ----------

  private scheduleIdleFlush() {
    this.clearIdleTimer();
    const at = nextIdleFlushAt(this.transcript);

    if (at !== null) {
      this.idleTimer = this.deps.setTimer(
        () => {
          this.idleTimer = null;
          this.flushIdle();
          this.scheduleIdleFlush();
        },
        Math.max(0, at - this.deps.now()),
      );
    }
  }

  private clearIdleTimer() {
    if (this.idleTimer !== null) {
      this.deps.clearTimer(this.idleTimer);
      this.idleTimer = null;
    }
  }

  private flushIdle() {
    const { state, closed } = flushIdleVoiceUtterances(this.transcript, this.deps.now());
    this.transcript = state;
    this.onUtterances(closed, this.state.epoch);
  }

  private closeTranscript() {
    this.clearIdleTimer();
    const { state, closed } = flushAllVoiceUtterances(this.transcript);
    this.transcript = state;
    this.onUtterances(closed, this.state.epoch, { classify: false });
  }

  private onUtterances(utterances: readonly VoiceUtterance[], epoch: number, options: { classify?: boolean } = {}) {
    for (const utterance of utterances) {
      let stored: StoredVoiceUtterance;

      try {
        stored = this.store.insertUtterance({
          utteranceId: this.deps.randomUUID(),
          role: utterance.speaker,
          content: utterance.text,
          createdAtMs: this.deps.now(),
        });
      } catch {
        continue;
      }

      if (utterance.speaker === "user" && options.classify !== false) {
        void this.classify(stored, epoch);
      }
    }
  }

  // ---------- safety and steering ----------

  private async classify(utterance: StoredVoiceUtterance, epoch: number) {
    const startedAt = this.deps.now();
    const recent = this.store
      .listRecentUserTexts(VOICE_SAFETY_CONTEXT_UTTERANCES + 1)
      .filter((text) => text !== utterance.content)
      .slice(-VOICE_SAFETY_CONTEXT_UTTERANCES);
    const decision = await evaluateSessionSafety(
      { currentUserMessage: utterance.content, recentUserMessages: recent, metadata: { locale: this.state.locale } },
      { provider: this.deps.safetyProvider },
    );
    this.log(
      buildSessionSafetyEvaluatedEventFromDecision(decision, {
        durationMs: this.deps.now() - startedAt,
        provider: PROVIDER,
      }),
    );

    if (!acceptsEpoch(this.state, epoch)) {
      return;
    }

    await this.applyDecision(decision);
  }

  private async applyDecision(decision: SessionSafetyDecision) {
    const copy = getVoiceSteeringCopy(this.state.locale);
    const now = this.deps.now();

    if (decision.action === "hard_stop") {
      if (isFailClosedSessionSafetyReasonCode(decision.reasonCode)) {
        const outcome = applySafetyOutcome(this.state, "fail_closed");
        this.state = outcome.state;
        this.persist();

        if (outcome.action === "paused") {
          await this.steer({ type: "session.input_audio.mute" });
          await this.steer({ type: "session.commentary.append", content: copy.pause });
        } else if (outcome.action === "closed_retryable") {
          await this.steer({ type: "session.close" });
          await this.hangupNow("safety_unavailable");
        }

        return;
      }

      // Kryzys: przekazanie, wyciszenie i hangup po łasce (alarm). Sesja w
      // bazie przechodzi w `interrupted` przy najbliższym zrzucie właściciela.
      this.state = scheduleCrisisHangup(this.state, now, VOICE_HANDOFF_GRACE_MS);
      this.persist();
      await this.steer({ type: "session.commentary.append", content: copy.handoff });
      await this.steer({ type: "session.input_audio.mute" });
      await this.rescheduleAlarm();
      return;
    }

    const outcome = applySafetyOutcome(this.state, "ok");
    this.state = outcome.state;

    if (outcome.action === "resumed") {
      await this.steer({ type: "session.input_audio.unmute" });
      await this.steer({ type: "session.commentary.append", content: copy.resume });
    }

    const phase = resolveSessionPhase(
      {
        startedAt: this.state.startedAtMs === null ? null : new Date(this.state.startedAtMs).toISOString(),
        expiresAt: this.state.expiresAtMs === null ? null : new Date(this.state.expiresAtMs).toISOString(),
        durationBucketSeconds: null,
        createdAt: new Date(this.state.armedAtMs ?? now).toISOString(),
      },
      { now: new Date(now) },
    );

    if (shouldAppendPhase(this.state, phase) && phase !== null) {
      this.state = { ...this.state, lastPhase: phase };
      await this.steer({ type: "session.instructions.append", content: getVoicePhaseLine(this.state.locale, phase) });
    }

    if (decision.action === "allow_with_constraints" && shouldAppendConstraints(this.state, now)) {
      this.state = { ...this.state, constraintsAppendedAtMs: now };
      await this.steer({
        type: "session.instructions.append",
        content: buildVoiceConstraintsLine(
          this.state.locale,
          decision.constraints.map((constraint) => constraint.instruction),
        ),
      });
    }

    this.persist();
  }

  private async steer(command: LiveSidebandCommand) {
    const sideband = this.sideband;

    if (!sideband?.open) {
      this.log(
        buildSessionVoiceObserverEvent({ outcome: "skipped", reasonCode: "observer_steer_failed", provider: PROVIDER }),
      );
      return;
    }

    try {
      await sideband.send(command);
    } catch {
      this.log(
        buildSessionVoiceObserverEvent({ outcome: "failure", reasonCode: "observer_steer_failed", provider: PROVIDER }),
      );
    }
  }

  private async hangupProvider(liveSessionId: string) {
    try {
      await this.deps.hangup(liveSessionId);
    } catch {
      this.log(
        buildSessionVoiceObserverEvent({
          outcome: "failure",
          reasonCode: "observer_hangup_failed",
          provider: PROVIDER,
        }),
      );
    }
  }

  // ---------- state ----------

  private persist() {
    this.store.saveState(this.state);
  }

  private async rescheduleAlarm() {
    await this.deps.scheduleAlarm(nextAlarmAt(this.state));
  }

  private liveDurationMs(now: number) {
    return this.state.armedAtMs === null ? undefined : Math.max(0, now - this.state.armedAtMs);
  }

  private snapshot(): VoiceObserverSnapshot {
    return {
      epoch: this.state.epoch,
      live: this.state.liveSessionId !== null && this.state.closeReason === null,
      closeReason: this.state.closeReason,
      deadlineAtMs: resolveVoiceDeadlineAtMs(this.state.expiresAtMs),
      armedAtMs: this.state.armedAtMs,
      observing: this.sideband?.open ?? false,
      pendingUtterances: this.store.pendingCount(),
    };
  }

  private log(event: Parameters<typeof logOperationalEvent>[0]) {
    logOperationalEvent(event);
  }
}
