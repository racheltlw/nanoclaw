import type { Database } from 'bun:sqlite';
import { embed, cosineSimilarity } from '../embeddings.js';
import type { QueryResult } from '../types.js';

export interface QueryOptions {
  limit?: number;
  category?: string;
  minImportance?: number;
  includeSuperseded?: boolean;
}

interface CandidateRow {
  id: number;
  content: string;
  category: string;
  importance: number;
  tags: string | null;
  source: string | null;
  embedding: Buffer;
  created_at: number;
}

export async function cmdQuery(
  db: Database.Database,
  text: string,
  opts: QueryOptions = {},
): Promise<QueryResult[]> {
  const queryEmbedding = await embed(text);
  const { limit = 8, category, minImportance, includeSuperseded = false } = opts;

  let sql =
    'SELECT id, content, category, importance, tags, source, embedding, created_at FROM entries WHERE 1=1';
  const params: (string | number)[] = [];

  if (!includeSuperseded) {
    sql += ' AND superseded_by IS NULL';
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  if (minImportance !== undefined) {
    sql += ' AND importance >= ?';
    params.push(minImportance);
  }

  const rows = db.prepare(sql).all(...params) as CandidateRow[];

  const results: QueryResult[] = rows.map((row) => {
    const score = cosineSimilarity(queryEmbedding, row.embedding);
    const finalRank = score * (row.importance / 5);
    return {
      id: row.id,
      content: row.content,
      category: row.category,
      importance: row.importance,
      tags: row.tags,
      source: row.source,
      created_at: row.created_at,
      score: Math.round(score * 1000) / 1000,
      final_rank: Math.round(finalRank * 1000) / 1000,
    };
  });

  results.sort((a, b) => b.final_rank - a.final_rank);
  return results.slice(0, limit);
}

export function formatQueryPretty(results: QueryResult[]): string {
  if (results.length === 0) return '(no results)';
  return results
    .map((r, i) => {
      const ts = new Date(r.created_at * 1000).toISOString().slice(0, 10);
      const meta = [r.tags ? `tags: ${r.tags}` : '', r.source ? `source: ${r.source}` : '', ts]
        .filter(Boolean)
        .join(' | ');
      return `[${i + 1}] ${r.category} / importance: ${r.importance} | score: ${r.score} | rank: ${r.final_rank}\n    ${r.content}\n    ${meta}`;
    })
    .join('\n\n');
}
