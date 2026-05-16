import type { Database } from 'bun:sqlite';
import { embed } from '../embeddings.js';
import type { Entry } from '../types.js';

export interface UpdateOptions {
  content?: string;
  importance?: number;
  tags?: string;
  addTags?: string;
  removeTags?: string;
}

type UpdateRow = Pick<Entry, 'id' | 'content' | 'tags' | 'embedding'>;

export async function cmdUpdate(db: Database.Database, id: number, opts: UpdateOptions): Promise<void> {
  const row = db
    .prepare('SELECT id, content, tags, embedding FROM entries WHERE id = ?')
    .get(id) as UpdateRow | undefined;

  if (!row) throw new Error(`Entry ${id} not found`);

  const now = Math.floor(Date.now() / 1000);
  const newContent = opts.content ?? row.content;

  let newEmbedding: Buffer = row.embedding as Buffer;
  if (opts.content !== undefined && opts.content !== row.content) {
    newEmbedding = await embed(opts.content);
  }

  let tags: string | null;
  if (opts.tags !== undefined) {
    tags = opts.tags || null;
  } else {
    const tagSet = new Set(
      (row.tags ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    );
    for (const t of (opts.addTags ?? '').split(',').map((t) => t.trim()).filter(Boolean)) tagSet.add(t);
    for (const t of (opts.removeTags ?? '').split(',').map((t) => t.trim()).filter(Boolean)) tagSet.delete(t);
    const joined = [...tagSet].join(',');
    tags = joined || null;
  }

  if (opts.importance !== undefined) {
    db.prepare(
      'UPDATE entries SET content = ?, embedding = ?, tags = ?, importance = ?, updated_at = ? WHERE id = ?',
    ).run(newContent, newEmbedding, tags, opts.importance, now, id);
  } else {
    db.prepare('UPDATE entries SET content = ?, embedding = ?, tags = ?, updated_at = ? WHERE id = ?').run(
      newContent,
      newEmbedding,
      tags,
      now,
      id,
    );
  }
}
