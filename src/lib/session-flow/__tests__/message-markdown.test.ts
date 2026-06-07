import { describe, expect, it } from "vitest";
import { parseMessageMarkdown, parseMessageMarkdownInlines } from "../message-markdown";

describe("message markdown parsing", () => {
  it("parses inline strong text without exposing markdown markers", () => {
    expect(parseMessageMarkdownInlines("Odpowiedz tylko: **cialo**, **glowa** albo **emocje**.")).toEqual([
      {
        kind: "text",
        text: "Odpowiedz tylko: ",
      },
      {
        kind: "strong",
        text: "cialo",
      },
      {
        kind: "text",
        text: ", ",
      },
      {
        kind: "strong",
        text: "glowa",
      },
      {
        kind: "text",
        text: " albo ",
      },
      {
        kind: "strong",
        text: "emocje",
      },
      {
        kind: "text",
        text: ".",
      },
    ]);
  });

  it("turns numbered answer steps into an ordered list", () => {
    expect(
      parseMessageMarkdown(
        [
          "Jesli chcesz, mozemy to rozebrac na bardzo male kroki:",
          "1. **Co sie dzieje tu i teraz?**",
          "2. **Czy bardziej chodzi o zmeczenie ciala, przeciazenie glowy, czy trudny",
          "emocjonalnie moment?**",
        ].join("\n"),
      ),
    ).toEqual([
      {
        kind: "paragraph",
        inlines: [
          {
            kind: "text",
            text: "Jesli chcesz, mozemy to rozebrac na bardzo male kroki:",
          },
        ],
      },
      {
        kind: "ordered-list",
        items: [
          [
            {
              kind: "strong",
              text: "Co sie dzieje tu i teraz?",
            },
          ],
          [
            {
              kind: "strong",
              text: "Czy bardziej chodzi o zmeczenie ciala, przeciazenie glowy, czy trudny emocjonalnie moment?",
            },
          ],
        ],
      },
    ]);
  });
});
