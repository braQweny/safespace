import { useCallback, useEffect, useRef, useState } from "react";
import { useClientCapability } from "@/components/hooks/useClientCapability";
import { getSessionComposerCopy } from "@/components/session/session-composer-copy";
import { requestApiJson } from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/locale";
import { getSessionCopy } from "@/lib/session-copy";
import { getMicrophoneErrorCopy } from "@/lib/session-flow/microphone-error-copy";
import { SESSION_MESSAGE_MAX_CHARS } from "@/lib/session-flow/message-contract";
import {
  isSessionTranscriptionFailure,
  isSessionTranscriptionSuccess,
  SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES,
  SESSION_TRANSCRIPTION_MAX_RECORDING_MS,
} from "@/lib/session-flow/session-transcription-contract";

/**
 * Dyktowanie w polu rozmowy: wykrycie nagrywarki z WebM, nagranie z limitem
 * czasu, przepisanie przez `/api/session/transcribe` i dopisanie tekstu do
 * szkicu — bez wysyłania. Nagranie to treść rozmowy: nie trafia nigdzie poza
 * tę trasę. Każdy błąd ma własny komunikat (odmowa, brak mikrofonu, za duże
 * nagranie, nieudane przepisanie).
 */
export type DictationStatus = "idle" | "recording" | "transcribing";

const RECORDING_TICK_MS = 1_000;

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

/**
 * Dyktowanie wymaga i nagrywarki, i mikrofonu, i formatu, który serwer
 * przyjmuje. Safari na iOS ma nagrywarkę, ale nie WebM — tam przycisk po
 * prostu nie istnieje, zamiast obiecywać i kończyć ogólnym błędem.
 */
export function getDictationSupport(input: {
  mediaRecorder: Pick<typeof MediaRecorder, "isTypeSupported"> | undefined;
  mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined;
}) {
  return (
    typeof input.mediaDevices?.getUserMedia === "function" && getSupportedWebmMimeType(input.mediaRecorder) !== null
  );
}

/**
 * Nazwa wyjątku z `getUserMedia` mówi, co poszło nie tak; ogólne „nie udało
 * się przepisać” było fałszywe, bo nic jeszcze nie zostało nagrane.
 */
export function getDictationErrorCopy(locale: Locale, error: unknown) {
  return getMicrophoneErrorCopy(locale, error);
}

export function formatRecordingProgress(
  locale: Locale,
  elapsedSeconds: number,
  maxRecordingMs = SESSION_TRANSCRIPTION_MAX_RECORDING_MS,
) {
  const maxSeconds = Math.round(maxRecordingMs / 1000);
  const shownSeconds = Math.min(maxSeconds, Math.max(0, Math.floor(elapsedSeconds)));

  return getSessionComposerCopy(locale).recordingProgress(shownSeconds, maxSeconds);
}

function readClientDictationSupport() {
  return getDictationSupport({
    mediaRecorder: typeof MediaRecorder === "undefined" ? undefined : MediaRecorder,
    mediaDevices: getMediaDevices(),
  });
}

export interface UseDictationOptions {
  sessionId: string;
  locale: Locale;
  /** Aktualny szkic: przepisany tekst dopisuje się na jego końcu. */
  value: string;
  /** Pole zamknięte albo tura w locie — nagrywanie się nie zaczyna. */
  isBlocked: boolean;
  onChange: (value: string) => void;
}

export function useDictation({ sessionId, locale, value, isBlocked, onChange }: UseDictationOptions) {
  const { dictation } = getSessionCopy(locale);
  const [status, setStatus] = useState<DictationStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  // `false` w SSR i podczas hydratacji: przycisk „Dyktuj” nie pojawia się,
  // zanim przeglądarka potwierdzi nagrywarkę z WebM.
  const isSupported = useClientCapability(readClientDictationSupport, false);
  const latestValueRef = useRef(value);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordingTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canUse = !isBlocked && status !== "transcribing";

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  const clearRecordingTimers = useCallback(() => {
    if (recordingTimeoutRef.current !== null) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }

    if (recordingTickRef.current !== null) {
      clearInterval(recordingTickRef.current);
      recordingTickRef.current = null;
    }
  }, []);

  const cleanupRecordingStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    streamRef.current = null;
  }, []);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;

    if (!recorder || recorder.state === "inactive") {
      return;
    }

    recorder.stop();
  }, []);

  const handleRecordingStop = useCallback(async () => {
    clearRecordingTimers();
    cleanupRecordingStream();

    const chunks = chunksRef.current;
    chunksRef.current = [];
    recorderRef.current = null;

    const audio = new Blob(chunks, { type: "audio/webm" });

    if (audio.size <= 0) {
      setStatus("idle");
      setError(dictation.transcriptionFailed);
      return;
    }

    if (audio.size > SESSION_TRANSCRIPTION_MAX_AUDIO_BYTES) {
      setStatus("idle");
      setError(dictation.recordingTooLarge);
      return;
    }

    setStatus("transcribing");
    setError(null);

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

      if (result.kind === "json" && (result.status === 413 || isAudioTooLargeFailure(result.body))) {
        setError(dictation.recordingTooLarge);
        return;
      }

      if (result.kind !== "json" || result.status !== 200 || !isSessionTranscriptionSuccess(result.body)) {
        setError(dictation.transcriptionFailed);
        return;
      }

      const appendedDraft = appendTranscriptionToDraft(latestValueRef.current, result.body.text);

      if (!appendedDraft.didAppend) {
        setError(dictation.transcriptionTooLong);
        return;
      }

      onChange(appendedDraft.value);
      setError(appendedDraft.wasTruncated ? dictation.transcriptionTooLong : null);
    } catch {
      setError(dictation.transcriptionFailed);
    } finally {
      setStatus("idle");
    }
  }, [cleanupRecordingStream, clearRecordingTimers, dictation, onChange, sessionId]);

  const start = useCallback(async () => {
    if (!canUse) {
      return;
    }

    setError(null);

    const mediaDevices = getMediaDevices();

    if (typeof MediaRecorder === "undefined" || typeof mediaDevices?.getUserMedia !== "function") {
      setError(dictation.microphoneUnavailable);
      return;
    }

    const mimeType = getSupportedWebmMimeType(MediaRecorder);

    if (!mimeType) {
      setError(dictation.microphoneUnavailable);
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
        clearRecordingTimers();
        cleanupRecordingStream();
        chunksRef.current = [];
        recorderRef.current = null;
        setStatus("idle");
        setError(dictation.transcriptionFailed);
      };
      recorder.onstop = () => {
        void handleRecordingStop();
      };

      recorder.start();
      const startedAtMs = Date.now();
      setRecordingSeconds(0);
      setStatus("recording");
      recordingTickRef.current = setInterval(() => {
        setRecordingSeconds(Math.floor((Date.now() - startedAtMs) / 1000));
      }, RECORDING_TICK_MS);
      recordingTimeoutRef.current = setTimeout(() => {
        stop();
      }, SESSION_TRANSCRIPTION_MAX_RECORDING_MS);
    } catch (caught) {
      cleanupRecordingStream();
      chunksRef.current = [];
      recorderRef.current = null;
      setStatus("idle");
      setError(getDictationErrorCopy(locale, caught));
    }
  }, [canUse, cleanupRecordingStream, clearRecordingTimers, dictation, handleRecordingStop, locale, stop]);

  useEffect(() => {
    return () => {
      clearRecordingTimers();

      const recorder = recorderRef.current;

      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }

      cleanupRecordingStream();
      chunksRef.current = [];
      recorderRef.current = null;
    };
  }, [cleanupRecordingStream, clearRecordingTimers]);

  return { isSupported, status, error, recordingSeconds, canUse, start, stop };
}

function isAudioTooLargeFailure(body: unknown) {
  return isSessionTranscriptionFailure(body) && body.code === "audio_too_large";
}

/**
 * `navigator.mediaDevices` nie istnieje w niezabezpieczonym kontekście ani w
 * starszych WebView, choć typy DOM deklarują je jako zawsze obecne.
 */
function getMediaDevices(): MediaDevices | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const browserNavigator: Partial<Pick<Navigator, "mediaDevices">> = navigator;

  return browserNavigator.mediaDevices;
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
