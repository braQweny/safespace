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

function getBubbleClasses(role: UiSessionMessage["role"]) {
  if (role === "user") {
    return "ml-auto max-w-[85%] rounded-2xl rounded-br-md border-speaker-line bg-speaker-soft text-speaker";
  }

  if (role === "system_boundary") {
    return "w-full rounded-2xl border-warn-line bg-warn-soft text-warn";
  }

  return "mr-auto max-w-[85%] rounded-2xl rounded-bl-md border-line bg-surface text-ink-soft";
}

function getRoleLabel(role: UiSessionMessage["role"], assistantAvatar: SelectedModalityAvatar) {
  if (role === "assistant") {
    return assistantAvatar.avatarName;
  }

  if (role === "system_boundary") {
    return "Granica bezpieczeństwa";
  }

  return "Ty";
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
  const label = getRoleLabel(role, assistantAvatar);

  if (role !== "assistant") {
    return <p className="text-brand text-xs font-semibold">{label}</p>;
  }

  return (
    <div className="text-brand flex items-center gap-2 text-xs font-semibold">
      <img
        src={assistantAvatar.assetPath}
        alt=""
        width="24"
        height="24"
        className="h-6 w-6 rounded-full object-cover"
        loading="lazy"
      />
      <span>{label}</span>
    </div>
  );
}

function getAssistantDisplayName(assistantAvatar: SelectedModalityAvatar) {
  return assistantAvatar.avatarName.split(",")[0]?.trim() || assistantAvatar.avatarName;
}

function PendingAssistantStatus({ assistantAvatar }: { assistantAvatar: SelectedModalityAvatar }) {
  const assistantName = getAssistantDisplayName(assistantAvatar);

  return (
    <div
      className="border-line bg-surface text-ink-soft mt-3 inline-flex items-center gap-2 rounded-2xl rounded-bl-md border px-4 py-3 text-sm font-medium"
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
        "border-line bg-surface-soft rounded-lg border p-4",
        isLive ? "min-h-0 flex-1 overflow-y-auto overscroll-contain" : "min-h-[280px]",
      )}
    >
      {!hasContent ? (
        <div
          className={cn(
            "text-ink-muted flex items-center justify-center text-center text-sm leading-6",
            isLive ? "h-full" : "min-h-56",
          )}
        >
          {emptyCopy}
        </div>
      ) : (
        // Chat convention: the conversation sits at the bottom, next to the
        // composer, instead of floating at the top of a tall empty box.
        <ol className={cn("space-y-2", isLive && "flex min-h-full flex-col justify-end")}>
          {messages.map((message, index) => {
            const previousRole = index > 0 ? messages[index - 1]?.role : null;
            const showHeader = message.role !== "user" && message.role !== previousRole;

            return (
              <li
                key={message.id}
                className={cn(
                  "border p-4 text-sm leading-6",
                  getBubbleClasses(message.role),
                  message.role === previousRole && "mt-1",
                )}
              >
                {showHeader ? <MessageHeader role={message.role} assistantAvatar={assistantAvatar} /> : null}
                {message.role === "user" ? <span className="sr-only">Ty: </span> : null}
                <MessageContent content={message.content} hasHeader={showHeader} />
              </li>
            );
          })}
          {pendingUserText ? (
            <li className={cn("border p-4 text-sm leading-6", getBubbleClasses("user"))}>
              <span className="sr-only">Ty: </span>
              <MessageContent content={pendingUserText} hasHeader={false} />
            </li>
          ) : null}
        </ol>
      )}

      {isPending ? <PendingAssistantStatus assistantAvatar={assistantAvatar} /> : null}
    </div>
  );
}
