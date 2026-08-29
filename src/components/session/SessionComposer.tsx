import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, Loader2, Mic, Square } from "lucide-react";
import { requestApiJson } from "@/lib/api-client";
import { SESSION_MESSAGE_MAX_CHARS } from "@/lib/session-flow/message-contract";
import {
  isSessionTranscriptionSuccess,
  SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES,
  SESSION_TRANSCRIPTION_MAX_RECORDING_MS,
} from "@/lib/session-flow/session-transcription-contract";
import { cn } from "@/lib/utils";

interface SessionComposerProps {
  sessionId: string;
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

type DictationStatus = "idle" | "recording" | "transcribing";

const DICTATION_ERROR_COPY = "Nie udało się przepisać nagrania. Spróbuj ponownie albo wpisz tekst.";
const DICTATION_TOO_LONG_COPY =
  "Transkrypcja przekroczyła limit wiadomości. Skróć tekst albo nagraj krótszą wypowiedź.";

export function shouldSubmitSessionComposerFromKeyboard(
  event: SessionComposerKeyboardEvent,
  platform = getClientPlatform(),
) {
  if (event.key !== "Enter" || event.altKey || event.shiftKey) {
    return false;
  }

  if (isMacPlatform(platform)) {
    return event.metaKey || event.ctrlKey;
  }

  return event.ctrlKey && !event.metaKey;
}

export function appendTranscriptionToDraft(draft: string, transcription: string, maxChars = SESSION_MESSAGE_MAX_CHARS) {
  const text = transcription.trim();

  if (!text) {
    return {
      value: draft,
      didAppend: false,
      wasTruncated: false,
    };
  }

  const separator = draft.length > 0 && !/\s$/.test(draft) ? " " : "";
  const combinedValue = `${draft}${separator}${text}`;
  const value = combinedValue.slice(0, maxChars);

  return {
    value,
    didAppend: value.length > draft.length,
    wasTruncated: combinedValue.length > maxChars,
  };
}

export function getSupportedWebmMimeType(mediaRecorder: Pick<typeof MediaRecorder, "isTypeSupported"> | undefined) {
  if (typeof mediaRecorder?.isTypeSupported !== "function") {
    return null;
  }

  return ["audio/webm;codecs=opus", "audio/webm"].find((mimeType) => mediaRecorder.isTypeSupported(mimeType)) ?? null;
}

export default function SessionComposer({
  sessionId,
  value,
  isDisabled,
  isPending,
  onChange,
  onSubmit,
}: SessionComposerProps) {
  const [dictationStatus, setDictationStatus] = useState<DictationStatus>("idle");
  const [dictationError, setDictationError] = useState<string | null>(null);
  const latestValueRef = useRef(value);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trimmedValue = value.trim();
  const isNearCharLimit = trimmedValue.length > SESSION_MESSAGE_MAX_CHARS * 0.8;
  const canSubmit = !isDisabled && !isPending && dictationStatus === "idle" && trimmedValue.length > 0;
  const canUseDictation = !isDisabled && !isPending && dictationStatus !== "transcribing";

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current === null) {
      return;
    }

    clearTimeout(recordingTimeoutRef.current);
    recordingTimeoutRef.current = null;
  }, []);

  const cleanupRecordingStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  }, []);

  const handleRecordingStop = useCallback(async () => {
    clearRecordingTimeout();
    cleanupRecordingStream();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    recorderRef.current = null;

    const audio = new Blob(chunks, { type: "audio/webm" });

    if (audio.size <= 0 || audio.size > SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES) {
      setDictationStatus("idle");
      setDictationError(DICTATION_ERROR_COPY);
      return;
    }

    setDictationStatus("transcribing");
    setDictationError(null);

    try {
      const audioBase64 = await blobToBase64(audio);
      const result = await requestApiJson("/api/session/transcribe", {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          audioBase64,
          format: "webm",
        }),
      });

      if (result.kind !== "json" || result.status !== 200 || !isSessionTranscriptionSuccess(result.body)) {
        setDictationError(DICTATION_ERROR_COPY);
        return;
      }

      const appendedDraft = appendTranscriptionToDraft(latestValueRef.current, result.body.text);

      if (!appendedDraft.didAppend) {
        setDictationError(DICTATION_TOO_LONG_COPY);
        return;
      }

      onChange(appendedDraft.value);
      setDictationError(appendedDraft.wasTruncated ? DICTATION_TOO_LONG_COPY : null);
    } catch {
      setDictationError(DICTATION_ERROR_COPY);
    } finally {
      setDictationStatus("idle");
    }
  }, [cleanupRecordingStream, clearRecordingTimeout, onChange, sessionId]);

  const startRecording = useCallback(async () => {
    if (!canUseDictation) {
      return;
    }

    setDictationError(null);

    const mediaDevices = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;

    if (typeof MediaRecorder === "undefined" || typeof mediaDevices?.getUserMedia !== "function") {
      setDictationError(DICTATION_ERROR_COPY);
      return;
    }

    const mimeType = getSupportedWebmMimeType(MediaRecorder);

    if (!mimeType) {
      setDictationError(DICTATION_ERROR_COPY);
      return;
    }

    try {
      const stream = await mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      streamRef.current = stream;
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        clearRecordingTimeout();
        cleanupRecordingStream();
        chunksRef.current = [];
        recorderRef.current = null;
        setDictationStatus("idle");
        setDictationError(DICTATION_ERROR_COPY);
      };
      recorder.onstop = () => {
        void handleRecordingStop();
      };

      recorder.start();
      setDictationStatus("recording");
      recordingTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, SESSION_TRANSCRIPTION_MAX_RECORDING_MS);
    } catch {
      cleanupRecordingStream();
      chunksRef.current = [];
      recorderRef.current = null;
      setDictationStatus("idle");
      setDictationError(DICTATION_ERROR_COPY);
    }
  }, [canUseDictation, cleanupRecordingStream, clearRecordingTimeout, handleRecordingStop, stopRecording]);

  useEffect(() => {
    return () => {
      clearRecordingTimeout();

      const recorder = recorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }

      cleanupRecordingStream();
      chunksRef.current = [];
      recorderRef.current = null;
    };
  }, [cleanupRecordingStream, clearRecordingTimeout]);

  const dictationStatusCopy =
    dictationStatus === "recording" ? "Nagrywanie…" : dictationStatus === "transcribing" ? "Przepisywanie…" : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="mx-auto w-full max-w-3xl"
    >
      <label htmlFor="session-message" className="sr-only">
        Treść wiadomości
      </label>
      {/* Pole i przyciski tworzą jedną kartę: tekst u góry, sterowanie w dolnym
          rzędzie — jak kartka, nie formularz. */}
      <div
        className={cn(
          "border-line-strong bg-surface shadow-card focus-within:border-brand-ring focus-within:ring-brand-ring/20 rounded-[18px] border transition-colors focus-within:ring-2",
          isDisabled && "bg-surface-soft",
        )}
      >
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
          placeholder="Napisz, od czego chcesz zacząć…"
          className="text-ink placeholder:text-ink-faint block max-h-60 min-h-14 w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-base leading-relaxed outline-none disabled:cursor-not-allowed sm:min-h-[4.5rem]"
        />
        <div className="flex items-center justify-between gap-3 px-2.5 pb-2.5 pl-4">
          {/* The hint used to be *replaced* by the counter, so it disappeared exactly
              when a long message made "how do I send this?" pressing. Show both —
              but not the keyboard shortcut on phones, where there is no Cmd key. */}
          <p className={cn("text-ink-faint text-xs", !isNearCharLimit && "hidden sm:block")}>
            <span className="hidden sm:inline">Enter dodaje nową linię, Cmd/Ctrl + Enter wysyła.</span>
            {isNearCharLimit ? (
              <span className="text-ink-muted font-medium tabular-nums sm:ml-2">
                {trimmedValue.length}/{SESSION_MESSAGE_MAX_CHARS}
              </span>
            ) : null}
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={!canUseDictation}
              aria-pressed={dictationStatus === "recording"}
              onClick={() => {
                if (dictationStatus === "recording") {
                  stopRecording();
                  return;
                }

                void startRecording();
              }}
              className="border-line-accent bg-surface text-ink-soft hover:bg-surface-soft hover:text-ink focus-visible:ring-brand-ring inline-flex h-10 items-center justify-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {dictationStatus === "recording" ? (
                <Square aria-hidden="true" className="text-clay h-4 w-4 fill-current" />
              ) : dictationStatus === "transcribing" ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <Mic aria-hidden="true" className="h-4 w-4" />
              )}
              {dictationStatus === "recording"
                ? "Zatrzymaj"
                : dictationStatus === "transcribing"
                  ? "Przepisywanie…"
                  : "Dyktuj"}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring disabled:bg-brand-disabled inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp aria-hidden="true" className="h-4 w-4" />
              )}
              Wyślij
            </button>
          </div>
        </div>
      </div>
      {(dictationStatusCopy !== null || dictationError !== null) && (
        <p className="text-ink-muted mt-2 text-xs" role={dictationError ? "alert" : "status"}>
          {dictationError ?? dictationStatusCopy}
        </p>
      )}
    </form>
  );
}

async function blobToBase64(blob: Blob) {
  if (typeof FileReader === "undefined") {
    throw new Error("file_reader_unavailable");
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error("file_reader_failed"));
    };
    reader.onloadend = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("file_reader_failed"));
        return;
      }

      const [, base64 = ""] = reader.result.split(",", 2);
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
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
