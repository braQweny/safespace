import { describe, expect, it } from "vitest";
import { buildSessionHref, resolveAutoStartRequest } from "../session-start-url";

/*
 * „Zapisz i zacznij rozmowę” wraca na panel z `?start=now`. Najgroźniejszy błąd
 * tej ścieżki to zużycie kolejnej rozmowy z puli przy zwykłym odświeżeniu, więc
 * parametr musi znikać z adresu także wtedy, gdy start w ogóle nie następuje.
 */
describe("resolveAutoStartRequest", () => {
  it("ignores a panel opened without the start request", () => {
    expect(resolveAutoStartRequest("?avatar=updated", true)).toEqual({
      isRequested: false,
      shouldStart: false,
      nextSearch: "?avatar=updated",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("starts once and strips the parameter from the address", () => {
    expect(resolveAutoStartRequest("?start=now", true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("keeps the remaining query while dropping the start request", () => {
    expect(resolveAutoStartRequest("?historyAvatar=cbt-guide&start=now", true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "?historyAvatar=cbt-guide",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("strips the parameter but does not start when the allowance is used up", () => {
    expect(resolveAutoStartRequest("?start=now", false)).toEqual({
      isRequested: true,
      shouldStart: false,
      nextSearch: "",
      aboutPersonId: null,
      aboutDifficultyId: null,
    });
  });

  it("ignores any other value of the parameter", () => {
    expect(resolveAutoStartRequest("?start=later", true).isRequested).toBe(false);
  });

  it("carries a person card from the dashboard into the start and strips it from the address too", () => {
    const personId = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
    expect(resolveAutoStartRequest(`?start=now&about=${personId}`, true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
      aboutPersonId: personId,
      aboutDifficultyId: null,
    });
    expect(resolveAutoStartRequest("?start=now&about=marta", true).aboutPersonId).toBeNull();
    expect(buildSessionHref("s", { aboutPersonId: personId })).toBe(`/dashboard/session?sessionId=s&about=${personId}`);
    expect(buildSessionHref("s")).toBe("/dashboard/session?sessionId=s");
  });

  it("carries a difficulty from the topic map the same way, under its own parameter", () => {
    const difficultyId = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
    expect(resolveAutoStartRequest(`?start=now&topic=${difficultyId}`, true)).toEqual({
      isRequested: true,
      shouldStart: true,
      nextSearch: "",
      aboutPersonId: null,
      aboutDifficultyId: difficultyId,
    });
    expect(resolveAutoStartRequest("?start=now&topic=odmawianie", true).aboutDifficultyId).toBeNull();
    expect(buildSessionHref("s", { aboutDifficultyId: difficultyId })).toBe(
      `/dashboard/session?sessionId=s&topic=${difficultyId}`,
    );
  });
});
