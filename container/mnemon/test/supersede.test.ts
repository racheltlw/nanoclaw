import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'bun:test';
import { cmdAdd } from '../src/commands/add.js';
import { cmdSupersede } from '../src/commands/supersede.js';
import { cmdGet } from '../src/commands/get.js';
import { cmdList } from '../src/commands/list.js';
import { startMockOllama, makeTempDb, type MockServer } from './setup.js';
import type { Database } from 'bun:sqlite';

let mock: MockServer;
let db: Database.Database;
let cleanup: () => void;

beforeAll(() => {
  mock = startMockOllama({ valueFn: (_p, i) => { const e = new Array(768).fill(0); e[i % 768] = 1; return e; } });
  process.env.OLLAMA_URL = `http://localhost:${mock.port}`;
});
afterAll(() => mock.stop());

beforeEach(() => {
  const tmp = makeTempDb();
  db = tmp.db;
  cleanup = tmp.cleanup;
});
afterEach(() => cleanup());

describe('supersede chain', () => {
  it('creates new entry and sets superseded_by on old', async () => {
    const oldId = await cmdAdd(db, 'Old content', { category: 'test', importance: 5 });
    const newId = await cmdSupersede(db, oldId, 'New content');

    expect(newId).toBeGreaterThan(oldId);

    const old = cmdGet(db, oldId);
    expect(old?.superseded_by).toBe(newId);

    const newEntry = cmdGet(db, newId);
    expect(newEntry?.superseded_by).toBeNull();
    expect(newEntry?.content).toBe('New content');
  });

  it('inherits category and importance when not specified', async () => {
    const oldId = await cmdAdd(db, 'Original', { category: 'inherited', importance: 9 });
    const newId = await cmdSupersede(db, oldId, 'Updated');

    const newEntry = cmdGet(db, newId);
    expect(newEntry?.category).toBe('inherited');
    expect(newEntry?.importance).toBe(9);
  });

  it('overrides category and importance when specified', async () => {
    const oldId = await cmdAdd(db, 'Original', { category: 'old-cat', importance: 3 });
    const newId = await cmdSupersede(db, oldId, 'Updated', { category: 'new-cat', importance: 8 });

    const newEntry = cmdGet(db, newId);
    expect(newEntry?.category).toBe('new-cat');
    expect(newEntry?.importance).toBe(8);
  });

  it('list excludes superseded entries by default', async () => {
    const oldId = await cmdAdd(db, 'Old', { category: 'test' });
    await cmdSupersede(db, oldId, 'New');

    const list = cmdList(db);
    expect(list.find((e) => e.id === oldId)).toBeUndefined();
  });

  it('list includes superseded when includeSuperseded=true', async () => {
    const oldId = await cmdAdd(db, 'Old', { category: 'test' });
    await cmdSupersede(db, oldId, 'New');

    const list = cmdList(db, { includeSuperseded: true });
    expect(list.find((e) => e.id === oldId)).toBeDefined();
  });

  it('chained supersede — old → new → newer', async () => {
    const id1 = await cmdAdd(db, 'v1', { category: 'chain' });
    const id2 = await cmdSupersede(db, id1, 'v2');
    const id3 = await cmdSupersede(db, id2, 'v3');

    expect(cmdGet(db, id1)?.superseded_by).toBe(id2);
    expect(cmdGet(db, id2)?.superseded_by).toBe(id3);
    expect(cmdGet(db, id3)?.superseded_by).toBeNull();

    // Only id3 appears in default list
    const list = cmdList(db, { category: 'chain' });
    const ids = list.map((e) => e.id);
    expect(ids).not.toContain(id1);
    expect(ids).not.toContain(id2);
    expect(ids).toContain(id3);
  });

  it('throws when old entry not found', async () => {
    expect(cmdSupersede(db, 9999, 'new content')).rejects.toThrow('9999 not found');
  });
});
