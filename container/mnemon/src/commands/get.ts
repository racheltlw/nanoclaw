import type { Database } from 'bun:sqlite';
import type { EntryRow } from '../types.js';

export function cmdGet(db: Database.Database, id: number): EntryRow | null {
  const row = db
    .prepare(
      'SELECT id, content, category, importance, tags, source, created_at, updated_at, superseded_by FROM entries WHERE id = ?',
    )
    .get(id) as EntryRow | undefined;
  return row ?? null;
}
