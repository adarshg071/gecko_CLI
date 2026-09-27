import fs from 'fs';
import {
  GeckoEvent,
  EventsResponseSchema,
} from '../../../../packages/protocol/src/index.js';
import { GeckoApiClient } from '../core/api.js';
import { upsertEvent, updateCursor, getCursor, getEvents } from '../core/db.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pullEvents(
  db: any,
  client: GeckoApiClient,
  projectId: string,
): Promise<GeckoEvent[]> {
  const cursor = getCursor(db, projectId);
  const raw = await client.pullEvents(projectId, cursor);
  const parsed = EventsResponseSchema.parse(raw);

  for (const event of parsed.events) {
    upsertEvent(db, event);
  }
  if (parsed.events.length > 0) {
    updateCursor(db, projectId, parsed.last_sequence);
  }
  return parsed.events;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function materializeJsonl(db: any, projectId: string, outputPath: string): void {
  const events = getEvents(db, projectId);
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  fs.writeFileSync(outputPath, lines + (lines ? '\n' : ''), 'utf8');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function materializeMarkdown(db: any, projectId: string, outputPath: string): void {
  const events = getEvents(db, projectId);
  const lines: string[] = ['# Gecko Event Log\n'];
  for (const e of events) {
    lines.push(`## [${e.sequence}] ${e.type} — ${e.created_at}`);
    lines.push('```json');
    lines.push(JSON.stringify(e.payload, null, 2));
    lines.push('```\n');
  }
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf8');
}
