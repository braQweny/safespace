import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { BillingStatus } from "@/lib/billing/status-contract";
import { parseBillingStatusResponse } from "@/lib/billing/status-contract";
import BillingPanel from "../BillingPanel";

const status: BillingStatus = {
  enabled: true,
  available: true,
  status: null,
  premiumActive: false,
  paidUntil: null,
  cancelAtPeriodEnd: false,
  deletionPending: false,
  pendingCheckout: false,
  canManage: false,
  canPurchase: true,
  manualPremium: false,
  accountBlocked: false,
};

describe("subscription interface", () => {
  it("a success redirect alone shows waiting and does not claim premium", () => {
    const html = renderToStaticMarkup(<BillingPanel locale="en" initialStatus={status} checkoutReturn="success" />);
    expect(html).toContain("Waiting for payment confirmation");
    expect(html).not.toContain("Paid premium access is active");
    expect(html).toContain("Test payments only");
  });

  it("confirmed payment shows premium and its paid end date without another checkout", () => {
    const html = renderToStaticMarkup(
      <BillingPanel
        locale="pl"
        initialStatus={{
          ...status,
          premiumActive: true,
          paidUntil: "2026-10-01T12:00:00Z",
          status: "active",
          canPurchase: false,
          canManage: true,
        }}
      />,
    );
    expect(html).toContain("Opłacony dostęp premium jest aktywny");
    expect(html).toContain("października");
    expect(html).not.toContain('action="/api/billing/checkout"');
    expect(html).toContain('action="/api/billing/portal"');
  });

  it("keeps cancellation and failed renewal explanations consistent with the paid period", () => {
    const html = renderToStaticMarkup(
      <BillingPanel
        locale="en"
        initialStatus={{
          ...status,
          status: "past_due",
          premiumActive: true,
          cancelAtPeriodEnd: true,
          canPurchase: false,
          canManage: true,
        }}
      />,
    );
    expect(html).toContain("Paid premium access is active");
    expect(html).toContain("Renewal is canceled");
    expect(html).toContain("Without a successful renewal, paid access ends");
  });

  it("keeps the portal discoverable but disabled when billing is off", () => {
    const html = renderToStaticMarkup(
      <BillingPanel locale="en" initialStatus={{ ...status, enabled: false, canPurchase: false, canManage: true }} />,
    );
    expect(html).toContain("disabled");
    expect(html).toContain("billing portal is temporarily unavailable");
    expect(html).not.toContain('action="/api/billing/checkout"');
  });

  it("shows a deletion retry path without checkout", () => {
    const html = renderToStaticMarkup(
      <BillingPanel locale="pl" initialStatus={{ ...status, deletionPending: true, canPurchase: false }} />,
    );
    expect(html).toContain('href="/account/delete"');
    expect(html).not.toContain('action="/api/billing/checkout"');
  });

  it("requires server-confirmed boolean entitlement in status responses", () => {
    expect(parseBillingStatusResponse({ ok: true, data: status })).toEqual(status);
    expect(parseBillingStatusResponse({ ok: true, data: { ...status, premiumActive: "true" } })).toBeNull();
    expect(parseBillingStatusResponse({ ok: true, data: { ...status, paidUntil: "bad" } })).toBeNull();
    expect(parseBillingStatusResponse({ checkout: "success" })).toBeNull();
  });
});
