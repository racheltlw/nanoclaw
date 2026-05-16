import type { Database } from 'bun:sqlite';

export function cmdEdgeAdd(db: Database.Database, fromId: number, toId: number, relation: string): void {
  db.prepare('INSERT INTO edges (from_id, to_id, relation, created_at) VALUES (?, ?, ?, ?)').run(
    fromId,
    toId,
    relation,
    Math.floor(Date.now() / 1000),
  );
}

export interface EdgeWithContent {
  from_id: number;
  to_id: number;
  relation: string;
  created_at: number;
  direction: 'from' | 'to';
  other_id: number;
  other_content: string;
}

export function cmdEdgeList(db: Database.Database, id: number): EdgeWithContent[] {
  return db
    .prepare(
      `SELECT e.from_id, e.to_id, e.relation, e.created_at,
              'from' as direction, ent.id as other_id, ent.content as other_content
       FROM edges e JOIN entries ent ON ent.id = e.to_id WHERE e.from_id = ?
       UNION ALL
       SELECT e.from_id, e.to_id, e.relation, e.created_at,
              'to' as direction, ent.id as other_id, ent.content as other_content
       FROM edges e JOIN entries ent ON ent.id = e.from_id WHERE e.to_id = ?`,
    )
    .all(id, id) as EdgeWithContent[];
}
