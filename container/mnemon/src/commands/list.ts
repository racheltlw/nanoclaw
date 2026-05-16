import type { Database } from 'bun:sqlite';
import type { EntryRow } from '../types.js';

export interface ListOptions {
  category?: string;
  limit?: number;
  since?: number;
  includeSuperseded?: boolean;
}

export function cmdList(db: Database.Database, opts: ListOptions = {}): EntryRow[] {
  const { category, limit = 20, since, includeSuperseded = false } = opts;

  let sql =
    'SELECT id, content, category, importance, tags, source, created_at, updated_at, superseded_by FROM entries WHERE 1=1';
  const params: (string | number)[] = [];

  if (!includeSuperseded) {
    sql += ' AND superseded_by IS NULL';
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (since !== undefined) {
    sql += ' AND created_at >= ?';
    params.push(since);
  }
  sql += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit);

  return db.prepare(sql).all(...params) as EntryRow[];
}

export function formatListPretty(entries: EntryRow[]): string {
  if (entries.length === 0) return '(empty)';
  return entries
    .map((e) => {
      const ts = new Date(e.created_at * 1000).toISOString().slice(0, 10);
      const meta = [e.tags ? `tags: ${e.tags}` : '', e.source ? `source: ${e.source}` : '']
        .filter(Boolean)
        .join(' | ');
      return `[${e.id}] ${e.category} / importance: ${e.importance} | ${ts}\n    ${e.content}${meta ? `\n    ${meta}` : ''}`;
    })
    .join('\n\n');
}
