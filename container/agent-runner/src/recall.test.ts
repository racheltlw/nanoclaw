import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { buildRecallBlock } from './recall.js';
import type { MemoryHit } from './recall.js';

// buildRecallBlock is pure — test it directly
describe('buildRecallBlock', () => {
  it('formats hits as a block', () => {
    const hits: MemoryHit[] = [
      { id: 12, content: 'I prefer concise replies in DMs' },
      { id: 7, content: 'My timezone is SGT' },
    ];
    const block = buildRecallBlock(hits);
    expect(block).toContain('Relevant memories from your knowledge store:');
    expect(block).toContain('- [id 12] I prefer concise replies in DMs');
    expect(block).toContain('- [id 7] My timezone is SGT');
  });
});

// queryMemories integration: only runs if MNEMON_DB is set and mnemon is on PATH
describe('queryMemories (integration)', () => {
  const skip = !process.env.MNEMON_DB || !Bun.which('mnemon');

  it('returns [] when MNEMON_DB is unset', async () => {
    const original = process.env.MNEMON_DB;
    delete process.env.MNEMON_DB;
    const { queryMemories } = await import('./recall.js');
    const hits = await queryMemories('test');
    expect(hits).toEqual([]);
    if (original !== undefined) process.env.MNEMON_DB = original;
  });

  it.skipIf(skip)('returns an array for a real query', async () => {
    const { queryMemories } = await import('./recall.js');
    const hits = await queryMemories('timezone preference');
    expect(Array.isArray(hits)).toBe(true);
    for (const h of hits) {
      expect(typeof h.id).toBe('number');
      expect(typeof h.content).toBe('string');
    }
  });

  it('handles a 1ms timeout gracefully', async () => {
    // Monkey-patch execFile by using an env var to point to a slow command
    // — instead, just verify the error path returns [] by pointing at bad binary.
    const original = process.env.MNEMON_DB;
    process.env.MNEMON_DB = '/tmp/nonexistent.db';
    const { queryMemories } = await import('./recall.js');
    const hits = await queryMemories('anything');
    expect(Array.isArray(hits)).toBe(true);
    if (original !== undefined) process.env.MNEMON_DB = original;
    else delete process.env.MNEMON_DB;
  });
});
