import { randomUUID } from "node:crypto";
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import { createServerClient } from "@supabase/ssr";
import { Client } from "pg";
import Stripe from "stripe";

interface SandboxConfig {
  appUrl: string;
  supabaseUrl: string;
  supabaseKey: string;
  stripeKey: string;
  databaseUrl: string;
}

function localHttp(raw: string | undefined, port?: string) {
  const url = new URL(raw ?? "");
  if (
    url.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    (port && url.port !== port) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Sandbox E2E only accepts the explicitly configured local application and Supabase stack.");
  }
  return url.origin;
}

function readConfig(): SandboxConfig {
  if (process.env.CI || process.env.BILLING_E2E !== "1" || process.env.BILLING_MODE !== "sandbox") {
    throw new Error("Sandbox E2E is opt-in and cannot run in CI.");
  }
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  if (!/^sk_test_[A-Za-z0-9]+$/.test(stripeKey)) throw new Error("Sandbox E2E refuses non-test Stripe keys.");
  const databaseUrl = new URL(process.env.BILLING_E2E_DATABASE_URL ?? "");
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
    databaseUrl.port !== "54322" ||
    databaseUrl.username !== "postgres" ||
    databaseUrl.pathname !== "/postgres" ||
    !databaseUrl.password ||
    databaseUrl.search
  ) {
    throw new Error(
      "BILLING_E2E_DATABASE_URL must explicitly select the local postgres fixture connection on port 54322.",
    );
  }
  const supabaseKey = process.env.SUPABASE_KEY ?? "";
  if (!supabaseKey || supabaseKey.startsWith("sb_secret_")) throw new Error("Use the local Supabase anonymous key.");
  if (supabaseKey.split(".").length === 3) {
    const claims: unknown = JSON.parse(Buffer.from(supabaseKey.split(".")[1], "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || !("role" in claims) || claims.role !== "anon") {
      throw new Error("Supabase fixture authentication must use the anonymous key.");
    }
  }
  return {
    appUrl: localHttp(process.env.BILLING_APP_URL),
    supabaseUrl: localHttp(process.env.SUPABASE_URL, "54321"),
    supabaseKey,
    stripeKey,
    databaseUrl: databaseUrl.href,
  };
}

export interface SandboxOwner {
  appUrl: string;
  userId: string;
  customerId: string;
  clockId: string;
  stripe: Stripe;
  db: Client;
  storageState: Awaited<ReturnType<BrowserContext["storageState"]>>;
  signInAgain(context: BrowserContext): Promise<void>;
  paidStatus(): Promise<{ active: boolean; paidUntil: Date | null; status: string | null }>;
  advanceClock(frozenTime: number): Promise<void>;
}

async function makeOwner(config: SandboxConfig, run: (owner: SandboxOwner) => Promise<void>) {
  const runId = `${Date.now()}-${randomUUID()}`;
  const email = `billing-e2e-${runId}@example.com`;
  const password = `Sandbox-${randomUUID()}-8a!`;
  const cookieJar = new Map<string, string>();
  const auth = createServerClient(config.supabaseUrl, config.supabaseKey, {
    cookieOptions: { secure: false },
    cookies: {
      getAll: () => Array.from(cookieJar, ([name, value]) => ({ name, value })),
      setAll: (cookies) => {
        for (const cookie of cookies) cookieJar.set(cookie.name, cookie.value);
      },
    },
  });
  const getStorageState = (): SandboxOwner["storageState"] => ({
    cookies: [
      ...Array.from(cookieJar, ([name, value]) => ({ name, value })),
      { name: "safespace-locale", value: "en" },
    ].map((cookie) => ({
      ...cookie,
      domain: new URL(config.appUrl).hostname,
      path: "/",
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    })),
    origins: [],
  });
  const stripe = new Stripe(config.stripeKey, {
    apiVersion: "2026-08-26.dahlia",
    maxNetworkRetries: 1,
    timeout: 15_000,
  });
  const db = new Client({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10_000,
  });
  let userId: string | undefined;
  let clockId: string | undefined;
  let customerId: string | undefined;
  let failure: unknown;
  const cleanupErrors: string[] = [];
  await db.connect();
  try {
    const migration = await db.query<{ installed: boolean }>(
      "select exists(select 1 from supabase_migrations.schema_migrations where version='20260905175333') as installed",
    );
    if (!migration.rows[0]?.installed) throw new Error("The intended local database is missing the billing migration.");
    const signup = await auth.auth.signUp({ email, password });
    userId = signup.data.user?.id;
    if (signup.error || !userId || !signup.data.session)
      throw new Error("Local fixture signup needs automatic email confirmation.");
    const matchingUser = await db.query("select 1 from auth.users where id=$1 and email=$2", [userId, email]);
    if (matchingUser.rowCount !== 1)
      throw new Error("Supabase Auth and fixture database do not refer to the same local stack.");
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: `SafeSpace E2E ${runId}`,
    });
    clockId = clock.id;
    const customer = await stripe.customers.create({
      test_clock: clockId,
      email,
      name: "SafeSpace Sandbox Test",
      metadata: { safespace_e2e: runId },
    });
    if (customer.livemode) throw new Error("Refusing a live Stripe customer.");
    customerId = customer.id;
    await db.query("insert into private.billing_accounts(user_id,stripe_customer_id) values($1,$2)", [
      userId,
      customerId,
    ]);
    // Setup only: three finished free slots, no conversation contents and no
    // premium writes. The actual fourth session is created by the application.
    for (let index = 0; index < 3; index += 1) {
      const inserted = await db.query<{ id: string }>(
        "insert into public.therapy_sessions(user_id,modality_id,avatar_id,duration_bucket_seconds) values($1,'cbt','cbt-guide',900) returning id",
        [userId],
      );
      await db.query("update public.therapy_sessions set status='expired' where id=$1 and user_id=$2", [
        inserted.rows[0].id,
        userId,
      ]);
    }
    const ownedUserId = userId;
    const ownedClockId = clockId;
    await run({
      appUrl: config.appUrl,
      userId,
      customerId,
      clockId,
      stripe,
      db,
      storageState: getStorageState(),
      async signInAgain(context) {
        await context.clearCookies();
        const login = await auth.auth.signInWithPassword({ email, password });
        if (login.error) throw new Error("Local fixture reauthentication failed.");
        await context.addCookies(getStorageState().cookies);
      },
      async paidStatus() {
        const result = await db.query<{ active: boolean; paidUntil: Date | null; status: string | null }>(
          `select coalesce(paid_premium_active,false) as active,paid_until as "paidUntil",status
           from public.billing_status where user_id=$1`,
          [ownedUserId],
        );
        return result.rows[0] ?? { active: false, paidUntil: null, status: null };
      },
      async advanceClock(frozenTime) {
        await stripe.testHelpers.testClocks.advance(ownedClockId, { frozen_time: frozenTime });
        await expect
          .poll(async () => (await stripe.testHelpers.testClocks.retrieve(ownedClockId)).status, {
            timeout: 90_000,
            intervals: [1000, 2000, 5000],
          })
          .toBe("ready");
      },
    });
  } catch (error) {
    failure = error;
  } finally {
    if (customerId) {
      try {
        for await (const session of stripe.checkout.sessions.list({ customer: customerId, limit: 100 })) {
          if (session.status === "open") await stripe.checkout.sessions.expire(session.id);
        }
      } catch {
        cleanupErrors.push("checkout_cleanup_failed");
      }
      try {
        for await (const sub of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
          if (!["canceled", "incomplete_expired"].includes(sub.status))
            await stripe.subscriptions.cancel(sub.id, { prorate: false, invoice_now: false });
        }
      } catch {
        cleanupErrors.push("subscription_cleanup_failed");
      }
    }
    if (clockId) {
      try {
        await stripe.testHelpers.testClocks.del(clockId);
      } catch {
        cleanupErrors.push("clock_cleanup_failed");
      }
    }
    try {
      if (userId) await db.query("delete from auth.users where id=$1 and email=$2", [userId, email]);
    } catch {
      cleanupErrors.push("local_user_cleanup_failed");
    } finally {
      await db.end();
    }
  }
  if (cleanupErrors.length) throw new Error(`Sandbox fixture cleanup needs attention: ${cleanupErrors.join(", ")}`);
  if (failure) throw failure instanceof Error ? failure : new Error("Sandbox fixture failed.");
}

export const test = base.extend<{ billing: SandboxOwner }>({
  billing: async ({ baseURL }, supplyFixture) => {
    const config = readConfig();
    if (baseURL !== config.appUrl)
      throw new Error("Playwright and billing must use the same local application origin.");
    await makeOwner(config, supplyFixture);
  },
  storageState: async ({ billing }, supplyFixture) => {
    await supplyFixture(billing.storageState);
  },
});
export { expect };

// Labels observed in the real Managed Payments Checkout accessibility snapshot.
export async function enterSandboxCard(page: Page, number: string) {
  await page.getByRole("textbox", { name: "Card number", exact: true }).fill(number);
  await page.getByRole("textbox", { name: "Expiration", exact: true }).fill("12/34");
  await page.getByRole("textbox", { name: "Credit or debit card CVC/CVV", exact: true }).fill("123");
  await page.getByRole("textbox", { name: "Cardholder name", exact: true }).fill("SafeSpace Sandbox Test");
  await page.getByRole("combobox", { name: "Country or region", exact: true }).selectOption("PL");
  const agentDisclosure = page.getByRole("checkbox", {
    name: "I am an AI agent acting on behalf of someone else",
    exact: true,
  });
  // Stripe positions this explicit agent disclosure outside the viewport.
  // Use the keyboard so the provider also receives its normal input events.
  if (!(await agentDisclosure.isChecked())) {
    await agentDisclosure.focus();
    await agentDisclosure.press("Space");
  }
  await expect(agentDisclosure).toBeChecked();
  if (process.env.BILLING_E2E_AGENT_INSTRUCTIONS_ACK !== "1") {
    throw new Error(
      "Review Stripe's disclosed-agent instructions before setting BILLING_E2E_AGENT_INSTRUCTIONS_ACK=1.",
    );
  }
  const agentInstructions = page.getByRole("checkbox", {
    name: "I am an AI agent and have followed the instructions above",
    exact: true,
  });
  if (!(await agentInstructions.isChecked())) {
    await agentInstructions.focus();
    await agentInstructions.press("Space");
  }
  await expect(agentInstructions).toBeChecked();
}
