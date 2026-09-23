import { createContext, useContext, useEffect, useEffectEvent, useState } from "react";

/**
 * Escape w natywnym `<dialog>` przychodzi jako zdarzenie `cancel` na samym
 * dialogu (tak samo gest „wstecz” na Androidzie), a nie jako keydown na bloku,
 * w którym akurat stoi fokus. Blok potwierdzenia („Usuń”, „Zapomnij”,
 * „Odłącz”) jest wewnętrzną warstwą dialogu: pierwsze Escape zamyka jego,
 * dopiero następne — cały dialog. Właściciel `<dialog>` pyta więc warstwy w
 * `onCancel`, a bloki tylko rejestrują się na czas, gdy są otwarte.
 */
export interface DialogEscapeLayers {
  /** Rejestruje warstwę i zwraca funkcję, która ją wyrejestrowuje. */
  push: (dismiss: () => void) => () => void;
  /** Zamyka ostatnio otwartą warstwę; `false`, gdy nie ma żadnej. */
  dismissTop: () => boolean;
}

export function createDialogEscapeLayers(): DialogEscapeLayers {
  let layers: (() => void)[] = [];

  return {
    push(dismiss) {
      // Własna tożsamość wpisu: ta sama funkcja zarejestrowana dwa razy to dwie warstwy.
      const layer = () => {
        dismiss();
      };
      layers = [...layers, layer];

      return () => {
        layers = layers.filter((entry) => entry !== layer);
      };
    },
    dismissTop() {
      const top = layers.at(-1);

      if (!top) {
        return false;
      }

      top();
      return true;
    },
  };
}

export const DialogEscapeLayersContext = createContext<DialogEscapeLayers | null>(null);

/** Dla właściciela `<dialog>`: jedna lista warstw na cały czas życia komponentu. */
export function useDialogEscapeLayers(): DialogEscapeLayers {
  const [layers] = useState(createDialogEscapeLayers);
  return layers;
}

/**
 * Dla bloku potwierdzenia wewnątrz dialogu: dopóki `isOpen`, Escape zamyka
 * ten blok, a nie dialog. Poza providerem nic nie robi.
 */
export function useDialogEscapeLayer(isOpen: boolean, dismiss: () => void) {
  const layers = useContext(DialogEscapeLayersContext);
  const onDismiss = useEffectEvent(dismiss);

  useEffect(() => {
    if (!isOpen || !layers) {
      return;
    }

    return layers.push(() => {
      onDismiss();
    });
  }, [isOpen, layers]);
}

/**
 * Wspólne `onCancel` dialogów z warstwami. Bez niedawnej aktywacji użytkownika
 * przeglądarka nie pozwala zatrzymać zamknięcia (`cancelable` jest wtedy
 * `false`) i zamknie dialog sama — wtedy zamyka się całość, żeby stan Reacta
 * nie rozjechał się z zamkniętym elementem.
 */
export function handleDialogCancel(
  event: Pick<Event, "cancelable" | "preventDefault">,
  layers: DialogEscapeLayers,
  close: () => void,
) {
  event.preventDefault();

  if (event.cancelable && layers.dismissTop()) {
    return;
  }

  close();
}
