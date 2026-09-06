import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MVP_MODALITIES, toSelectedModalityAvatar } from "@/lib/modalities";
import type { PersonCard } from "@/lib/session-data/types";
import PeopleCards from "../PeopleCards";
import { buildTalkAboutHref } from "../PersonCardDialog";

vi.mock("@/components/hooks/useLocale", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/hooks/useLocale")>()),
  useLocale: () => "pl",
}));

const hookState = vi.hoisted(() => ({
  pendingForgetId: null as string | null,
  pendingDeleteFactId: null as string | null,
}));

vi.mock("@/components/hooks/usePersonMutations", () => ({
  usePersonMutations: () => ({
    savingPersonId: null,
    savingFactId: null,
    pendingForgetId: hookState.pendingForgetId,
    forgettingId: null,
    pendingDeleteFactId: hookState.pendingDeleteFactId,
    updatePerson: vi.fn(() => Promise.resolve(true)),
    updateFact: vi.fn(() => Promise.resolve(true)),
    requestDeleteFact: vi.fn(),
    cancelDeleteFact: vi.fn(),
    confirmDeleteFact: vi.fn(() => Promise.resolve()),
    requestForget: vi.fn(),
    cancelForget: vi.fn(),
    confirmForget: vi.fn(() => Promise.resolve()),
  }),
}));

vi.mock("@/components/hooks/usePeopleMemoryPreparation", () => ({
  usePeopleMemoryPreparation: vi.fn(),
}));

const avatar = toSelectedModalityAvatar(MVP_MODALITIES.find((m) => m.modalityId === "cbt") ?? MVP_MODALITIES[1]);
const SESSION_A = "5d05a814-22f1-4a1c-9d0a-7e2f9d8c1b2a";
const SESSION_B = "6f0c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

const marta: PersonCard = {
  id: "person-marta",
  avatarId: "cbt-guide",
  name: "Marta",
  nameLocked: false,
  relation: "koleżanka z pracy",
  relationLocked: true,
  userNote: "Moja własna uwaga.",
  createdAt: "2026-09-01T10:00:00.000Z",
  firstMentionedAt: "2026-09-01T10:00:00.000Z",
  lastMentionedAt: "2026-09-05T10:00:00.000Z",
  mentionCount: 2,
  facts: [
    {
      id: "fact-who",
      kind: "who",
      text: "Koleżanka z tego samego zespołu.",
      userEdited: false,
      createdAt: "2026-09-01T10:00:00.000Z",
      sources: [{ sessionId: SESSION_A, conversationAt: "2026-09-01T09:00:00.000Z" }],
    },
    {
      id: "fact-account",
      kind: "account",
      text: "Skomentowała pomysł przy całym zespole.",
      userEdited: true,
      createdAt: "2026-09-05T10:00:00.000Z",
      sources: [
        { sessionId: SESSION_A, conversationAt: "2026-09-01T09:00:00.000Z" },
        { sessionId: SESSION_B, conversationAt: "2026-09-05T09:00:00.000Z" },
      ],
    },
  ],
};

const ola: PersonCard = {
  ...marta,
  id: "person-ola",
  name: "Ola",
  relation: null,
  userNote: "",
  mentionCount: 1,
  lastMentionedAt: null,
  facts: [],
};

function render(props: Partial<Parameters<typeof PeopleCards>[0]> = {}) {
  return renderToStaticMarkup(
    <PeopleCards locale="pl" avatar={avatar} initialCards={[marta, ola]} peopleMemoryEnabled {...props} />,
  );
}

beforeEach(() => {
  hookState.pendingForgetId = null;
  hookState.pendingDeleteFactId = null;
});

describe("PeopleCards", () => {
  it("lists every card as one row button with the relation and mention badge, never an entry's text", () => {
    const html = render();
    expect(html).toContain("Osoby z Twoich rozmów");
    expect(html).toContain("Marek zapamiętuje, kim są dla Ciebie osoby");
    expect(html).toContain('id="people-card-open-person-marta"');
    expect(html).toContain('id="people-card-open-person-ola"');
    expect(html).toContain("koleżanka z pracy");
    expect(html).toContain("relacja niezapisana");
    expect(html).toContain('title="W ilu wcześniejszych rozmowach pojawiła się ta osoba"');
    expect(html).toContain("2 rozmowy");
    expect(html).toContain("1 rozmowa");
    expect(html).toContain("ostatnio 5 wrz 2026");
    expect(html).toContain("Otwórz kartę: Marta.");
    expect(html).not.toContain("Skomentowała pomysł");
    expect(html).not.toContain("<dialog");
  });

  it("explains the empty, disabled and failed states with the avatar's first name", () => {
    expect(render({ initialCards: [] })).toContain(
      "Gdy wspomnisz o kimś, Marek zapamięta, kim ta osoba jest dla Ciebie.",
    );
    const disabled = render({ peopleMemoryEnabled: false });
    expect(disabled).toContain("Zapamiętywanie osób jest wyłączone. Poniższe karty zostają");
    expect(disabled).toContain('href="/account/security#people-memory"');
    expect(render({ initialCards: [], peopleMemoryEnabled: false })).toContain(
      "Zapamiętywanie osób z rozmów jest wyłączone.",
    );
    expect(render({ initialCards: null })).toContain("Nie udało się odczytać kart osób.");
  });

  it("opens a labelled native dialog with the user's own account, provenance links and a conversation as the main action", () => {
    const html = render({ initialSelectedPersonId: "person-marta" });
    expect(html).toContain('<dialog aria-label="Karta osoby" tabindex="-1"');
    expect(html).toContain("Wszystko na tej karcie pochodzi z Twoich słów w rozmowach, nie z ocen awatara.");
    expect(html).toContain("Kim jest dla Ciebie");
    expect(html).toContain("Z Twojego opisu");
    expect(html).not.toContain("Jak to przeżywasz");
    expect(html).toContain("Koleżanka z tego samego zespołu.");
    expect(html).toContain(`href="/dashboard?session=${SESSION_A}"`);
    expect(html).toContain(`href="/dashboard?session=${SESSION_B}"`);
    expect(html).toContain("z rozmów z dni");
    expect(html).toContain("poprawione przez Ciebie");
    expect(html).toContain("Moja własna uwaga.");
    expect(html).toContain("Pierwsza wzmianka: 1 wrz 2026");
    expect(html).toContain("Zapomnij o tej osobie");
    expect(html).toContain("Popraw");
    expect(html).toContain("Usuń wpis");
    expect(html).toContain('href="/dashboard?start=now&amp;about=person-marta"');
    expect(html).toContain("Porozmawiaj o tej osobie");
    expect(html).not.toContain("Zapomnieć o tej osobie na stałe?");
  });

  it("returns to an ongoing conversation of the same perspective instead of starting a new one", () => {
    const html = render({ initialSelectedPersonId: "person-marta", resumeSessionId: SESSION_B });
    expect(html).toContain(`href="/dashboard/session?sessionId=${SESSION_B}&amp;about=person-marta"`);
    expect(html).toContain("Wróć do rozmowy i porozmawiaj o tej osobie");
    expect(buildTalkAboutHref("p", null)).toBe("/dashboard?start=now&about=p");
  });

  it("confirms forgetting and entry removal inside the dialog, naming the avatar and the person", () => {
    hookState.pendingForgetId = "person-marta";
    const forgetting = render({ initialSelectedPersonId: "person-marta" });
    expect(forgetting).toContain("Zapomnieć o tej osobie na stałe?");
    expect(forgetting).toContain("Marek nie będzie już pamiętać, kim jest Marta");
    expect(forgetting).toContain("Zapisy rozmów i ich podsumowania zostają.");
    hookState.pendingForgetId = null;
    hookState.pendingDeleteFactId = "fact-who";
    const deleting = render({ initialSelectedPersonId: "person-marta" });
    expect(deleting).toContain("Usunąć ten wpis?");
    expect(deleting.match(/Usunąć ten wpis\?/g)).toHaveLength(1);
  });

  it("shows a card without entries honestly", () => {
    const html = render({ initialSelectedPersonId: "person-ola" });
    expect(html).toContain("Brak wpisów.");
    expect(html).not.toContain("z rozmowy z dnia");
  });
});
