import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import SessionTimer from "../SessionTimer";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

/*
 * Serwer jest jedynym źródłem prawdy o pozostałym czasie. Znaczniki z serwera
 * muszą pokazywać dokładnie to, co serwer policzył — niezależnie od tego, jak
 * bardzo przestawiony jest zegar maszyny, która renderuje stronę. Sam offset
 * (klient z zegarem +5 min nie kończy sesji wcześniej) jest przypięty w
 * `message-state.test.ts` przez `computeServerClockOffsetMs`.
 */
describe("SessionTimer", () => {
  it("renders the server-reported remaining time before any client tick", () => {
    const html = renderToStaticMarkup(
      <SessionTimer
        expiresAt="2000-01-01T00:15:00.000Z"
        initialRemainingSeconds={600}
        totalSeconds={900}
        onExpired={() => undefined}
      />,
    );

    // `expiresAt` leży dawno w przeszłości, a mimo to serwerowe 600 s stoi.
    expect(html).toContain("ok. 10 min");
    expect(html).toContain('role="timer"');
    expect(html).toContain("z 15 min");
  });

  it("shows seconds only in the last two minutes", () => {
    const html = renderToStaticMarkup(
      <SessionTimer
        expiresAt="2000-01-01T00:15:00.000Z"
        initialRemainingSeconds={90}
        totalSeconds={900}
        onExpired={() => undefined}
      />,
    );

    expect(html).toContain("01:30");
    expect(html).toContain("Zostało mniej niż 2 minuty rozmowy.");
  });
});
