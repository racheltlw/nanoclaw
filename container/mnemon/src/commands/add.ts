import type { Database } from 'bun:sqlite';
import { embed } from '../embeddings.js';

export interface AddOptions {
  category?: string;
  importance?: number;
  tags?: string;
  source?: string;
}

export async function cmdAdd(db: Database.Database, content: string, opts: AddOptions = {}): Promise<number> {
  const embedding = await embed(content);
  const now = Math.floor(Date.now() / 1000);
  const result = db
    .prepare(
      `INSERT INTO entries (content, category, importance, tags, source, embedding, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      content,
      opts.category ?? 'general',
      opts.importance ?? 5,
      opts.tags ?? null,
      opts.source ?? null,
      embedding,
      now,
      now,
    );
  return Number(result.lastInsertRowid);
}
