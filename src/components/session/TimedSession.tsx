import { useCallback, useMemo, useState } from "react";
import { FileText, PlayCircle, ShieldCheck } from "lucide-react";
import type { SessionAiFailureCopy } from "@/lib/session-ai/types";
import type { CrisisResourceRegion, SessionSafetyCopy } from "@/lib/session-safety/types";
import type { SendSessionMessageResponse } from "@/lib/session-flow/message-contract";
import { appendSuccessfulTurn, isComposerAvailable, type UiSessionMessage } from "@/lib/session-flow/message-state";
import type { SessionStartPageState, SessionStartPageStateKind, SessionView } from "@/lib/session-flow/session-state";
import SessionComposer from "./SessionComposer";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionTimer from "./SessionTimer";

interface TimedSessionProps {
  initialState: SessionStartPageState;
}

interface StartSessionSuccessResponse {
  ok: true;
  session: SessionView;
}

interface StartSessionFailureResponse {
  ok: false;
  code: string;
  redirectTo?: string;
}

type StartSessionResponse = StartSessionSuccessResponse | StartSessionFailureResponse;

interface SafetyNoticeState {
  variant: "hard_stop" | "retry" | "info";
  copy: SessionSafetyCopy | SessionAiFailureCopy;
  crisisResources?: readonly CrisisResourceRegion[];
}

const stateCopy: Record<SessionStartPageStateKind, { title: string; body: string }> = {
  ready: {
    title: "Przygotowanie do pierwszej sesji",
    body: "Wejście na tę stronę nie zużywa darmowej próby. Sesja startuje dopiero po użyciu przycisku rozpoczęcia.",
  },
  active: {
    title: "Sesja jest aktywna",
    body: "Możesz pisać wiadomości, dopóki serwerowy limit czasu pozwala na rozmowę.",
  },
  expired: {
    title: "Limit czasu został osiągnięty",
    body: "Pierwsza 15-minutowa sesja jest już po czasie. Nowe wiadomości są blokowane po stronie serwera.",
  },
  completed: {
    title: "Sesja została zakończona",
    body: "Pierwsza sesja jest zapisana w prywatnej granicy danych. Pełna historia pozostaje poza zakresem tego widoku.",
  },
  interrupted: {
    title: "Sesja została przerwana",
    body: "Rozmowa została zatrzymana w bezpiecznym stanie. Zwykła symulacja nie będzie kontynuowana w tej sesji.",
  },
  followup_ready: {
    title: "Przygotowanie do kolejnej sesji MVP",
    body: "Możesz rozpocząć kolejną timed sesję. Przed startem widzisz, czy rozmowa dostanie zatwierdzone podsumowania jako kontekst.",
  },
  trial_already_claimed: {
    title: "Darmowa próba została już wykorzystana",
    body: "Nie można rozpocząć drugiej darmowej sesji przez odświeżenie, ponowne kliknięcie ani bezpośredni POST.",
  },
  unavailable: {
    title: "Stan sesji jest chwilowo niedostępny",
    body: "Nie udało się potwierdzić dostępności darmowej próby. Spróbuj ponownie za chwilę.",
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson<T>(response: Response) {
  const body: unknown = await response.json();
  return body as T;
}

function isStartSessionSuccess(response: StartSessionResponse): response is StartSessionSuccessResponse {
  return response.ok && isRecord(response.session);
}

function buildGenericNotice(title: string, body: string): SafetyNoticeState {
  return {
    variant: "info",
    copy: {
      title,
      body,
      nextSteps: [],
    },
  };
}

export default function TimedSession({ initialState }: TimedSessionProps) {
  const [kind, setKind] = useState(initialState.kind);
  const [session, setSession] = useState(initialState.session);
  const [messages, setMessages] = useState<UiSessionMessage[]>(initialState.messages);
  const [draft, setDraft] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isMessagePending, setIsMessagePending] = useState(false);
  const [isClientExpired, setIsClientExpired] = useState(session?.remainingSeconds === 0);
  const [isHardStopped, setIsHardStopped] = useState(kind === "interrupted");
  const [notice, setNotice] = useState<SafetyNoticeState | null>(null);

  const composerAvailable = useMemo(
    () =>
      isComposerAvailable({
        session,
        isPending: isMessagePending,
        isHardStopped,
        isClientExpired,
      }),
    [isClientExpired, isHardStopped, isMessagePending, session],
  );

  const handleExpired = useCallback(() => {
    setIsClientExpired(true);
    setKind("expired");
  }, []);

  async function startSession() {
    if (isStarting) {
      return;
    }

    setIsStarting(true);
    setNotice(null);

    try {
      const isFollowupStart = kind === "followup_ready";
      const startWithoutContext = isFollowupStart && initialState.canStartWithoutContext;
      const response = await fetch(isFollowupStart ? "/api/session/start-next" : "/api/session/start", {
        method: "POST",
        headers: {
          Accept: "application/json",
          ...(startWithoutContext ? { "Content-Type": "application/json" } : {}),
        },
        ...(startWithoutContext
          ? {
              body: JSON.stringify({
                startWithoutContext: true,
              }),
            }
          : {}),
      });
      const body = await readJson<StartSessionResponse>(response);

      if (isStartSessionSuccess(body)) {
        setSession(body.session);
        setMessages([]);
        setKind(body.session.status === "active" ? "active" : body.session.status);
        setIsClientExpired(body.session.remainingSeconds === 0);
        setIsHardStopped(false);
        return;
      }

      if (body.redirectTo) {
        window.location.assign(body.redirectTo);
        return;
      }

      setKind(
        body.code === "trial_already_claimed" || body.code === "no_context_not_confirmed"
          ? "followup_ready"
          : "unavailable",
      );
      setNotice(buildGenericNotice("Nie udało się rozpocząć sesji", "Spróbuj ponownie za chwilę albo wróć do panelu."));
    } catch {
      setNotice(
        buildGenericNotice("Nie udało się rozpocząć sesji", "Połączenie z serwerem jest chwilowo niedostępne."),
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function sendMessage() {
    const trimmedDraft = draft.trim();

    if (!session || !trimmedDraft || !composerAvailable) {
      return;
    }

    setIsMessagePending(true);
    setNotice(null);

    try {
      const response = await fetch("/api/session/message", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sessionId: session.id,
          message: trimmedDraft,
        }),
      });
      const body = await readJson<SendSessionMessageResponse>(response);

      if (body.ok) {
        setMessages((currentMessages) => appendSuccessfulTurn(currentMessages, body.messages));
        setSession(body.session);
        setKind(body.session.status === "active" ? "active" : body.session.status);
        setDraft("");
        setNotice(null);
        return;
      }

      if (body.type === "hard_stop") {
        setKind("interrupted");
        setIsHardStopped(true);
        setNotice({
          variant: "hard_stop",
          copy: body.copy,
          crisisResources: body.crisisResources,
        });
        return;
      }

      if (body.type === "expired") {
        setKind("expired");
        setSession(body.session);
        setIsClientExpired(true);
        setNotice(buildGenericNotice("Limit czasu został osiągnięty", "Nowe wiadomości są już blokowane w tej sesji."));
        return;
      }

      if (body.type === "ai_retry") {
        setDraft(trimmedDraft);
        setNotice({
          variant: "retry",
          copy: body.copy,
        });
        return;
      }

      setDraft(trimmedDraft);
      setNotice(buildGenericNotice("Nie udało się wysłać wiadomości", "Spróbuj ponownie, jeśli sesja nadal trwa."));
    } catch {
      setDraft(trimmedDraft);
      setNotice(
        buildGenericNotice("Nie udało się wysłać wiadomości", "Połączenie z serwerem jest chwilowo niedostępne."),
      );
    } finally {
      setIsMessagePending(false);
    }
  }

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-lg border border-[#c8ddd7] bg-white p-6 shadow-[0_22px_60px_rgba(24,78,70,0.12)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#1f6f65]">{stateCopy[kind].title}</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#10231f]">{initialState.avatar.selected.avatarName}</h2>
            <p className="mt-1 text-base font-medium text-[#1f6f65]">{initialState.avatar.selected.modalityName}</p>
          </div>
          {session ? (
            <SessionTimer
              key={session.id}
              expiresAt={session.expiresAt}
              initialRemainingSeconds={session.remainingSeconds}
              onExpired={handleExpired}
            />
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-[#52645f]">{stateCopy[kind].body}</p>

        {notice ? (
          <div className="mt-5">
            <SessionSafetyNotice variant={notice.variant} copy={notice.copy} crisisResources={notice.crisisResources} />
          </div>
        ) : null}

        {kind === "followup_ready" ? (
          <div className="mt-5 rounded-lg border border-[#c8ddd7] bg-[#f8fcfa] p-4 text-sm leading-6 text-[#38524b]">
            <div className="flex items-start gap-3">
              <FileText aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#1f6f65]" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[#10231f]">Kontekst pokazany przed startem</p>
                {initialState.approvedSummaries.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {initialState.approvedSummaries.slice(0, 3).map((summary, index) => (
                      <div key={summary.id} className="rounded-lg border border-[#d7e5e0] bg-white p-3">
                        <p className="text-xs font-semibold tracking-wide text-[#1f6f65] uppercase">
                          Podsumowanie {index + 1}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap text-[#10231f]">{summary.summaryText}</p>
                      </div>
                    ))}
                    <p className="text-[#52645f]">
                      Tylko te zatwierdzone, widoczne podsumowania mogą zostać przekazane do kolejnej rozmowy.
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-[#52645f]">
                    Nie ma zatwierdzonych podsumowań. Start bez kontekstu jest możliwy tylko przez poniższy jawny
                    przycisk.
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {kind === "ready" || kind === "followup_ready" ? (
          <button
            type="button"
            onClick={() => {
              void startSession();
            }}
            disabled={isStarting}
            className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1f6f65] px-5 text-sm font-medium text-white transition-colors hover:bg-[#185950] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#9abbb4]"
          >
            <PlayCircle aria-hidden="true" className="h-4 w-4" />
            {isStarting
              ? "Start..."
              : kind === "followup_ready"
                ? initialState.approvedSummaries.length > 0
                  ? "Rozpocznij kolejną sesję z kontekstem"
                  : "Rozpocznij kolejną sesję bez kontekstu"
                : "Rozpocznij pierwszą darmową sesję"}
          </button>
        ) : null}

        {session ? (
          <div className="mt-6">
            <SessionMessages
              messages={messages}
              isPending={isMessagePending}
              assistantAvatar={initialState.avatar.selected}
            />
            <SessionComposer
              value={draft}
              isDisabled={!composerAvailable}
              isPending={isMessagePending}
              onChange={setDraft}
              onSubmit={() => {
                void sendMessage();
              }}
            />
          </div>
        ) : null}
      </section>

      <aside className="rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-5">
        <img
          src={initialState.avatar.selected.assetPath}
          alt={initialState.avatar.selected.altText}
          width="384"
          height="384"
          className="aspect-square w-full rounded-lg object-cover"
          loading="lazy"
        />
        <p className="mt-4 text-sm leading-6 text-[#52645f]">
          Wybrana perspektywa zostaje zapisana w metadanych aktywnej sesji. Kolejna sesja korzysta wyłącznie z
          zatwierdzonych podsumowań pokazanych przed startem albo z jawnego startu bez kontekstu.
        </p>
        <div className="mt-5 border-t border-[#d7e5e0] pt-4 text-sm leading-6 text-[#52645f]">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#1f6f65]" />
            <div>
              <p className="font-semibold text-[#10231f]">Granice rozmowy</p>
              <p className="mt-1">
                SafeSpace jest symulacją rozmowy edukacyjnej. Nie diagnozuje i nie zastępuje specjalisty. W bezpośrednim
                zagrożeniu skorzystaj z realnej pomocy, np. lokalnego numeru alarmowego.
              </p>
            </div>
          </div>
        </div>
        <a
          href="/dashboard/avatar"
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg border border-[#9cc8bc] bg-white px-4 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none"
        >
          Zmień awatara
        </a>
      </aside>
    </div>
  );
}
