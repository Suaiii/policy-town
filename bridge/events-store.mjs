/**
 * bridge/events-store.mjs — SQLite 事件日志存储（node:sqlite，零依赖）
 *
 * 事件日志是唯一写入入口（append-only），图投影/SIM 状态投影都从它派生。
 * 存储层只负责持久化与按 step 读取；投影逻辑在 packages/events/src/index.ts。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isSandboxEventInput, projectGraph } from '../packages/events/src/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function openEventStore(dbFile) {
  const file = dbFile ?? process.env.EVENTS_DB ?? path.join(ROOT, 'bridge', 'data', 'events.db');
  if (file !== ':memory:') {
    mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      seq        INTEGER PRIMARY KEY AUTOINCREMENT,
      type       TEXT NOT NULL,
      actor      TEXT NOT NULL,
      target     TEXT NOT NULL,
      at         TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public',
      reveal_at  INTEGER,
      payload    TEXT NOT NULL DEFAULT '{}'
    );
  `);

  const rowToEvent = (row) => ({
    seq: row.seq,
    type: row.type,
    actor: row.actor,
    target: row.target,
    at: row.at,
    visibility: row.visibility,
    reveal_at: row.reveal_at,
    payload: JSON.parse(row.payload),
  });

  const select = db.prepare(
    'SELECT seq, type, actor, target, at, visibility, reveal_at, payload FROM events ORDER BY seq',
  );
  const selectUpTo = db.prepare(
    'SELECT seq, type, actor, target, at, visibility, reveal_at, payload FROM events WHERE seq <= ? ORDER BY seq',
  );
  const selectMax = db.prepare('SELECT COALESCE(MAX(seq), 0) AS max FROM events');
  const insert = db.prepare(
    'INSERT INTO events (type, actor, target, at, visibility, reveal_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );

  return {
    /** 校验并追加一条事件，返回带 seq 的完整事件。非法输入抛 TypeError。 */
    append(input) {
      if (!isSandboxEventInput(input)) {
        throw new TypeError(`非法事件输入: ${JSON.stringify(input)}`);
      }
      const result = insert.run(
        input.type,
        input.actor,
        input.target,
        input.at ?? '',
        input.visibility ?? 'public',
        input.reveal_at ?? null,
        JSON.stringify(input.payload ?? {}),
      );
      return { ...input, seq: Number(result.lastInsertRowid) };
    },

    /** 读取 seq <= step 的全部事件（升序）；step 缺省为最新。 */
    listUpTo(step) {
      const rows = step === undefined ? select.all() : selectUpTo.all(step);
      return rows.map(rowToEvent);
    },

    latestSeq() {
      return Number(selectMax.get().max);
    },

    /** 投影：events[0..step] → 图快照。 */
    graphAt(step, roster) {
      return projectGraph(this.listUpTo(step), roster);
    },

    close() {
      db.close();
    },
  };
}
