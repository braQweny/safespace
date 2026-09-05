import { Client } from "pg";
import { BillingError, type BillingConfig } from "./config";

// One connection per request: no cross-request sockets in workerd. A dedicated
// login inherits only safespace_billing, never postgres or service_role.
export async function withBillingDatabase<T>(config: BillingConfig, run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({
    connectionString: config.databaseUrl,
    connectionTimeoutMillis: 5_000,
    query_timeout: 20_000,
    statement_timeout: 15_000,
    application_name: "safespace-billing",
  });
  client.on("error", () => {
    /* Never log DB credentials or provider payloads. */
  });
  try {
    await client.connect();
    const result = await client.query<{ allowed: boolean }>(
      "select current_user = 'safespace_billing_login' and pg_has_role(current_user, 'safespace_billing', 'member') as allowed",
    );
    if (!result.rows[0]?.allowed) throw new BillingError("billing_unavailable");
    return await run(client);
  } finally {
    await client.end();
  }
}
export async function billingTransaction<T>(client: Client, userId: string, run: () => Promise<T>): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local lock_timeout = '5s'");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1::text, 712))", [userId]);
    const result = await run();
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  }
}
