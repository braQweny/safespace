import { takeLegacyStoredChoice, writePreferenceCookie } from "@/lib/preference-cookie";

export type TopicMapView = "list" | "graph";

/** Ciasteczko z wyborem; serwer czyta je i podaje widokowi jako `initialView`. */
export const TOPIC_MAP_VIEW_COOKIE = "safespace-topic-view";

/**
 * Od ilu kart (osoby + tematy, tyle wierszy pokazałaby lista) widok pamięci
 * proponuje mapę. Przy jednej osobie i jednym temacie mapa to trzy kółka na
 * pustym polu, więc poniżej progu stoi sama lista, bez przełącznika i bez
 * patrzenia na ciasteczko.
 */
export const TOPIC_MAP_MIN_CARDS = 4;

export function isTopicMapOffered(cardCount: number) {
  return cardCount >= TOPIC_MAP_MIN_CARDS;
}

const LEGACY_STORAGE_KEY = "safespace:topic-map-view";
/**
 * Dokładnie próg `md:` z Tailwinda 4 (`48rem`), nie 768 px: rem idzie za
 * domyślnym rozmiarem czcionki, więc przy powiększonej czcionce CSS i skrypt
 * muszą przełączać widok w tym samym miejscu, inaczej widok przeskakuje po
 * hydratacji właśnie u osób, które powiększyły tekst.
 */
const WIDE_QUERY = "(min-width: 48rem)";

// Wybór z tej strony: wygrywa z ciasteczkiem odczytanym przy renderze i działa
// także wtedy, gdy przeglądarka blokuje ciasteczka.
let chosenView: TopicMapView | null = null;
const listeners = new Set<() => void>();

/** Walidacja przy każdym odczycie: cokolwiek innego niż znany widok to „brak wyboru”. */
export function parseTopicMapView(value: unknown): TopicMapView | null {
  return value === "list" || value === "graph" ? value : null;
}

function readWideMedia(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === "function" ? window.matchMedia(WIDE_QUERY) : null;
  } catch {
    return null;
  }
}

/** Wybór i — póki go nie ma — szerokość ekranu, tak jak robiłby to CSS. */
export function subscribeTopicMapView(listener: () => void) {
  listeners.add(listener);
  const media = readWideMedia();
  media?.addEventListener("change", listener);

  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", listener);
  };
}

/**
 * Widok po hydratacji: wybór z tej strony, potem ten z ciasteczka, a bez
 * żadnego szerokość ekranu — mapa od `md:` (48rem), lista poniżej. To ten sam widok,
 * który przed hydratacją pokazywał CSS, więc nic nie przeskakuje.
 */
export function readTopicMapView(initialView: TopicMapView | null): TopicMapView {
  if (chosenView) return chosenView;
  if (initialView) return initialView;
  return readWideMedia()?.matches ? "graph" : "list";
}

/**
 * Serwer i hydratacja: zapamiętany wybór albo `null` — wtedy renderują się oba
 * widoki, a próg `md:` pokazuje właściwy dla szerokości ekranu bez skryptu.
 */
export function getServerTopicMapView(initialView: TopicMapView | null): TopicMapView | null {
  return initialView;
}

export function setTopicMapView(view: TopicMapView) {
  chosenView = view;
  writePreferenceCookie(TOPIC_MAP_VIEW_COOKIE, view);
  for (const listener of listeners) listener();
}

/**
 * Wybór sprzed ciasteczka (`localStorage`) przechodzi do ciasteczka raz, gdy
 * serwer nie miał jeszcze czego odczytać; klucz znika w każdym przypadku.
 */
export function migrateLegacyTopicMapView(hasCookieChoice: boolean) {
  const legacy = parseTopicMapView(takeLegacyStoredChoice(LEGACY_STORAGE_KEY));

  if (legacy && !hasCookieChoice) {
    setTopicMapView(legacy);
  }
}

/** Tylko do testów: zapomina wybór z tej strony. */
export function resetTopicMapViewForTests() {
  chosenView = null;
}
