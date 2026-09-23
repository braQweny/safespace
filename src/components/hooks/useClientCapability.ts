import { useSyncExternalStore } from "react";

const subscribeNever = () => () => {
  // Większość możliwości urządzenia nie zmienia się po hydratacji.
};

const readServerTrue = () => true;
const readServerFalse = () => false;

/**
 * Możliwość, którą zna tylko przeglądarka (nagrywarka, schowek, media query):
 * `serverValue` w SSR i podczas hydratacji, prawdziwa odpowiedź od pierwszego
 * renderu klienta — bez rozjazdu znaczników i bez `setState` w efekcie.
 *
 * `subscribe` podaj tylko dla wartości, która potrafi się zmienić (np. media
 * query), i trzymaj ją na poziomie modułu: nowa tożsamość funkcji to nowa
 * subskrypcja przy każdym renderze.
 */
export function useClientCapability(
  readClient: () => boolean,
  serverValue: boolean,
  subscribe: (onChange: () => void) => () => void = subscribeNever,
) {
  return useSyncExternalStore(subscribe, readClient, serverValue ? readServerTrue : readServerFalse);
}
