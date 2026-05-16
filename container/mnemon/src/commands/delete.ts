import type { Database } from 'bun:sqlite';

export function cmdDelete(db: Database.Database, id: number): void {
  const ref = db.prepare('SELECT id FROM entries WHERE superseded_by = ?').get(id) as
    | { id: number }
    | undefined;
  if (ref) {
    throw new Error(
      `Entry ${id} is referenced by entry ${ref.id} via superseded_by — delete that entry first`,
    );
  }
  const result = db.prepare('DELETE FROM entries WHERE id = ?').run(id);
  if (result.changes === 0) throw new Error(`Entry ${id} not found`);
}
