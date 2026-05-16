import { Database } from 'bun:sqlite';
import migration001 from './migrations/001_initial.sql' with { type: 'text' };
import migration002 from './migrations/002_provenance.sql' with { type: 'text' };

export const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
];

export function openDb(dbPath?: string): Database {
  const p = dbPath ?? process.env.MNEMON_DB ?? './mnemon.db';
  const db = new Database(p);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  runMigrations(db);
  return db;
}

export function runMigrations(
  db: Database,
  migrations: { version: number; sql: string }[] = MIGRATIONS,
): void {
  let version = 0;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as
      | { value: string }
      | undefined;
    version = row ? parseInt(row.value, 10) : 0;
  } catch {
    version = 0;
  }

  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  for (const m of sorted) {
    if (m.version <= version) continue;
    db.exec(m.sql);
    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run('schema_version', String(m.version));
    version = m.version;
  }
}
