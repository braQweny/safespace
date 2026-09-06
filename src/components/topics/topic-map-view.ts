export type TopicMapView = "list" | "graph";

const STORAGE_KEY = "safespace:topic-map-view";
const WIDE_QUERY = "(min-width: 768px)";

// Wybór trzymany w pamięci sesji na wypadek, gdy przeglądarka blokuje
// `localStorage` (okno prywatne, ustawienia): przełącznik działa i wtedy.
let chosenView: TopicMapView | null = null;
const listeners = new Set<() => void>();

function isTopicMapView(value: unknown): value is TopicMapView {
  return value === "list" || value === "graph";
}

export function subscribeTopicMapView(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Domyślnie mapa od 768 px, lista poniżej; zapamiętany wybór wygrywa. Czysto po stronie klienta. */
export function readTopicMapView(): TopicMapView {
  if (chosenView) return chosenView;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isTopicMapView(stored)) return stored;
  } catch {
    // Brak dostępu do pamięci przeglądarki: decyduje szerokość ekranu.
  }
  try {
    return typeof window.matchMedia === "function" && window.matchMedia(WIDE_QUERY).matches ? "graph" : "list";
  } catch {
    return "list";
  }
}

/** Serwer i pierwszy render po hydratacji pokazują listę: działa bez JS i nie zależy od ekranu. */
export function getServerTopicMapView(): TopicMapView {
  return "list";
}

export function setTopicMapView(view: TopicMapView) {
  chosenView = view;
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    // Wybór zostaje na czas tej strony.
  }
  for (const listener of listeners) listener();
}

/** Tylko do testów: zapomina wybór z tej strony (pamięć przeglądarki zostaje). */
export function resetTopicMapViewForTests() {
  chosenView = null;
}
