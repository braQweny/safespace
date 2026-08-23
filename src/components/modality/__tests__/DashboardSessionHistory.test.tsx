import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import DashboardSessionHistory, { getAvatarFirstName } from "../DashboardSessionHistory";

const selectedAvatar = toSelectedModalityAvatar(MVP_MODALITIES[3]);

describe("getAvatarFirstName", () => {
  it("keeps the switcher label short enough to fit the control", () => {
    expect(getAvatarFirstName("Olek, łącznik perspektyw")).toBe("Olek");
    expect(getAvatarFirstName("Lena, uważna słuchaczka")).toBe("Lena");
  });

  it("falls back to the full name when there is nothing to trim", () => {
    expect(getAvatarFirstName("Olek")).toBe("Olek");
  });
});

describe("DashboardSessionHistory", () => {
  it("labels every perspective by first name and marks the saved one", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        selectedAvatar={selectedAvatar}
        modalities={MVP_MODALITIES}
        initialHistoryPage={1}
        initialHistory={null}
      />,
    );

    for (const modality of MVP_MODALITIES) {
      expect(html).toContain(`>${getAvatarFirstName(modality.avatarName)}`);
    }

    expect(html).toContain("(wybrany)");
    // Pełna nazwa i nurt zostają w nagłówku sekcji, nie w kontrolce.
    expect(html).toContain(selectedAvatar.avatarName);
    expect(html).toContain(selectedAvatar.modalityName);
  });

  it("lets the dashboard place the section in its own grid column", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        className="mt-0 lg:col-start-2 lg:row-start-1 lg:row-end-3"
        selectedAvatar={selectedAvatar}
        modalities={MVP_MODALITIES}
        initialHistoryPage={1}
        initialHistory={null}
      />,
    );

    // Sekcja trafia do prawej kolumny panelu: strona nadpisuje domyślny odstęp
    // górny i wskazuje pozycję w siatce.
    const sectionClass = /<section class="([^"]*)"/.exec(html)?.[1] ?? "";

    expect(sectionClass).toContain("lg:col-start-2");
    expect(sectionClass).toContain("lg:row-start-1");
    expect(sectionClass).toContain("lg:row-end-3");
    expect(sectionClass).toContain("mt-0");
    expect(sectionClass).not.toContain("mt-8");
  });
});
