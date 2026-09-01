import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import AvatarChoiceForm, { SAVE_BAR_FALLBACK_MESSAGE } from "../AvatarChoiceForm";

function renderForm(props: Partial<Parameters<typeof AvatarChoiceForm>[0]> = {}) {
  return renderToStaticMarkup(<AvatarChoiceForm modalities={MVP_MODALITIES} currentSelection={null} {...props} />);
}

function stripNoscript(html: string) {
  return html.replace(/<noscript>[\s\S]*?<\/noscript>/g, "");
}

function readNoscript(html: string) {
  return /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? "";
}

describe("AvatarChoiceForm", () => {
  it("keeps the save bar out of the server markup so hydration moves nothing", () => {
    // Pasek pojawia się dopiero po realnej zmianie wyboru. Wcześniej stał w
    // HTML i znikał po hydratacji — układ skakał na każdym wejściu.
    const withSavedChoice = stripNoscript(
      renderForm({ currentSelection: toSelectedModalityAvatar(MVP_MODALITIES[2]) }),
    );
    const withoutChoice = stripNoscript(renderForm());

    for (const html of [withSavedChoice, withoutChoice]) {
      expect(html).not.toContain("Zapisz wybór");
      expect(html).not.toContain('name="intent"');
    }
  });

  it("still lets someone without JavaScript save through a <noscript> bar", () => {
    const noscript = readNoscript(renderForm({ canStartConversation: true, sessionBudgetMinutes: "15 min" }));

    expect(noscript).toMatch(/<button type="submit" value="save"[^>]*name="intent"/);
    expect(noscript).toContain("Zapisz wybór");
    expect(noscript).toMatch(/<button type="submit" value="save_and_start"[^>]*name="intent"/);
    expect(noscript).toContain("Zapisz i zacznij rozmowę");
    expect(noscript).toContain("do 15 min");
    expect(noscript).toContain(SAVE_BAR_FALLBACK_MESSAGE);
  });

  it("offers only the plain save when there is nothing to start", () => {
    const html = renderForm();

    expect(html).toContain('value="save"');
    expect(html).not.toContain('value="save_and_start"');
    expect(html).not.toContain("Zapisz i zacznij rozmowę");
  });

  it("renders every perspective as a native radio and checks the saved one", () => {
    const saved = MVP_MODALITIES[0];
    const html = renderForm({ currentSelection: toSelectedModalityAvatar(saved) });

    expect(html).toMatch(/<form[^>]*action="\/api\/profile\/avatar"[^>]*method="POST"/);

    for (const modality of MVP_MODALITIES) {
      expect(html).toMatch(new RegExp(`<input type="radio"[^>]*name="modalityId"[^>]*value="${modality.modalityId}"`));
    }

    expect(html).toMatch(new RegExp(`<input type="radio"[^>]*checked=""[^>]*value="${saved.modalityId}"`));
    expect(html.match(/checked=""/g)?.length).toBe(1);
    // Zdanie porównawcze pokazuje się tylko przy zaznaczonej karcie.
    expect(html).toContain(saved.pairingNote);
    expect(html).not.toContain(MVP_MODALITIES[1].pairingNote);
  });

  it("serves the lighter avatar files and lets them decode off the main thread", () => {
    const html = renderForm();

    for (const modality of MVP_MODALITIES) {
      expect(html).toContain(`src="${modality.assetPath}"`);
      expect(modality.assetPath).toMatch(/\.webp$/);
    }

    expect(html.match(/loading="lazy" decoding="async"/g)?.length).toBe(MVP_MODALITIES.length);
  });
});
