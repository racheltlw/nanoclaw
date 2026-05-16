import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { openDb } from '../src/db.js';
import type { Database } from 'bun:sqlite';

export type MockServer = ReturnType<typeof Bun.serve>;

export function startMockOllama(opts?: { dims?: number; valueFn?: (prompt: string, callIndex: number) => number[] }): MockServer {
  const dims = opts?.dims ?? 768;
  let calls = 0;
  return Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/embeddings') {
        const callIdx = calls++;
        let embedding: number[];
        if (opts?.valueFn) {
          embedding = opts.valueFn('', callIdx);
        } else {
          embedding = new Array(dims).fill(0);
          embedding[callIdx % dims] = 1;
        }
        return Response.json({ embedding });
      }
      return new Response('not found', { status: 404 });
    },
  });
}

export function makeTempDb(): { db: Database.Database; path: string; cleanup: () => void } {
  const p = path.join(os.tmpdir(), `mnemon-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  process.env.MNEMON_DB = p;
  const db = openDb(p);
  return {
    db,
    path: p,
    cleanup() {
      db.close();
      try {
        fs.unlinkSync(p);
        fs.unlinkSync(p + '-wal');
        fs.unlinkSync(p + '-shm');
      } catch {
        // ignore
      }
    },
  };
}
