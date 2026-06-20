import type { KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";
import { SESSION_MESSAGE_MAX_CHARS } from "@/lib/session-flow/message-contract";

interface SessionComposerProps {
  value: string;
  isDisabled: boolean;
  isPending: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}

type SessionComposerKeyboardEvent = Pick<
  KeyboardEvent<HTMLTextAreaElement>,
  "altKey" | "ctrlKey" | "key" | "metaKey" | "shiftKey"
>;

export function shouldSubmitSessionComposerFromKeyboard(
  event: SessionComposerKeyboardEvent,
  platform = getClientPlatform(),
) {
  if (event.key !== "Enter" || event.altKey || event.shiftKey) {
    return false;
  }

  if (isMacPlatform(platform)) {
    return event.metaKey && !event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

export default function SessionComposer({ value, isDisabled, isPending, onChange, onSubmit }: SessionComposerProps) {
  const trimmedValue = value.trim();
  const canSubmit = !isDisabled && !isPending && trimmedValue.length > 0;

  return (
    <form
      className="mt-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="session-message" className="sr-only">
        Wiadomość do SafeSpace
      </label>
      <textarea
        id="session-message"
        value={value}
        maxLength={SESSION_MESSAGE_MAX_CHARS}
        disabled={isDisabled}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (!canSubmit || !shouldSubmitSessionComposerFromKeyboard(event)) {
            return;
          }

          event.preventDefault();
          onSubmit();
        }}
        placeholder="Napisz, od czego chcesz zacząć..."
        className="min-h-28 w-full resize-y rounded-lg border border-[#bfd8d1] bg-white px-4 py-3 text-sm leading-6 text-[#12201d] transition-colors outline-none placeholder:text-[#84958f] focus:border-[#2d8a7d] focus:ring-2 focus:ring-[#2d8a7d]/25 disabled:cursor-not-allowed disabled:bg-[#edf4f1]"
      />
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-[#62756f]">
          {trimmedValue.length}/{SESSION_MESSAGE_MAX_CHARS}
        </p>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#1f6f65] px-5 text-sm font-medium text-white transition-colors hover:bg-[#185950] focus:ring-2 focus:ring-[#2d8a7d] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#9abbb4]"
        >
          {isPending ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Send aria-hidden="true" className="h-4 w-4" />
          )}
          Wyślij
        </button>
      </div>
    </form>
  );
}

function getClientPlatform() {
  if (typeof navigator === "undefined") {
    return "";
  }

  const browserNavigator = navigator as Navigator & {
    userAgentData?: {
      platform?: string;
    };
  };
  const userAgentDataPlatform = browserNavigator.userAgentData?.platform;

  if (userAgentDataPlatform && userAgentDataPlatform.trim().length > 0) {
    return userAgentDataPlatform;
  }

  return browserNavigator.userAgent;
}

function isMacPlatform(platform: string) {
  return platform.toLowerCase().includes("mac");
}
