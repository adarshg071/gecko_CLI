/**
 * SQLite cache using Node.js built-in node:sqlite (Node 22.5+ / Node 24).
 * No native compilation required.
 */
// @ts-ignore — node:sqlite types not yet in @types/node for all versions
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { GeckoEvent } from '../../../../packages/protocol/src/index.js';

// Module-level cache so we don't open multiple handles
const _dbs = new Map<string, DatabaseSync>();

export function getDb(geckoDir: string): DatabaseSync {
  const dbPath = path.join(geckoDir, 'cache.db');
  if (_dbs.has(dbPath)) return _dbs.get(dbPath)!;
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode = WAL`);
  db.exec(`PRAGMA foreign_keys = ON`);
  initSchema(db);
  _dbs.set(dbPath, db);
  return db;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL UNIQUE,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cursor (
      project_id TEXT PRIMARY KEY,
      last_sequence INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS claims (
      task_id TEXT PRIMARY KEY,
      claim_id TEXT NOT NULL,
      lease_expires_at TEXT NOT NULL,
      attempt_number INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      config TEXT NOT NULL
    );
  `);
}

export function upsertEvent(db: DatabaseSync, event: GeckoEvent): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO events (id, sequence, project_id, type, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(event.id, event.sequence, event.project_id, event.type, JSON.stringify(event.payload), event.created_at);
}

export function updateCursor(db: DatabaseSync, projectId: string, seq: number): void {
  db.prepare(`
    INSERT INTO cursor (project_id, last_sequence) VALUES (?, ?)
    ON CONFLICT(project_id) DO UPDATE SET last_sequence = excluded.last_sequence
  `).run(projectId, seq);
}

export function getCursor(db: DatabaseSync, projectId: string): number {
  const row = db.prepare('SELECT last_sequence FROM cursor WHERE project_id = ?').get(projectId) as { last_sequence: number } | undefined;
  return row?.last_sequence ?? 0;
}

export function getEvents(db: DatabaseSync, projectId: string): GeckoEvent[] {
  const rows = db.prepare('SELECT * FROM events WHERE project_id = ? ORDER BY sequence ASC').all(projectId) as Array<{
    id: string; sequence: number; project_id: string; type: string; payload: string; created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    sequence: r.sequence,
    project_id: r.project_id,
    type: r.type,
    payload: JSON.parse(r.payload) as Record<string, unknown>,
    created_at: r.created_at,
  }));
}

export function saveClaim(db: DatabaseSync, taskId: string, claimId: string, leaseExpiresAt: string, attempt: number): void {
  db.prepare(`
    INSERT INTO claims (task_id, claim_id, lease_expires_at, attempt_number) VALUES (?, ?, ?, ?)
    ON CONFLICT(task_id) DO UPDATE SET claim_id = excluded.claim_id, lease_expires_at = excluded.lease_expires_at, attempt_number = excluded.attempt_number
  `).run(taskId, claimId, leaseExpiresAt, attempt);
}

export function getClaim(db: DatabaseSync, taskId: string): { claim_id: string; lease_expires_at: string; attempt_number: number } | null {
  return (db.prepare('SELECT claim_id, lease_expires_at, attempt_number FROM claims WHERE task_id = ?').get(taskId) as { claim_id: string; lease_expires_at: string; attempt_number: number } | undefined) ?? null;
}

export function removeClaim(db: DatabaseSync, taskId: string): void {
  db.prepare('DELETE FROM claims WHERE task_id = ?').run(taskId);
}

export function saveProvider(db: DatabaseSync, config: object): void {
  const c = config as { id: string };
  db.prepare(`
    INSERT INTO providers (id, config) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET config = excluded.config
  `).run(c.id, JSON.stringify(config));
}

export function getProviders(db: DatabaseSync): object[] {
  const rows = db.prepare('SELECT config FROM providers').all() as Array<{ config: string }>;
  return rows.map((r) => JSON.parse(r.config) as object);
}

export function removeProvider(db: DatabaseSync, id: string): void {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id);
}
