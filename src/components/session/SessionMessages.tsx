import type { UiSessionMessage } from "@/lib/session-flow/message-state";
import { parseMessageMarkdown, type MessageMarkdownInline } from "@/lib/session-flow/message-markdown";
import type { SelectedModalityAvatar } from "@/lib/modalities";

interface SessionMessagesProps {
  messages: readonly UiSessionMessage[];
  isPending?: boolean;
  assistantAvatar: SelectedModalityAvatar;
  emptyCopy?: string;
}

function getMessageClasses(role: UiSessionMessage["role"]) {
  if (role === "user") {
    return "ml-auto border-[#c8d4ee] bg-[#f8faff] text-[#263952]";
  }

  if (role === "system_boundary") {
    return "border-[#edd3a1] bg-[#fffaf0] text-[#654b16]";
  }

  return "border-[#c8ddd7] bg-white text-[#38524b]";
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

function MessageContent({ content }: { content: string }) {
  const blocks = parseMessageMarkdown(content);

  return (
    <div className="mt-2 space-y-4">
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
  message,
  assistantAvatar,
}: {
  message: UiSessionMessage;
  assistantAvatar: SelectedModalityAvatar;
}) {
  const label = getRoleLabel(message.role, assistantAvatar);

  if (message.role !== "assistant") {
    return <p className="text-xs font-semibold text-[#1f6f65]">{label}</p>;
  }

  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-[#1f6f65]">
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

export default function SessionMessages({
  messages,
  isPending = false,
  assistantAvatar,
  emptyCopy = "Pierwsza wiadomość może być krótka. Opisz sytuację, którą chcesz spokojnie uporządkować.",
}: SessionMessagesProps) {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Przebieg rozmowy"
      className="min-h-[280px] rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-4"
    >
      {messages.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center text-center text-sm leading-6 text-[#52645f]">
          {emptyCopy}
        </div>
      ) : (
        <ol className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`max-w-[min(680px,92%)] rounded-lg border p-4 text-sm leading-6 ${getMessageClasses(message.role)}`}
            >
              <MessageHeader message={message} assistantAvatar={assistantAvatar} />
              <MessageContent content={message.content} />
            </li>
          ))}
        </ol>
      )}

      {isPending ? (
        <div
          className="mt-4 rounded-lg border border-[#bfd8d1] bg-white p-4 text-sm leading-6 text-[#38524b]"
          role="status"
        >
          Odpowiedź trwa. {assistantAvatar.avatarName} przygotowuje niestreamingową odpowiedź po sprawdzeniu granic
          bezpieczeństwa.
        </div>
      ) : null}
    </div>
  );
}
