import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { URL } from "node:url";
import pg from "pg";

const exec = promisify(execFile);

/** A disposable PostgreSQL, never a URL or credentials from the user's env. */
export async function startDatabase() {
  const name = `safespace-db-test-${randomUUID()}`;
  const password = randomUUID();
  const clients = new Set();
  const stop = async () => {
    await Promise.allSettled([...clients].map((client) => client.end()));
    await exec("docker", ["rm", "--force", name]);
  };
  await exec("docker", [
    "run",
    "--detach",
    "--rm",
    "--name",
    name,
    "--publish",
    "127.0.0.1::5432",
    "--env",
    `POSTGRES_PASSWORD=${password}`,
    "postgres:17-alpine",
  ]);
  try {
    const { stdout } = await exec("docker", ["port", name, "5432/tcp"]);
    const port = Number(stdout.trim().split(":").at(-1));
    const connect = async () => {
      const client = new pg.Client({
        host: "127.0.0.1",
        port,
        user: "postgres",
        password,
        database: "postgres",
        connectionTimeoutMillis: 2_000,
      });
      try {
        await client.connect();
      } catch (error) {
        await client.end();
        throw error;
      }
      clients.add(client);
      return client;
    };
    let admin;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        admin = await connect();
        break;
      } catch {
        await delay(100);
      }
    }
    if (!admin) throw new Error("Disposable PostgreSQL did not become ready");
    // Minimal Supabase Auth contract, real PostgreSQL roles/RLS/triggers.
    // No GoTrue HTTP authentication is simulated by these database tests.
    await admin.query(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create schema extensions;
      create table auth.users(id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth, extensions to anon, authenticated, service_role;
      alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
      alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    `);
    const migrations = new URL("../../supabase/migrations/", import.meta.url);
    for (const file of (await readdir(migrations)).filter((file) => file.endsWith(".sql")).sort()) {
      await admin.query(await readFile(new URL(file, migrations), "utf8"));
    }
    return {
      admin,
      stop,
      async billing() {
        const client = await connect();
        await client.query("set role safespace_billing");
        return client;
      },
      async owner(userId = randomUUID()) {
        await admin.query("insert into auth.users(id, email) values ($1, $2) on conflict do nothing", [
          userId,
          `${userId}@example.test`,
        ]);
        const client = await connect();
        await client.query("set role authenticated");
        await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
        return { client, userId };
      },
      async waitForLock(client) {
        const until = Date.now() + 5_000;
        while (Date.now() < until) {
          const { rows } = await admin.query("select wait_event_type from pg_stat_activity where pid = $1", [
            client.processID,
          ]);
          if (rows[0]?.wait_event_type === "Lock") return;
          await delay(10);
        }
        throw new Error("Expected the concurrent query to wait on a database lock");
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

export async function activeSession(owner, { mode = "text", bucket = 900 } = {}) {
  const { rows } = await owner.client.query(
    `insert into public.therapy_sessions
    (user_id, modality_id, avatar_id, duration_bucket_seconds, mode)
    values ($1, 'cbt', 'cbt-guide', $2, $3) returning id`,
    [owner.userId, bucket, mode],
  );
  const id = rows[0].id;
  await owner.client.query(
    `update public.therapy_sessions set status = 'active',
    started_at = clock_timestamp(), expires_at = clock_timestamp() + make_interval(secs => $2) where id = $1`,
    [id, bucket],
  );
  return id;
}

export async function claim(client, sessionId, clientMessageId, message = "Testowa wiadomość") {
  const { rows } = await client.query("select public.claim_session_message_turn($1, $2, $3) as result", [
    sessionId,
    clientMessageId,
    message,
  ]);
  return rows[0].result;
}

export async function complete(client, sessionId, clientMessageId, attemptId, message = "Testowa wiadomość") {
  const { rows } = await client.query(
    "select public.complete_session_message_turn($1, $2, $3, $4, $5, 'success') as result",
    [sessionId, clientMessageId, attemptId, message, "Testowa odpowiedź"],
  );
  return rows[0].result;
}
