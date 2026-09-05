import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import DashboardSessionHistory, { getAvatarFirstName, selectHistoryFilterModalities } from "../DashboardSessionHistory";

const selectedAvatar = toSelectedModalityAvatar(MVP_MODALITIES[3]);

describe("getAvatarFirstName", () => {
  it("keeps the switcher name short enough to read at a glance", () => {
    expect(getAvatarFirstName("Olek, łącznik perspektyw")).toBe("Olek");
    expect(getAvatarFirstName("Lena, uważna słuchaczka")).toBe("Lena");
  });

  it("falls back to the full name when there is nothing to trim", () => {
    expect(getAvatarFirstName("Olek")).toBe("Olek");
  });
});

describe("selectHistoryFilterModalities", () => {
  it("shows every perspective when the counts could not be read", () => {
    expect(selectHistoryFilterModalities(MVP_MODALITIES, null, [selectedAvatar.avatarId])).toHaveLength(
      MVP_MODALITIES.length,
    );
  });

  it("keeps only perspectives with conversations plus the ones that must stay selectable", () => {
    const ids = selectHistoryFilterModalities(MVP_MODALITIES, { "cbt-guide": 2, "integrative-guide": 0 }, [
      selectedAvatar.avatarId,
    ]).map((modality) => modality.avatarId);

    expect(ids).toEqual(["cbt-guide", selectedAvatar.avatarId]);
  });
});

describe("DashboardSessionHistory", () => {
  it("lists only the perspectives someone actually talked with, with their counts", () => {
    // Pięć przełączników, z których cztery prowadziły do pustej listy,
    // obiecywało coś, czego nie było.
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        selectedAvatar={selectedAvatar}
        modalities={MVP_MODALITIES}
        initialHistoryPage={1}
        initialHistory={null}
        sessionCountsByAvatar={{ [selectedAvatar.avatarId]: 3, "cbt-guide": 1 }}
      />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(`aria-label="${getAvatarFirstName(selectedAvatar.avatarName)}"`);
    expect(html).toContain('aria-label="Marek"');
    expect(html).not.toContain('aria-label="Lena"');
    expect(html).not.toContain('aria-label="Nadia"');
    expect(html).toContain("rozmów: </span>3");
    expect(html).toContain("rozmów: </span>1");
  });

  it("drops the filter when there is only one perspective to show", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        selectedAvatar={selectedAvatar}
        modalities={MVP_MODALITIES}
        initialHistoryPage={1}
        initialHistory={null}
        sessionCountsByAvatar={{ [selectedAvatar.avatarId]: 2 }}
      />,
    );

    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("Rozmowy z:");
    // Nazwa perspektywy zostaje w nagłówku sekcji.
    expect(html).toContain(selectedAvatar.avatarName);
  });

  it("names each filter visibly and accessibly and checks the saved perspective", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        selectedAvatar={selectedAvatar}
        modalities={MVP_MODALITIES}
        initialHistoryPage={1}
        initialHistory={null}
      />,
    );

    for (const modality of MVP_MODALITIES) {
      const name = getAvatarFirstName(modality.avatarName);
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain(`>${name}</span>`);
    }
    expect(html).toMatch(new RegExp(`aria-label="${getAvatarFirstName(selectedAvatar.avatarName)}"[^>]*checked=""`));
    expect(html).toContain('role="radiogroup"');
    expect(html).not.toContain("<select");
    // Pełna nazwa zostaje w nagłówku sekcji.
    expect(html).toContain(selectedAvatar.avatarName);
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
