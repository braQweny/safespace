import { useEffect, useState } from "react";
import { LocaleProvider } from "@/components/LocaleProvider";
import { useLocale } from "@/components/hooks/useLocale";
import { requestApiJson } from "@/lib/api-client";
import { formatBillingDate, getBillingCopy, getBillingErrorCopy } from "@/lib/billing/copy";
import { parseBillingStatusResponse, type BillingStatus } from "@/lib/billing/status-contract";
import type { Locale } from "@/lib/i18n/locale";

interface Props {
  locale: Locale;
  initialStatus: BillingStatus | null;
  checkoutReturn?: "success" | "canceled" | null;
  errorCode?: string | null;
}

export default function BillingPanel(props: Props) {
  return (
    <LocaleProvider locale={props.locale}>
      <BillingPanelView {...props} />
    </LocaleProvider>
  );
}

function BillingPanelView({ initialStatus, checkoutReturn = null, errorCode = null }: Props) {
  const locale = useLocale();
  const copy = getBillingCopy(locale);
  const [status, setStatus] = useState(initialStatus);
  const [pollingEnded, setPollingEnded] = useState(false);
  const waiting =
    !!status?.enabled &&
    !status.premiumActive &&
    !status.deletionPending &&
    (checkoutReturn === "success" || status.pendingCheckout);
  const error = getBillingErrorCopy(locale, errorCode);

  useEffect(() => {
    if (!waiting) return;
    let disposed = false;
    let attempts = 0;
    const deadline = Date.now() + 60_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    async function check() {
      attempts += 1;
      try {
        const response = await requestApiJson("/api/billing/status", {
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          timeoutMs: 5000,
        });
        const data =
          response.kind === "json" && response.status === 200 ? parseBillingStatusResponse(response.body) : null;
        if (disposed) return;
        if (data) {
          setStatus(data);
          if (data.premiumActive || data.deletionPending || !data.enabled) return;
        }
      } catch {
        if (disposed) return;
      }
      if (attempts < 30 && Date.now() < deadline)
        timer = setTimeout(() => {
          void check();
        }, 2000);
      else setPollingEnded(true);
    }
    void check();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [waiting]);

  if (!status) {
    return (
      <div role="alert" className="border-line-strong bg-surface mt-6 rounded-[20px] border p-6">
        <p className="text-ink-muted text-sm leading-6">{copy.unavailable}</p>
        <a
          href="/account/billing"
          className="text-brand mt-3 inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {copy.refresh}
        </a>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {error ? (
        <p
          role="alert"
          className="border-danger-line bg-danger-soft text-danger rounded-2xl border p-4 text-sm leading-6"
        >
          {error}
        </p>
      ) : null}
      {status.enabled ? (
        <p className="border-line bg-surface-soft text-ink-muted rounded-2xl border p-4 text-sm leading-6">
          {copy.sandbox}
        </p>
      ) : null}
      {checkoutReturn === "canceled" ? (
        <p role="status" className="text-ink-muted text-sm leading-6">
          {copy.returnCanceled}
        </p>
      ) : null}
      {status.accountBlocked ? <p className="text-ink-muted text-sm leading-6">{copy.blocked}</p> : null}
      {status.deletionPending ? (
        <div className="border-line bg-surface-soft rounded-2xl border p-5" role="status">
          <p className="text-ink-muted text-sm leading-6">{copy.deletionPending}</p>
          <a
            href="/account/delete"
            className="text-danger mt-3 inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {copy.deleteLink}
          </a>
        </div>
      ) : null}
      <section className="border-line-strong bg-surface shadow-card rounded-[20px] border p-6 sm:p-8">
        <h2 className="text-ink text-xl font-semibold">{copy.offerTitle}</h2>
        <div role="status" aria-live="polite" className="mt-4">
          <p className="text-brand text-base font-semibold">
            {status.premiumActive ? copy.active : waiting ? copy.waiting : copy.inactive}
          </p>
          {waiting ? (
            <p className="text-ink-muted mt-2 text-sm leading-6">
              {pollingEnded ? copy.waitingLong : copy.waitingBody}
            </p>
          ) : null}
        </div>
        {waiting ? (
          <a
            href="/account/billing?checkout=success"
            className="text-brand mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
          >
            {copy.refresh}
          </a>
        ) : null}
        {status.paidUntil ? (
          <p className="text-ink-muted mt-2 text-sm leading-6">
            {copy.validUntil(formatBillingDate(locale, status.paidUntil))}
          </p>
        ) : null}
        {status.cancelAtPeriodEnd ? <p className="text-ink-muted mt-2 text-sm leading-6">{copy.canceled}</p> : null}
        {status.status === "past_due" || status.status === "unpaid" || status.status === "incomplete" ? (
          <p className="text-danger mt-2 text-sm leading-6">
            {copy.paymentFailed} {copy.noGrace}
          </p>
        ) : null}
        {status.manualPremium ? <p className="text-ink-muted mt-3 text-sm leading-6">{copy.manual}</p> : null}
        {status.premiumActive && !status.accountBlocked ? (
          <a
            href="/dashboard"
            className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring mt-5 inline-flex min-h-12 items-center justify-center rounded-[14px] px-5 py-3 text-base font-semibold focus:outline-none focus-visible:ring-2"
          >
            {copy.conversations}
          </a>
        ) : null}
        {status.canManage ? (
          <div className="mt-5">
            <p className="text-ink-muted text-sm leading-6">{copy.portalDescription}</p>
            <form method="POST" action="/api/billing/portal" className="mt-3">
              <button
                type="submit"
                disabled={!status.enabled}
                className="border-line-accent text-brand hover:bg-surface-hover focus-visible:ring-brand-ring inline-flex min-h-11 items-center justify-center rounded-full border px-5 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copy.manage}
              </button>
            </form>
            {!status.enabled ? <p className="text-ink-muted mt-2 text-sm leading-6">{copy.portalUnavailable}</p> : null}
          </div>
        ) : null}
        {!status.enabled ? <p className="text-ink-muted mt-4 text-sm leading-6">{copy.disabled}</p> : null}
      </section>
      {status.canPurchase ? (
        <section className="border-line-strong bg-surface shadow-card rounded-[20px] border p-6 sm:p-8">
          <h2 className="text-ink text-3xl font-semibold">{copy.price}</h2>
          <p className="text-ink-muted mt-2 text-sm leading-6">{copy.tax}</p>
          <p className="text-ink mt-4 font-medium">{copy.benefits}</p>
          <p className="text-ink-muted mt-2 text-sm leading-6">{copy.freeAllowance}</p>
          <p className="text-ink-muted mt-2 text-sm leading-6">
            {copy.cancellation} {copy.noGrace}
          </p>
          <form method="POST" action="/api/billing/checkout" className="mt-5">
            <button
              type="submit"
              className="bg-brand text-surface hover:bg-brand-strong focus-visible:ring-brand-ring inline-flex min-h-12 w-full items-center justify-center rounded-[14px] px-5 py-3 text-base font-semibold focus:outline-none focus-visible:ring-2"
            >
              {status.pendingCheckout ? copy.resumePurchase : copy.purchase}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
