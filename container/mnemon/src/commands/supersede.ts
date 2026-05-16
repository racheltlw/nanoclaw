import type { Database } from 'bun:sqlite';
import { embed } from '../embeddings.js';
import type { Entry } from '../types.js';

export interface SupersedeOptions {
  category?: string;
  importance?: number;
  tags?: string;
  source?: string;
}

type OldRow = Pick<Entry, 'id' | 'category' | 'importance' | 'tags' | 'source'>;

export async function cmdSupersede(
  db: Database.Database,
  oldId: number,
  newContent: string,
  opts: SupersedeOptions = {},
): Promise<number> {
  const old = db
    .prepare('SELECT id, category, importance, tags, source FROM entries WHERE id = ?')
    .get(oldId) as OldRow | undefined;

  if (!old) throw new Error(`Entry ${oldId} not found`);

  const embedding = await embed(newContent);
  const now = Math.floor(Date.now() / 1000);

  let newId!: number;
  db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO entries (content, category, importance, tags, source, embedding, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newContent,
        opts.category ?? old.category,
        opts.importance ?? old.importance,
        opts.tags ?? old.tags,
        opts.source ?? old.source,
        embedding,
        now,
        now,
      );
    newId = Number(result.lastInsertRowid);
    db.prepare('UPDATE entries SET superseded_by = ? WHERE id = ?').run(newId, oldId);
  })();

  return newId;
}
