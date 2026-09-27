import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDb, upsertEvent, updateCursor, getCursor, getEvents } from '../src/core/db.ts';
import { GeckoEvent } from '../../packages/protocol/src/index.ts';

describe('Duplicate event handling', () => {
  let tmpDir: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'gecko-events-'));
    db = getDb(tmpDir);
  });

  afterEach(() => {
    try { db?.close?.(); } catch { /* ignore */ }
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeEvent = (seq: number): GeckoEvent => ({
    id: `event-${seq}`,
    sequence: seq,
    project_id: 'proj-1',
    type: 'task.claimed',
    payload: { task_id: 'TASK-001' },
    created_at: new Date().toISOString(),
  });

  it('stores a single event', () => {
    upsertEvent(db, makeEvent(1));
    expect(getEvents(db, 'proj-1')).toHaveLength(1);
  });

  it('ignores duplicate events by id', () => {
    const e = makeEvent(1);
    upsertEvent(db, e);
    upsertEvent(db, e); // duplicate
    expect(getEvents(db, 'proj-1')).toHaveLength(1);
  });

  it('stores events in sequence order', () => {
    upsertEvent(db, makeEvent(3));
    upsertEvent(db, makeEvent(1));
    upsertEvent(db, makeEvent(2));
    const events = getEvents(db, 'proj-1');
    expect(events.map((e) => e.sequence)).toEqual([1, 2, 3]);
  });

  it('tracks cursor correctly', () => {
    expect(getCursor(db, 'proj-1')).toBe(0);
    updateCursor(db, 'proj-1', 5);
    expect(getCursor(db, 'proj-1')).toBe(5);
    updateCursor(db, 'proj-1', 10);
    expect(getCursor(db, 'proj-1')).toBe(10);
  });
});
