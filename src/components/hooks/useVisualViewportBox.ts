import { useSyncExternalStore } from "react";

/**
 * Widoczny wycinek strony, gdy klawiatura ekranowa zmniejsza tylko visual
 * viewport. Chromium na Androidzie z `interactive-widget=resizes-content`
 * (meta w `Layout.astro`) zmniejsza cały layout viewport i tu wychodzi `null`;
 * Safari na iOS i część WebView (np. przeglądarka w Messengerze) zostawiają
 * layout viewport w spokoju, a stronę przesuwają — wtedy rozmowa musi sama
 * zmieścić się w tym wycinku, inaczej pole pisania zostaje pod klawiaturą.
 */
export interface VisualViewportBox {
  /** Wysokość widocznego wycinka w px CSS. */
  height: number;
  /** O ile przeglądarka przesunęła stronę w dół, żeby pokazać pole z fokusem. */
  offsetTop: number;
}

/**
 * Mniejsza różnica to chowający się pasek adresu albo pasek przewijania —
 * te zmieniają oba viewporty razem. Klawiatura zabiera co najmniej ćwierć ekranu.
 */
export const KEYBOARD_MIN_HEIGHT_PX = 100;

export function resolveVisualViewportBox(input: {
  innerHeight: number;
  viewportHeight: number;
  offsetTop: number;
  scale: number;
}): VisualViewportBox | null {
  // Powiększenie szczypnięciem też zmniejsza visual viewport, ale wtedy
  // użytkownik chce obejrzeć fragment, nie kurczyć układ rozmowy.
  if (!Number.isFinite(input.viewportHeight) || !Number.isFinite(input.innerHeight)) {
    return null;
  }

  if (Math.abs(input.scale - 1) > 0.01) {
    return null;
  }

  if (input.innerHeight - input.viewportHeight < KEYBOARD_MIN_HEIGHT_PX) {
    return null;
  }

  return {
    height: Math.round(input.viewportHeight),
    offsetTop: Math.max(0, Math.round(Number.isFinite(input.offsetTop) ? input.offsetTop : 0)),
  };
}

function isSameBox(a: VisualViewportBox | null, b: VisualViewportBox | null) {
  if (a === null || b === null) {
    return a === b;
  }

  return a.height === b.height && a.offsetTop === b.offsetTop;
}

// `useSyncExternalStore` porównuje migawki tożsamością, więc niezmieniony
// wynik musi wracać jako ten sam obiekt — inaczej render zapętla się.
let cachedBox: VisualViewportBox | null = null;

function readClientBox(): VisualViewportBox | null {
  const viewport = window.visualViewport;
  const next = viewport
    ? resolveVisualViewportBox({
        innerHeight: window.innerHeight,
        viewportHeight: viewport.height,
        offsetTop: viewport.offsetTop,
        scale: viewport.scale,
      })
    : null;

  if (!isSameBox(cachedBox, next)) {
    cachedBox = next;
  }

  return cachedBox;
}

const readServerBox = () => null;

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;

  if (!viewport) {
    return () => undefined;
  }

  viewport.addEventListener("resize", onChange);
  viewport.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);

  return () => {
    viewport.removeEventListener("resize", onChange);
    viewport.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

/** `null` w SSR, podczas hydratacji i zawsze, gdy klawiatura nie zasłania strony. */
export function useVisualViewportBox() {
  return useSyncExternalStore(subscribe, readClientBox, readServerBox);
}
