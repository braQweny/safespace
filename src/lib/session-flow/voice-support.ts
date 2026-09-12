/**
 * Czy ta przeglądarka ma z czego zbudować rozmowę głosową: mikrofon i WebRTC.
 * Czysta funkcja, żeby karta startu na panelu i wyspa rozmowy mówiły to samo,
 * a test mógł podać atrapy zamiast globali.
 */
export function readVoiceSupport(input: {
  peerConnection: unknown;
  mediaDevices: Pick<MediaDevices, "getUserMedia"> | undefined;
}) {
  return typeof input.peerConnection === "function" && typeof input.mediaDevices?.getUserMedia === "function";
}

export function getBrowserMediaDevices(): MediaDevices | undefined {
  if (typeof navigator === "undefined") {
    return undefined;
  }

  const browserNavigator: Partial<Pick<Navigator, "mediaDevices">> = navigator;

  return browserNavigator.mediaDevices;
}

/** Odpowiedź z globali przeglądarki; `false` w SSR, gdzie nie ma ani mikrofonu, ani WebRTC. */
export function readClientVoiceSupport() {
  return readVoiceSupport({
    peerConnection: typeof RTCPeerConnection === "undefined" ? undefined : RTCPeerConnection,
    mediaDevices: getBrowserMediaDevices(),
  });
}
