/**
 * Semantic memory recall hook.
 *
 * Before each Claude query, queries the mnemon knowledge store for context
 * relevant to the incoming message and prepends matching memories to the
 * system context. Failures are logged to stderr but never block the query.
 */
import { execFile } from 'node:child_process';

const RECALL_LIMIT = 5;
const RECALL_TIMEOUT_MS = 5_000;

export interface MemoryHit {
  id: number;
  content: string;
}

function log(msg: string): void {
  console.error(`[recall] ${msg}`);
}

/** Run mnemon query and return matching entries, or [] on any failure. */
export async function queryMemories(text: string): Promise<MemoryHit[]> {
  const dbPath = process.env.MNEMON_DB;
  if (!dbPath) return [];

  const trimmed = text.trim().slice(0, 500);
  if (!trimmed) return [];

  return new Promise((resolve) => {
    const env = { ...process.env };

    execFile(
      'mnemon',
      ['query', trimmed, '--limit', String(RECALL_LIMIT)],
      { timeout: RECALL_TIMEOUT_MS, maxBuffer: 256 * 1024, env },
      (error, stdout, stderr) => {
        if (error) {
          const reason = error.killed ? 'timeout' : error.message;
          log(`query failed: ${reason}`);
          if (stderr) log(`stderr: ${stderr.trim().slice(0, 200)}`);
          resolve([]);
          return;
        }

        try {
          const parsed = JSON.parse(stdout) as unknown;
          if (!Array.isArray(parsed)) throw new Error('not an array');
          const hits: MemoryHit[] = parsed
            .filter((r): r is { id: unknown; content: unknown } => r !== null && typeof r === 'object')
            .map((r) => ({ id: Number(r.id), content: String(r.content) }))
            .filter((h) => !isNaN(h.id));

          const ids = hits.map((h) => h.id).join(',');
          log(`query="${trimmed.slice(0, 60)}" returned=${hits.length}${hits.length > 0 ? ` ids=${ids}` : ''}`);
          resolve(hits);
        } catch (parseErr) {
          log(`malformed JSON from mnemon: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
          resolve([]);
        }
      },
    );
  });
}

/** Format recall hits as a system context block to prepend to instructions. */
export function buildRecallBlock(hits: MemoryHit[]): string {
  const lines = hits.map((h) => `- [id ${h.id}] ${h.content}`).join('\n');
  return `Relevant memories from your knowledge store:\n${lines}`;
}
