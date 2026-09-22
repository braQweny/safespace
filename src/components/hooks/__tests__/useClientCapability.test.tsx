import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useClientCapability } from "../useClientCapability";

function Probe({ read, serverValue }: { read: () => boolean; serverValue: boolean }) {
  return <span>{String(useClientCapability(read, serverValue))}</span>;
}

describe("useClientCapability", () => {
  it("renders the server value in SSR without asking the browser", () => {
    const read = vi.fn(() => true);

    expect(renderToStaticMarkup(<Probe read={read} serverValue={false} />)).toBe("<span>false</span>");
    expect(renderToStaticMarkup(<Probe read={read} serverValue />)).toBe("<span>true</span>");
    expect(read).not.toHaveBeenCalled();
  });
});
