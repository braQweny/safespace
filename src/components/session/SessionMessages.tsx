import type { UiSessionMessage } from "@/lib/session-flow/message-state";

interface SessionMessagesProps {
  messages: readonly UiSessionMessage[];
  isPending: boolean;
}

const roleLabels: Record<UiSessionMessage["role"], string> = {
  user: "Ty",
  assistant: "SafeSpace",
  system_boundary: "Granica bezpieczeństwa",
};

function getMessageClasses(role: UiSessionMessage["role"]) {
  if (role === "user") {
    return "ml-auto border-[#c8d4ee] bg-[#f8faff] text-[#263952]";
  }

  if (role === "system_boundary") {
    return "border-[#edd3a1] bg-[#fffaf0] text-[#654b16]";
  }

  return "border-[#c8ddd7] bg-white text-[#38524b]";
}

export default function SessionMessages({ messages, isPending }: SessionMessagesProps) {
  return (
    <div className="min-h-[280px] rounded-lg border border-[#d7e5e0] bg-[#f8fcfa] p-4">
      {messages.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center text-center text-sm leading-6 text-[#52645f]">
          Pierwsza wiadomość może być krótka. Opisz sytuację, którą chcesz spokojnie uporządkować.
        </div>
      ) : (
        <ol className="space-y-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={`max-w-[min(680px,92%)] rounded-lg border p-4 text-sm leading-6 ${getMessageClasses(message.role)}`}
            >
              <p className="text-xs font-semibold text-[#1f6f65] uppercase">{roleLabels[message.role]}</p>
              <p className="mt-2 whitespace-pre-wrap">{message.content}</p>
            </li>
          ))}
        </ol>
      )}

      {isPending ? (
        <div
          className="mt-4 rounded-lg border border-[#bfd8d1] bg-white p-4 text-sm leading-6 text-[#38524b]"
          role="status"
        >
          Odpowiedź trwa. SafeSpace sprawdza granice bezpieczeństwa i przygotowuje niestreamingową odpowiedź.
        </div>
      ) : null}
    </div>
  );
}
