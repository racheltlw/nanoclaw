import type Database from 'better-sqlite3';

import type { Migration } from './index.js';

export const migration014: Migration = {
  version: 14,
  name: 'contacts',
  up(db: Database.Database) {
    db.exec(`
      CREATE TABLE contacts (
        id           TEXT PRIMARY KEY,
        phone_e164   TEXT NOT NULL,
        lid          TEXT,
        display_name TEXT NOT NULL,
        team         TEXT,
        status       TEXT NOT NULL DEFAULT 'active',
        created_at   TEXT NOT NULL,
        added_by     TEXT
      );
      CREATE UNIQUE INDEX idx_contacts_phone ON contacts(phone_e164);
      CREATE INDEX idx_contacts_lid ON contacts(lid) WHERE lid IS NOT NULL;
    `);
  },
};
