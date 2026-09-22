import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import InlineConfirm, { focusOnMount } from "../InlineConfirm";

const { useDialogEscapeLayer } = vi.hoisted(() => ({ useDialogEscapeLayer: vi.fn() }));

vi.mock("@/components/hooks/useDialogEscapeLayers", () => ({ useDialogEscapeLayer }));

type Props = Parameters<typeof InlineConfirm>[0];
type AnyElement = ReactElement<{ children?: ReactNode; onClick?: () => void; ref?: unknown; disabled?: boolean }>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    headingId: "confirm-heading",
    title: "Usunąć ten zapis?",
    body: "Tego nie da się cofnąć.",
    cancelLabel: "Anuluj",
    confirmLabel: "Usuń",
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };
}

/** Drzewo elementów bez renderu: komponent nie ma własnych hooków poza zamockowaną warstwą Escape. */
function buttonsOf(element: ReactNode): AnyElement[] {
  if (!isValidElement(element)) return [];
  const node = element as AnyElement;
  const own = node.type === "button" ? [node] : [];
  return [...own, ...Children.toArray(node.props.children).flatMap(buttonsOf)];
}

beforeEach(() => {
  useDialogEscapeLayer.mockClear();
});

describe("InlineConfirm", () => {
  it("is a group named by its own heading that can take focus without joining the tab order", () => {
    const html = renderToStaticMarkup(<InlineConfirm {...props()} />);

    expect(html).toMatch(/^<div role="group" aria-labelledby="confirm-heading" tabindex="-1" class="[^"]*mt-4[^"]*p-4/);
    expect(html).toContain('<p id="confirm-heading" class="font-semibold">Usunąć ten zapis?</p>');
    expect(html).toContain('<p class="mt-1">Tego nie da się cofnąć.</p>');
  });

  it("moves focus onto itself when it opens", () => {
    const element = InlineConfirm(props()) as AnyElement;
    const node = { focus: vi.fn() };

    expect(element.props.ref).toBe(focusOnMount);
    focusOnMount(node as unknown as HTMLElement);
    expect(node.focus).toHaveBeenCalledTimes(1);
    // React woła ref z `null` przy odmontowaniu — bez błędu.
    expect(() => {
      focusOnMount(null);
    }).not.toThrow();
  });

  it("registers an Escape layer in the surrounding dialog that cancels, not closes", () => {
    const onCancel = vi.fn();

    renderToStaticMarkup(<InlineConfirm {...props({ onCancel })} />);

    expect(useDialogEscapeLayer).toHaveBeenCalledWith(true, onCancel);
    const dismiss = useDialogEscapeLayer.mock.calls[0]?.[1] as () => void;
    dismiss();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("wires the cancel and confirm buttons to their callbacks", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const [cancel, confirm] = buttonsOf(InlineConfirm(props({ onCancel, onConfirm })));

    cancel.props.onClick?.();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    confirm.props.onClick?.();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("disables the confirm button while pending and shows the spinner and label only when asked", () => {
    const quiet = renderToStaticMarkup(<InlineConfirm {...props({ isPending: true })} />);
    const loud = renderToStaticMarkup(
      <InlineConfirm {...props({ isPending: true, pendingLabel: "Usuwanie…", showsPendingSpinner: true })} />,
    );
    const idle = renderToStaticMarkup(
      <InlineConfirm {...props({ pendingLabel: "Usuwanie…", showsPendingSpinner: true })} />,
    );

    expect(quiet).toMatch(/<button type="button" disabled=""[^>]*>Usuń<\/button>/);
    expect(quiet).not.toContain("animate-spin");
    expect(loud).toMatch(
      /<button type="button" disabled=""[^>]*><svg[^>]*animate-spin[\s\S]*?<\/svg>Usuwanie…<\/button>/,
    );
    expect(idle).not.toContain('disabled=""');
    expect(idle).not.toContain("animate-spin");
    expect(idle).toContain(">Usuń</button>");
  });

  it("has a smaller nested variant for a row inside a list", () => {
    const html = renderToStaticMarkup(<InlineConfirm {...props({ variant: "nested" })} />);

    expect(html).toMatch(/^<div[^>]*class="[^"]*bg-surface-soft[^"]*mt-2[^"]*p-3/);
    expect(html).toContain('<div class="mt-2 flex flex-wrap gap-2">');
  });
});
