import { useState } from "react";
import { CircleStop, FileText, History, PlayCircle, ShieldCheck } from "lucide-react";
import { useTimedSession } from "@/components/hooks/useTimedSession";
import type { SessionStartPageState, SessionStartPageStateKind } from "@/lib/session-flow/session-state";
import SessionComposer from "./SessionComposer";
import SessionMessages from "./SessionMessages";
import SessionSafetyNotice from "./SessionSafetyNotice";
import SessionTimer from "./SessionTimer";

interface TimedSessionProps {
  initialState: SessionStartPageState;
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
    body: "Rozmowa została prywatnie zapisana. Pełny zapis znajdziesz w historii w panelu — tam możesz też przejrzeć i zatwierdzić podsumowanie do kolejnej sesji.",
  },
  interrupted: {
    title: "Sesja została przerwana",
    body: "Rozmowa została zatrzymana w bezpiecznym stanie. Zwykła symulacja nie będzie kontynuowana w tej sesji.",
  },
  followup_ready: {
    title: "Przygotowanie do kolejnej sesji",
    body: "Możesz rozpocząć kolejną sesję z limitem czasu. Przed startem widzisz, czy rozmowa otrzyma zatwierdzone podsumowania jako kontekst.",
  },
  trial_already_claimed: {
    title: "Darmowa próba została już wykorzystana",
    body: "Darmowa próba obejmuje jedną sesję i została już użyta na tym koncie. Zapis rozmowy znajdziesz w historii w panelu.",
  },
  unavailable: {
    title: "Stan sesji jest chwilowo niedostępny",
    body: "Nie udało się potwierdzić dostępności darmowej próby. Spróbuj ponownie za chwilę.",
  },
};

export default function TimedSession({ initialState }: TimedSessionProps) {
  const { state, composerAvailable, handleExpired, setDraft, startSession, sendMessage, endSession } =
    useTimedSession(initialState);
  const { kind, session, messages, draft, isStarting, isEnding, isMessagePending, pendingUserText, notice } = state;
  const [isConfirmingEnd, setIsConfirmingEnd] = useState(false);
  const canEndSession = kind === "active" && session?.status === "active";
  const showHistoryCta = kind === "completed" || kind === "expired" || kind === "interrupted";

  return (
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-lg border border-[#c8ddd7] bg-white p-6 shadow-[0_22px_60px_rgba(24,78,70,0.12)]">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#1f6f65]">{stateCopy[kind].title}</p>
            <h2 className="mt-2 text-2xl font-semibold text-[#10231f]">{initialState.avatar.selected.avatarName}</h2>
            <p className="mt-1 text-base font-medium text-[#1f6f65]">{initialState.avatar.selected.modalityName}</p>
          </div>
          {canEndSession ? (
            <div className="flex flex-wrap items-center gap-2">
              <SessionTimer
                key={session.id}
                expiresAt={session.expiresAt}
                initialRemainingSeconds={session.remainingSeconds}
                onExpired={handleExpired}
              />
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingEnd(true);
                }}
                disabled={isEnding || isMessagePending || isConfirmingEnd}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#d6aaa7] bg-white px-4 text-sm font-semibold text-[#7d2d2d] transition-colors hover:bg-[#fff8f8] focus:ring-2 focus:ring-[#b85c58] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <CircleStop aria-hidden="true" className="h-4 w-4" />
                {isEnding ? "Kończenie..." : "Zakończ sesję"}
              </button>
            </div>
          ) : null}
        </div>

        {canEndSession && isConfirmingEnd ? (
          <div
            role="alertdialog"
            aria-label="Potwierdź zakończenie sesji"
            className="mt-4 rounded-lg border border-[#d6aaa7] bg-[#fff8f8] p-4 text-sm leading-6 text-[#7d2d2d]"
          >
            <p className="font-semibold">Na pewno zakończyć sesję?</p>
            <p className="mt-1">Zakończonej rozmowy nie da się wznowić, ale jej zapis pozostanie w historii.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingEnd(false);
                  void endSession();
                }}
                disabled={isEnding || isMessagePending}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#a03d3a] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#8a3330] focus:ring-2 focus:ring-[#b85c58] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                Zakończ teraz
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingEnd(false);
                }}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#c8ddd7] bg-white px-4 text-sm font-medium text-[#38524b] transition-colors hover:bg-[#f8fcfa] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none"
              >
                Wróć do rozmowy
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-4 text-sm leading-6 text-[#52645f]">{stateCopy[kind].body}</p>

        {showHistoryCta ? (
          <a
            href="/dashboard"
            className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#9cc8bc] bg-white px-4 text-sm font-medium text-[#1f6f65] transition-colors hover:bg-[#eef8f4] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none"
          >
            <History aria-hidden="true" className="h-4 w-4" />
            Przejdź do historii i podsumowania
          </a>
        ) : null}

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
              pendingUserText={pendingUserText}
              assistantAvatar={initialState.avatar.selected}
            />
            {kind === "active" ? (
              <SessionComposer
                value={draft}
                isDisabled={!composerAvailable}
                isPending={isMessagePending}
                onChange={setDraft}
                onSubmit={() => {
                  void sendMessage();
                }}
              />
            ) : null}
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
          Wybrana perspektywa obowiązuje przez całą sesję. Kolejna rozmowa korzysta wyłącznie z podsumowań, które sam
          zatwierdzisz — albo zaczyna się bez kontekstu, jeśli tak zdecydujesz.
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
