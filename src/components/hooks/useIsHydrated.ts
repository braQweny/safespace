import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {
  // Hydration state never changes after the first client render.
};

/**
 * `false` during SSR and the first client render, `true` afterwards. Islands use
 * it to keep server-rendered markup usable without JavaScript while still
 * enhancing it once React takes over.
 */
export function useIsHydrated() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
