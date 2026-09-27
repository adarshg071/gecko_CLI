/**
 * Vitest setup: mock node:sqlite so it uses a real in-memory SQLite via sql.js
 * for tests. In production, node:sqlite (built-in to Node 22.5+) is used directly.
 *
 * Since Vite-node cannot resolve 'node:sqlite', we intercept it here.
 */
import { vi } from 'vitest';

// We implement a minimal in-memory SQLite backed by a Map, sufficient for tests.
// This avoids any native module compilation.

class MockStatement {
  private readonly fn: (args: unknown[]) => unknown;
  constructor(fn: (args: unknown[]) => unknown) { this.fn = fn; }
  run(...args: unknown[]) { return this.fn(args); }
  get(...args: unknown[]) { return this.fn(args); }
  all(...args: unknown[]) { return this.fn(args); }
}

class MockDatabaseSync {
  private tables: Map<string, object[]> = new Map();
  private _initialized = false;

  exec(_sql: string): void {
    // Parse CREATE TABLE statements to initialise table storage
    const matches = _sql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g);
    for (const m of matches) {
      const name = m[1];
      if (name && !this.tables.has(name)) this.tables.set(name, []);
    }
  }

  prepare(sql: string): MockStatement {
    const self = this;
    const sqlU = sql.trim().toUpperCase();

    if (sqlU.startsWith('INSERT OR IGNORE INTO EVENTS')) {
      return new MockStatement(([id, seq, proj, type, payload, created]) => {
        const table = self.tables.get('events') ?? [];
        const exists = table.some((r) => (r as Record<string, unknown>)['id'] === id);
        if (!exists) table.push({ id, sequence: seq, project_id: proj, type, payload, created_at: created });
        self.tables.set('events', table);
      });
    }

    if (sqlU.startsWith('INSERT INTO CURSOR') || sqlU.includes('ON CONFLICT(PROJECT_ID)')) {
      return new MockStatement(([proj, seq]) => {
        const table = self.tables.get('cursor') ?? [];
        const idx = table.findIndex((r) => (r as Record<string, unknown>)['project_id'] === proj);
        if (idx >= 0) (table[idx] as Record<string, unknown>)['last_sequence'] = seq;
        else table.push({ project_id: proj, last_sequence: seq });
        self.tables.set('cursor', table);
      });
    }

    if (sqlU.startsWith('SELECT LAST_SEQUENCE FROM CURSOR')) {
      return new MockStatement(([proj]) => {
        return (self.tables.get('cursor') ?? []).find((r) => (r as Record<string, unknown>)['project_id'] === proj);
      });
    }

    if (sqlU.startsWith('SELECT * FROM EVENTS')) {
      return new MockStatement(([proj]) => {
        return [...(self.tables.get('events') ?? [])
          .filter((r) => (r as Record<string, unknown>)['project_id'] === proj)]
          .sort((a, b) => ((a as Record<string, unknown>)['sequence'] as number) - ((b as Record<string, unknown>)['sequence'] as number));
      });
    }

    if (sqlU.startsWith('INSERT INTO CLAIMS') || sqlU.includes('ON CONFLICT(TASK_ID)')) {
      return new MockStatement(([taskId, claimId, leaseExpiresAt, attempt]) => {
        const table = self.tables.get('claims') ?? [];
        const idx = table.findIndex((r) => (r as Record<string, unknown>)['task_id'] === taskId);
        const entry = { task_id: taskId, claim_id: claimId, lease_expires_at: leaseExpiresAt, attempt_number: attempt };
        if (idx >= 0) table[idx] = entry;
        else table.push(entry);
        self.tables.set('claims', table);
      });
    }

    if (sqlU.startsWith('DELETE FROM CLAIMS')) {
      return new MockStatement(([taskId]) => {
        const table = (self.tables.get('claims') ?? []).filter((r) => (r as Record<string, unknown>)['task_id'] !== taskId);
        self.tables.set('claims', table);
      });
    }

    if (sqlU.includes('INSERT INTO PROVIDERS') || sqlU.includes('ON CONFLICT(ID)')) {
      return new MockStatement(([id, config]) => {
        const table = self.tables.get('providers') ?? [];
        const idx = table.findIndex((r) => (r as Record<string, unknown>)['id'] === id);
        const entry = { id, config };
        if (idx >= 0) table[idx] = entry;
        else table.push(entry);
        self.tables.set('providers', table);
      });
    }

    if (sqlU.startsWith('SELECT CONFIG FROM PROVIDERS')) {
      return new MockStatement(() => self.tables.get('providers') ?? []);
    }

    if (sqlU.startsWith('DELETE FROM PROVIDERS')) {
      return new MockStatement(([id]) => {
        const table = (self.tables.get('providers') ?? []).filter((r) => (r as Record<string, unknown>)['id'] !== id);
        self.tables.set('providers', table);
      });
    }

    // No-op fallback
    return new MockStatement(() => undefined);
  }

  close(): void {
    this.tables.clear();
  }
}

vi.mock('node:sqlite', () => ({
  DatabaseSync: MockDatabaseSync,
}));
