import type { Database } from 'bun:sqlite';
import * as fs from 'fs';

export interface Stats {
  byCategory: Record<string, { active: number; superseded: number }>;
  totalActive: number;
  totalSuperseded: number;
  totalEmbeddings: number;
  dbSizeMb: number;
}

export function cmdStats(db: Database.Database): Stats {
  const categoryRows = db
    .prepare(
      `SELECT category,
              SUM(CASE WHEN superseded_by IS NULL THEN 1 ELSE 0 END) as active,
              SUM(CASE WHEN superseded_by IS NOT NULL THEN 1 ELSE 0 END) as superseded
       FROM entries GROUP BY category`,
    )
    .all() as { category: string; active: number; superseded: number }[];

  const byCategory: Record<string, { active: number; superseded: number }> = {};
  let totalActive = 0;
  let totalSuperseded = 0;
  for (const row of categoryRows) {
    byCategory[row.category] = { active: row.active, superseded: row.superseded };
    totalActive += row.active;
    totalSuperseded += row.superseded;
  }

  const totalEmbeddings = (
    db.prepare('SELECT COUNT(*) as c FROM entries').get() as { c: number }
  ).c;

  const dbPath = process.env.MNEMON_DB ?? './mnemon.db';
  let dbSizeMb = 0;
  try {
    dbSizeMb = Math.round((fs.statSync(dbPath).size / 1024 / 1024) * 100) / 100;
  } catch {
    // in-memory or path unavailable
  }

  return { byCategory, totalActive, totalSuperseded, totalEmbeddings, dbSizeMb };
}
