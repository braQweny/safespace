import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MODALITY_CHOICES, MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import { getModalityCopy } from "@/lib/modality-copy";
import DashboardSessionHistory, { selectHistoryFilterModalities } from "../DashboardSessionHistory";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  // Istniejące asercje są po polsku; angielski render islandów pokrywa `english-locale.test.tsx`.
  useLocale: () => "pl",
}));

const selectedAvatar = toSelectedModalityAvatar(MVP_MODALITIES[3]);
const selectedAvatarName = getModalityCopy("pl", selectedAvatar.modalityId).avatarName;

describe("selectHistoryFilterModalities", () => {
  it("shows every perspective when the counts could not be read", () => {
    expect(selectHistoryFilterModalities(MODALITY_CHOICES, null, [selectedAvatar.avatarId])).toHaveLength(
      MVP_MODALITIES.length,
    );
  });

  it("keeps only perspectives with conversations plus the ones that must stay selectable", () => {
    const ids = selectHistoryFilterModalities(MODALITY_CHOICES, { "cbt-guide": 2, "integrative-guide": 0 }, [
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
        locale="pl"
        selectedAvatar={selectedAvatar}
        modalities={MODALITY_CHOICES}
        initialHistoryPage={1}
        initialHistory={null}
        sessionCountsByAvatar={{ [selectedAvatar.avatarId]: 3, "cbt-guide": 1 }}
      />,
    );

    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(`aria-label="${selectedAvatar.avatarFirstName}"`);
    expect(html).toContain('aria-label="Marek"');
    expect(html).not.toContain('aria-label="Lena"');
    expect(html).not.toContain('aria-label="Nadia"');
    expect(html).toContain("rozmów: </span>3");
    expect(html).toContain("rozmów: </span>1");
  });

  it("drops the filter when there is only one perspective to show", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        locale="pl"
        selectedAvatar={selectedAvatar}
        modalities={MODALITY_CHOICES}
        initialHistoryPage={1}
        initialHistory={null}
        sessionCountsByAvatar={{ [selectedAvatar.avatarId]: 2 }}
      />,
    );

    expect(html).not.toContain('role="radiogroup"');
    expect(html).not.toContain("Rozmowy z:");
    // Nazwa perspektywy zostaje w nagłówku sekcji.
    expect(html).toContain(selectedAvatarName);
  });

  it("names each filter visibly and accessibly and checks the saved perspective", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        locale="pl"
        selectedAvatar={selectedAvatar}
        modalities={MODALITY_CHOICES}
        initialHistoryPage={1}
        initialHistory={null}
      />,
    );

    for (const modality of MVP_MODALITIES) {
      const name = modality.avatarFirstName;
      expect(html).toContain(`aria-label="${name}"`);
      expect(html).toContain(`>${name}</span>`);
    }
    expect(html).toMatch(new RegExp(`aria-label="${selectedAvatar.avatarFirstName}"[^>]*checked=""`));
    expect(html).toContain('role="radiogroup"');
    expect(html).not.toContain("<select");
    // Pełna nazwa zostaje w nagłówku sekcji.
    expect(html).toContain(selectedAvatarName);
  });

  it("lets the dashboard place the section in its own grid column", () => {
    const html = renderToStaticMarkup(
      <DashboardSessionHistory
        locale="pl"
        className="mt-0 lg:col-start-2 lg:row-start-1 lg:row-end-3"
        selectedAvatar={selectedAvatar}
        modalities={MODALITY_CHOICES}
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
