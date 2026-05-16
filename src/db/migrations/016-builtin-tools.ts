import type Database from 'better-sqlite3';
import type { Migration } from './index.js';

export const migration016: Migration = {
  version: 16,
  name: 'builtin-tools',
  up(db: Database.Database) {
    db.prepare(`ALTER TABLE container_configs ADD COLUMN builtin_tools TEXT NOT NULL DEFAULT '"all"'`).run();
  },
};
