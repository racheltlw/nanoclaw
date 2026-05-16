import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { embed, cosineSimilarity } from '../src/embeddings.js';
import { startMockOllama, type MockServer } from './setup.js';

let mock: MockServer;

beforeAll(() => {
  let seq = 0;
  mock = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === '/api/embeddings') {
        const body = (await req.json()) as { prompt: string };
        // Deterministic: embed based on first char code
        const idx = (body.prompt.charCodeAt(0) ?? 0) % 768;
        const embedding = new Array(768).fill(0);
        embedding[idx] = 1;
        seq++;
        return Response.json({ embedding });
      }
      return new Response('not found', { status: 404 });
    },
  });
  process.env.OLLAMA_URL = `http://localhost:${mock.port}`;
});
afterAll(() => mock.stop());

describe('embed', () => {
  it('returns a Buffer', async () => {
    const buf = await embed('hello');
    expect(buf).toBeInstanceOf(Buffer);
  });

  it('returns 768 * 4 = 3072 bytes', async () => {
    const buf = await embed('hello');
    expect(buf.byteLength).toBe(3072);
  });

  it('contains valid float32 values', async () => {
    const buf = await embed('test');
    const floats = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    expect(floats.length).toBe(768);
    for (const f of floats) {
      expect(isFinite(f)).toBe(true);
    }
  });

  it('throws on non-200 response', async () => {
    const badServer = Bun.serve({
      port: 0,
      fetch() {
        return new Response('server error', { status: 500 });
      },
    });
    const originalUrl = process.env.OLLAMA_URL;
    process.env.OLLAMA_URL = `http://localhost:${badServer.port}`;
    try {
      await expect(embed('hello')).rejects.toThrow('500');
    } finally {
      process.env.OLLAMA_URL = originalUrl;
      badServer.stop();
    }
  });
});

describe('cosineSimilarity', () => {
  function makeVec(dims: number, idx: number, value = 1): Buffer {
    const buf = Buffer.alloc(dims * 4);
    buf.writeFloatLE(value, idx * 4);
    return buf;
  }

  it('identical unit vectors → 1', () => {
    const a = makeVec(768, 0);
    expect(cosineSimilarity(a, Buffer.from(a))).toBeCloseTo(1, 5);
  });

  it('orthogonal unit vectors → 0', () => {
    const a = makeVec(768, 0);
    const b = makeVec(768, 1);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it('zero vector → 0', () => {
    const a = Buffer.alloc(768 * 4);
    const b = makeVec(768, 0);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('parallel vectors (same direction, different magnitude) → 1', () => {
    const a = makeVec(768, 5, 3);
    const b = makeVec(768, 5, 7);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});
