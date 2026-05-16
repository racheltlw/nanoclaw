import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { cmdAdd } from '../src/commands/add.js';
import { cmdQuery } from '../src/commands/query.js';
import { startMockOllama, makeTempDb, type MockServer } from './setup.js';
import type { Database } from 'bun:sqlite';

let mock: MockServer;
let db: Database.Database;
let cleanup: () => void;

beforeAll(() => {
  mock = startMockOllama();
  process.env.OLLAMA_URL = `http://localhost:${mock.port}`;
});
afterAll(() => mock.stop());

beforeEach(() => {
  const tmp = makeTempDb();
  db = tmp.db;
  cleanup = tmp.cleanup;
});
afterEach(() => cleanup());

describe('add + query round-trip', () => {
  it('add returns a positive integer id', async () => {
    const id = await cmdAdd(db, 'TypeScript is a typed superset of JavaScript', { category: 'tech' });
    expect(id).toBeGreaterThan(0);
  });

  it('query returns added entries with required fields', async () => {
    await cmdAdd(db, 'The Eiffel Tower is in Paris', { category: 'geography', importance: 6 });
    await cmdAdd(db, 'Bun is a fast JavaScript runtime', { category: 'tech', importance: 7 });

    const results = await cmdQuery(db, 'programming', { limit: 10 });
    expect(results.length).toBe(2);
    for (const r of results) {
      expect(typeof r.id).toBe('number');
      expect(typeof r.content).toBe('string');
      expect(typeof r.category).toBe('string');
      expect(typeof r.importance).toBe('number');
      expect(typeof r.score).toBe('number');
      expect(typeof r.final_rank).toBe('number');
      expect(r.created_at).toBeGreaterThan(0);
    }
  });

  it('results are sorted by final_rank descending', async () => {
    await cmdAdd(db, 'low importance entry', { importance: 1 });
    await cmdAdd(db, 'high importance entry', { importance: 10 });
    const results = await cmdQuery(db, 'entry', { limit: 10 });
    expect(results.length).toBe(2);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.final_rank).toBeGreaterThanOrEqual(results[i]!.final_rank);
    }
  });

  it('final_rank equals score * (importance / 5) rounded to 3dp', async () => {
    await cmdAdd(db, 'test entry', { importance: 7 });
    const results = await cmdQuery(db, 'test', { limit: 1 });
    const r = results[0]!;
    const expected = Math.round(r.score * (r.importance / 5) * 1000) / 1000;
    expect(r.final_rank).toBeCloseTo(expected, 3);
  });

  it('category filter excludes other categories', async () => {
    await cmdAdd(db, 'Paris facts', { category: 'geography' });
    await cmdAdd(db, 'TypeScript facts', { category: 'tech' });
    const results = await cmdQuery(db, 'facts', { category: 'tech' });
    expect(results.every((r) => r.category === 'tech')).toBe(true);
  });

  it('limit caps the result count', async () => {
    for (let i = 0; i < 6; i++) await cmdAdd(db, `Entry ${i}`, {});
    const results = await cmdQuery(db, 'entry', { limit: 3 });
    expect(results.length).toBe(3);
  });

  it('min-importance filter excludes low-importance entries', async () => {
    await cmdAdd(db, 'low', { importance: 2 });
    await cmdAdd(db, 'high', { importance: 8 });
    const results = await cmdQuery(db, 'entry', { minImportance: 5 });
    expect(results.every((r) => r.importance >= 5)).toBe(true);
  });

  it('excludes superseded entries by default', async () => {
    const id = await cmdAdd(db, 'original', {});
    // Manually supersede by setting superseded_by
    const newId = await cmdAdd(db, 'replacement', {});
    db.prepare('UPDATE entries SET superseded_by = ? WHERE id = ?').run(newId, id);

    const results = await cmdQuery(db, 'entry', { limit: 10 });
    expect(results.find((r) => r.id === id)).toBeUndefined();
  });

  it('includes superseded when includeSuperseded=true', async () => {
    const id = await cmdAdd(db, 'original', {});
    const newId = await cmdAdd(db, 'replacement', {});
    db.prepare('UPDATE entries SET superseded_by = ? WHERE id = ?').run(newId, id);

    const results = await cmdQuery(db, 'entry', { limit: 10, includeSuperseded: true });
    expect(results.find((r) => r.id === id)).toBeDefined();
  });
});
