import { isVoiceCloseReason, type VoiceObserverState } from "./observer-state";

/**
 * Trwały bufor obserwatora: stan i wypowiedzi czekające na zrzut do bazy.
 * SQLite Durable Object jest źródłem prawdy (eviction gubi pamięć, nie
 * bufor); atrapa w pamięci służy testom. Treść wypowiedzi istnieje tu tylko
 * do zrzutu i krótkiego kontekstu klasyfikatora, a `deleteAll` czyści wszystko
 * przy usunięciu rozmowy albo po terminie retencji.
 */
export interface StoredVoiceUtterance {
  ordinal: number;
  utteranceId: string;
  role: "user" | "assistant";
  content: string;
  createdAtMs: number;
}

export interface VoiceObserverStore {
  loadState(): VoiceObserverState | null;
  saveState(state: VoiceObserverState): void;
  insertUtterance(row: Omit<StoredVoiceUtterance, "ordinal">): StoredVoiceUtterance;
  /** Niezrzucone wypowiedzi w kolejności zamknięcia. */
  listPending(limit: number): StoredVoiceUtterance[];
  /** Potwierdzenie zapisu w bazie: wiersze znikają, poza krótkim ogonem kontekstu. */
  markDrained(ordinals: readonly number[]): void;
  /** Ostatnie wypowiedzi użytkownika (najnowsza ostatnia) jako kontekst klasyfikatora. */
  listRecentUserTexts(limit: number): string[];
  pendingCount(): number;
  deleteAll(): void;
}

export interface SqlStorageLike {
  exec(query: string, ...bindings: unknown[]): { toArray(): Record<string, unknown>[] };
}

/** Ile zrzuconych wierszy zostaje jako kontekst dla klasyfikatora. */
const DRAINED_TAIL = 8;

export function initializeVoiceObserverSchema(sql: SqlStorageLike) {
  sql.exec(`create table if not exists observer_state (key text primary key, value text not null)`);
  sql.exec(
    `create table if not exists utterances (
      ordinal integer primary key autoincrement,
      utterance_id text not null unique,
      role text not null,
      content text not null,
      created_at integer not null,
      drained integer not null default 0
    )`,
  );
}

function isStoredState(value: unknown): value is VoiceObserverState {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as VoiceObserverState).epoch === "number" &&
    ((value as VoiceObserverState).closeReason === null ||
      isVoiceCloseReason((value as VoiceObserverState).closeReason))
  );
}

function toStoredUtterance(row: Record<string, unknown>): StoredVoiceUtterance | null {
  if (
    typeof row.ordinal !== "number" ||
    typeof row.utterance_id !== "string" ||
    (row.role !== "user" && row.role !== "assistant") ||
    typeof row.content !== "string" ||
    typeof row.created_at !== "number"
  ) {
    return null;
  }

  return {
    ordinal: row.ordinal,
    utteranceId: row.utterance_id,
    role: row.role,
    content: row.content,
    createdAtMs: row.created_at,
  };
}

export function createSqlVoiceObserverStore(sql: SqlStorageLike): VoiceObserverStore {
  return {
    loadState() {
      const row = sql.exec(`select value from observer_state where key = 'state'`).toArray().at(0);

      if (!row || typeof row.value !== "string") {
        return null;
      }

      try {
        const parsed: unknown = JSON.parse(row.value);
        return isStoredState(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },
    saveState(state) {
      sql.exec(
        `insert into observer_state (key, value) values ('state', ?)
         on conflict(key) do update set value = excluded.value`,
        JSON.stringify(state),
      );
    },
    insertUtterance(row) {
      const inserted = sql
        .exec(
          `insert into utterances (utterance_id, role, content, created_at) values (?, ?, ?, ?) returning *`,
          row.utteranceId,
          row.role,
          row.content,
          row.createdAtMs,
        )
        .toArray()
        .at(0);
      const stored = inserted ? toStoredUtterance(inserted) : null;

      if (!stored) {
        throw new Error("voice_observer_store_insert_failed");
      }

      return stored;
    },
    listPending(limit) {
      return sql
        .exec(`select * from utterances where drained = 0 order by ordinal asc limit ?`, Math.max(1, limit))
        .toArray()
        .map(toStoredUtterance)
        .filter((row): row is StoredVoiceUtterance => row !== null);
    },
    markDrained(ordinals) {
      for (const ordinal of ordinals) {
        sql.exec(`update utterances set drained = 1 where ordinal = ?`, ordinal);
      }

      const tail = sql.exec(`select max(ordinal) as max_ordinal from utterances`).toArray().at(0);
      const maxOrdinal = tail && typeof tail.max_ordinal === "number" ? tail.max_ordinal : 0;
      sql.exec(`delete from utterances where drained = 1 and ordinal <= ?`, maxOrdinal - DRAINED_TAIL);
    },
    listRecentUserTexts(limit) {
      return sql
        .exec(`select content from utterances where role = 'user' order by ordinal desc limit ?`, Math.max(0, limit))
        .toArray()
        .map((row) => (typeof row.content === "string" ? row.content : ""))
        .filter((content) => content.length > 0)
        .reverse();
    },
    pendingCount() {
      const row = sql.exec(`select count(*) as n from utterances where drained = 0`).toArray().at(0);
      return row && typeof row.n === "number" ? row.n : 0;
    },
    deleteAll() {
      sql.exec(`delete from utterances`);
      sql.exec(`delete from observer_state`);
    },
  };
}

/** Atrapa w pamięci o tej samej semantyce (testy rdzenia obserwatora). */
export function createMemoryVoiceObserverStore(): VoiceObserverStore & {
  rows: StoredVoiceUtterance[];
  drained: Set<number>;
} {
  let state: VoiceObserverState | null = null;
  let nextOrdinal = 1;
  const rows: StoredVoiceUtterance[] = [];
  const drained = new Set<number>();

  return {
    rows,
    drained,
    loadState: () => state,
    saveState(next) {
      state = structuredClone(next);
    },
    insertUtterance(row) {
      if (rows.some((existing) => existing.utteranceId === row.utteranceId)) {
        throw new Error("voice_observer_store_insert_failed");
      }

      const stored = { ...row, ordinal: nextOrdinal };
      nextOrdinal += 1;
      rows.push(stored);
      return stored;
    },
    listPending: (limit) => rows.filter((row) => !drained.has(row.ordinal)).slice(0, Math.max(1, limit)),
    markDrained(ordinals) {
      for (const ordinal of ordinals) {
        drained.add(ordinal);
      }

      const maxOrdinal = rows.length === 0 ? 0 : rows[rows.length - 1].ordinal;

      for (const row of [...rows]) {
        if (drained.has(row.ordinal) && row.ordinal <= maxOrdinal - DRAINED_TAIL) {
          rows.splice(rows.indexOf(row), 1);
          drained.delete(row.ordinal);
        }
      }
    },
    listRecentUserTexts: (limit) =>
      rows
        .filter((row) => row.role === "user")
        .slice(-Math.max(0, limit))
        .map((row) => row.content),
    pendingCount: () => rows.filter((row) => !drained.has(row.ordinal)).length,
    deleteAll() {
      rows.splice(0, rows.length);
      drained.clear();
      state = null;
    },
  };
}
