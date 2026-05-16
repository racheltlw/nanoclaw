import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { Database } from 'bun:sqlite';
import { runMigrations, MIGRATIONS } from '../src/db.js';

let db: Database;

beforeEach(() => {
  db = new Database(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
});

afterEach(() => {
  db.close();
});

describe('migration runner', () => {
  it('creates all tables on a fresh DB', () => {
    runMigrations(db, MIGRATIONS);
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[]).map(r => r.name);
    expect(tables).toContain('entries');
    expect(tables).toContain('edges');
    expect(tables).toContain('meta');
  });

  it('sets schema_version to 1 after initial migration', () => {
    runMigrations(db, MIGRATIONS);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(row.value).toBe('1');
  });

  it('sets embedding_model and embedding_dims in meta', () => {
    runMigrations(db, MIGRATIONS);
    const model = db.prepare("SELECT value FROM meta WHERE key = 'embedding_model'").get() as { value: string };
    const dims = db.prepare("SELECT value FROM meta WHERE key = 'embedding_dims'").get() as { value: string };
    expect(model.value).toBe('nomic-embed-text');
    expect(dims.value).toBe('768');
  });

  it('is idempotent — running twice leaves schema_version at 1', () => {
    runMigrations(db, MIGRATIONS);
    runMigrations(db, MIGRATIONS);
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(row.value).toBe('1');
  });

  it('applies a no-op second migration and bumps schema_version to 2', () => {
    const withV2 = [
      ...MIGRATIONS,
      { version: 2, sql: "INSERT OR REPLACE INTO meta VALUES ('v2_marker', 'applied')" },
    ];
    runMigrations(db, withV2);

    const sv = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(sv.value).toBe('2');

    const marker = db.prepare("SELECT value FROM meta WHERE key = 'v2_marker'").get() as { value: string };
    expect(marker.value).toBe('applied');
  });

  it('skips migrations already applied', () => {
    runMigrations(db, MIGRATIONS);

    const withV2 = [
      ...MIGRATIONS,
      { version: 2, sql: "INSERT OR REPLACE INTO meta VALUES ('v2_count', '1')" },
    ];
    runMigrations(db, withV2);
    runMigrations(db, withV2);

    const sv = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(sv.value).toBe('2');
  });

  it('applies migrations out-of-order input in version order', () => {
    const shuffled = [
      { version: 2, sql: "INSERT OR REPLACE INTO meta VALUES ('step2', 'done')" },
      ...MIGRATIONS, // version 1
    ];
    runMigrations(db, shuffled);
    const sv = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
    expect(sv.value).toBe('2');
  });
});
