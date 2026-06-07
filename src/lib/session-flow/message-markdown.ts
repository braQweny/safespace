export type MessageMarkdownInline =
  | {
      kind: "text";
      text: string;
    }
  | {
      kind: "strong";
      text: string;
    };

export type MessageMarkdownBlock =
  | {
      kind: "paragraph";
      inlines: MessageMarkdownInline[];
    }
  | {
      kind: "ordered-list";
      items: MessageMarkdownInline[][];
    }
  | {
      kind: "unordered-list";
      items: MessageMarkdownInline[][];
    };

const orderedListItemPattern = /^\s*\d+\.\s+(.+)$/;
const unorderedListItemPattern = /^\s*[-*]\s+(.+)$/;
const strongPattern = /(\*\*|__)(.+?)\1/g;

function normalizeContentLine(line: string) {
  return line.trim().replace(/\s+/g, " ");
}

function getListItemContent(line: string) {
  const orderedMatch = orderedListItemPattern.exec(line);

  if (orderedMatch?.[1]) {
    return {
      kind: "ordered-list" as const,
      content: normalizeContentLine(orderedMatch[1]),
    };
  }

  const unorderedMatch = unorderedListItemPattern.exec(line);

  if (unorderedMatch?.[1]) {
    return {
      kind: "unordered-list" as const,
      content: normalizeContentLine(unorderedMatch[1]),
    };
  }

  return null;
}

function isBlank(line: string) {
  return line.trim().length === 0;
}

export function parseMessageMarkdownInlines(text: string): MessageMarkdownInline[] {
  const inlines: MessageMarkdownInline[] = [];
  let cursor = 0;

  for (const match of text.matchAll(strongPattern)) {
    const matchIndex = match.index;
    const delimiter = match[1];
    const strongText = match[2];

    if (!delimiter || !strongText) {
      continue;
    }

    if (matchIndex > cursor) {
      inlines.push({
        kind: "text",
        text: text.slice(cursor, matchIndex),
      });
    }

    inlines.push({
      kind: "strong",
      text: strongText,
    });
    cursor = matchIndex + match[0].length;
  }

  if (cursor < text.length) {
    inlines.push({
      kind: "text",
      text: text.slice(cursor),
    });
  }

  return inlines.length > 0 ? inlines : [{ kind: "text", text }];
}

export function parseMessageMarkdown(content: string): MessageMarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MessageMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";

    if (isBlank(line)) {
      index += 1;
      continue;
    }

    const listItem = getListItemContent(line);

    if (listItem) {
      const items: MessageMarkdownInline[][] = [];
      const listKind = listItem.kind;

      while (index < lines.length) {
        const currentLine = lines[index] ?? "";

        if (isBlank(currentLine)) {
          break;
        }

        const currentListItem = getListItemContent(currentLine);

        if (currentListItem?.kind !== listKind) {
          break;
        }

        let itemContent = currentListItem.content;
        index += 1;

        while (index < lines.length) {
          const continuationLine = lines[index] ?? "";

          if (isBlank(continuationLine) || getListItemContent(continuationLine)) {
            break;
          }

          itemContent = `${itemContent} ${normalizeContentLine(continuationLine)}`;
          index += 1;
        }

        items.push(parseMessageMarkdownInlines(itemContent));
      }

      blocks.push({
        kind: listKind,
        items,
      });
      continue;
    }

    let paragraph = normalizeContentLine(line);
    index += 1;

    while (index < lines.length) {
      const nextLine = lines[index] ?? "";

      if (isBlank(nextLine) || getListItemContent(nextLine)) {
        break;
      }

      paragraph = `${paragraph} ${normalizeContentLine(nextLine)}`;
      index += 1;
    }

    blocks.push({
      kind: "paragraph",
      inlines: parseMessageMarkdownInlines(paragraph),
    });
  }

  return blocks;
}
