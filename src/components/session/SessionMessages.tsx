import { useEffect, useRef } from "react";
import type { UiSessionMessage } from "@/lib/session-flow/message-state";
import { parseMessageMarkdown, type MessageMarkdownInline } from "@/lib/session-flow/message-markdown";
import type { SelectedModalityAvatar } from "@/lib/modalities";
import { cn } from "@/lib/utils";

interface SessionMessagesProps {
  messages: readonly UiSessionMessage[];
  isPending?: boolean;
  pendingUserText?: string | null;
  assistantAvatar: SelectedModalityAvatar;
  emptyCopy?: string;
  /**
   * `live` — trwająca rozmowa: własny scroll i doklejanie do dołu przy nowej wiadomości.
   * `static` — podgląd historii w panelu: rośnie razem ze stroną.
   */
  variant?: "live" | "static";
}

const PIN_TO_BOTTOM_TOLERANCE_PX = 80;

/**
 * Rozmowa jest jedną kolumną tekstu, nie dwiema kolumnami dymków: odpowiedzi
 * awatara to proza złożona szeryfem, własne słowa użytkownika stoją po
 * prawej na cieplejszym papierze, a granica bezpieczeństwa dostaje cichą
 * ramkę zamiast ostrzegawczego koloru.
 */
function getMessageClasses(role: UiSessionMessage["role"]) {
  if (role === "user") {
    return "ml-auto max-w-[85%] rounded-[18px] rounded-br-md bg-speaker-soft px-4 py-3 text-base leading-relaxed text-speaker";
  }

  if (role === "system_boundary") {
    return "w-full rounded-2xl border border-line-accent bg-surface px-5 py-4 text-sm leading-6 text-ink-soft";
  }

  return "text-ink mr-auto w-full font-serif text-[1.1875rem] leading-[1.6]";
}

function getAssistantDisplayName(assistantAvatar: SelectedModalityAvatar) {
  return assistantAvatar.avatarName.split(",")[0]?.trim() || assistantAvatar.avatarName;
}

function renderInlines(inlines: readonly MessageMarkdownInline[]) {
  return inlines.map((inline, index) =>
    inline.kind === "strong" ? (
      <strong key={`${inline.kind}-${index}`} className="font-semibold">
        {inline.text}
      </strong>
    ) : (
      inline.text
    ),
  );
}

function MessageContent({ content, hasHeader }: { content: string; hasHeader: boolean }) {
  const blocks = parseMessageMarkdown(content);

  return (
    <div className={cn("space-y-4", hasHeader && "mt-2")}>
      {blocks.map((block, index) => {
        if (block.kind === "ordered-list") {
          return (
            <ol key={`${block.kind}-${index}`} className="list-decimal space-y-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${block.kind}-${index}-${itemIndex}`}>{renderInlines(item)}</li>
              ))}
            </ol>
          );
        }

        if (block.kind === "unordered-list") {
          return (
            <ul key={`${block.kind}-${index}`} className="list-disc space-y-2 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${block.kind}-${index}-${itemIndex}`}>{renderInlines(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={`${block.kind}-${index}`}>{renderInlines(block.inlines)}</p>;
      })}
    </div>
  );
}

function MessageHeader({
  role,
  assistantAvatar,
}: {
  role: UiSessionMessage["role"];
  assistantAvatar: SelectedModalityAvatar;
}) {
  if (role === "system_boundary") {
    return (
      <p className="text-ink-muted font-sans text-xs font-semibold tracking-[0.08em] uppercase">
        Granica bezpieczeństwa
      </p>
    );
  }

  if (role !== "assistant") {
    return <p className="text-brand font-sans text-xs font-semibold tracking-[0.08em] uppercase">Ty</p>;
  }

  return (
    <div className="text-brand flex items-center gap-2 font-sans text-xs font-semibold tracking-[0.08em] uppercase">
      <img
        src={assistantAvatar.assetPath}
        alt=""
        width="22"
        height="22"
        className="h-[22px] w-[22px] rounded-full object-cover"
        loading="lazy"
      />
      {/* Na ekranie samo imię; czytnik ekranu dostaje pełną nazwę awatara raz, przy zmianie mówiącego. */}
      <span aria-hidden="true">{getAssistantDisplayName(assistantAvatar)}</span>
      <span className="sr-only">{assistantAvatar.avatarName}</span>
    </div>
  );
}

function PendingAssistantStatus({ assistantAvatar }: { assistantAvatar: SelectedModalityAvatar }) {
  const assistantName = getAssistantDisplayName(assistantAvatar);

  return (
    <div
      className="text-ink-muted mt-6 inline-flex items-center gap-1.5 text-sm"
      role="status"
      aria-label={`${assistantName} myśli...`}
    >
      <span>{assistantName} myśli</span>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        <span className="animate-pulse motion-reduce:animate-none">.</span>
        <span className="animate-pulse [animation-delay:150ms] motion-reduce:animate-none">.</span>
        <span className="animate-pulse [animation-delay:300ms] motion-reduce:animate-none">.</span>
      </span>
    </div>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function SessionMessages({
  messages,
  isPending = false,
  pendingUserText = null,
  assistantAvatar,
  emptyCopy = "Pierwsza wiadomość może być krótka. Opisz sytuację, którą chcesz spokojnie uporządkować.",
  variant = "static",
}: SessionMessagesProps) {
  const hasContent = messages.length > 0 || Boolean(pendingUserText);
  const isLive = variant === "live";
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPinnedToBottomRef = useRef(true);
  const lastMessageId = messages.at(-1)?.id ?? null;

  useEffect(() => {
    const container = scrollRef.current;

    if (!isLive || !container || !isPinnedToBottomRef.current) {
      return;
    }

    container.scrollTo({
      top: container.scrollHeight,
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
  }, [isLive, isPending, lastMessageId, pendingUserText]);

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-live="polite"
      aria-label="Przebieg rozmowy"
      onScroll={
        isLive
          ? (event) => {
              const element = event.currentTarget;
              isPinnedToBottomRef.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < PIN_TO_BOTTOM_TOLERANCE_PX;
            }
          : undefined
      }
      className={cn(
        isLive
          ? "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-6"
          : "border-line bg-surface min-h-[280px] rounded-2xl border p-4 sm:p-6",
      )}
    >
      <div className={cn("mx-auto w-full max-w-3xl", isLive && "flex min-h-full flex-col")}>
        {!hasContent ? (
          <div
            className={cn(
              "text-ink-muted flex items-center justify-center text-center text-sm leading-6",
              isLive ? "flex-1" : "min-h-56",
            )}
          >
            {emptyCopy}
          </div>
        ) : (
          // Chat convention: the conversation sits at the bottom, next to the
          // composer, instead of floating at the top of a tall empty box.
          <ol className={cn("flex flex-col gap-6", isLive && "min-h-full justify-end")}>
            {messages.map((message, index) => {
              const previousRole = index > 0 ? messages[index - 1]?.role : null;
              const showHeader = message.role !== "user" && message.role !== previousRole;

              return (
                <li
                  key={message.id}
                  className={cn(getMessageClasses(message.role), message.role === previousRole && "-mt-2")}
                >
                  {showHeader ? <MessageHeader role={message.role} assistantAvatar={assistantAvatar} /> : null}
                  {message.role === "user" ? <span className="sr-only">Ty: </span> : null}
                  <MessageContent content={message.content} hasHeader={showHeader} />
                </li>
              );
            })}
            {pendingUserText ? (
              <li className={getMessageClasses("user")}>
                <span className="sr-only">Ty: </span>
                <MessageContent content={pendingUserText} hasHeader={false} />
              </li>
            ) : null}
          </ol>
        )}

        {isPending ? <PendingAssistantStatus assistantAvatar={assistantAvatar} /> : null}
      </div>
    </div>
  );
}
