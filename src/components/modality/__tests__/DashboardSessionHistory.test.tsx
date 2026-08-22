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
});
