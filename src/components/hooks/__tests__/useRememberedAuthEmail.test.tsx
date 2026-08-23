import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useRememberedAuthEmail } from "../useRememberedAuthEmail";

function Probe({ shouldRestore }: { shouldRestore: boolean }) {
  const { email } = useRememberedAuthEmail({ shouldRestore });

  return <input name="email" value={email} readOnly />;
}

describe("useRememberedAuthEmail (server render)", () => {
  it("renders an empty field on the server whether or not a restore is requested", () => {
    // There is no sessionStorage on the server: the hydration snapshot must be
    // empty so the client can take over without a mismatch.
    expect(renderToStaticMarkup(<Probe shouldRestore={true} />)).toContain('value=""');
    expect(renderToStaticMarkup(<Probe shouldRestore={false} />)).toContain('value=""');
  });
});
