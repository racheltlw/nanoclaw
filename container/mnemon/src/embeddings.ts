const EMBEDDING_MODEL = 'nomic-embed-text';
const EXPECTED_DIMS = 768;

export function ollamaUrl(): string {
  return process.env.OLLAMA_URL ?? 'http://host.docker.internal:11434';
}

export async function embed(text: string): Promise<Buffer> {
  const res = await fetch(`${ollamaUrl()}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text }),
  });

  if (!res.ok) {
    throw new Error(`Ollama embeddings failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { embedding: number[] };
  if (!Array.isArray(data.embedding)) {
    throw new Error('Ollama returned no embedding array');
  }

  const dims = data.embedding.length;
  const buf = Buffer.allocUnsafe(dims * 4);
  for (let i = 0; i < dims; i++) {
    buf.writeFloatLE(data.embedding[i]!, i * 4);
  }
  return buf;
}

export function cosineSimilarity(a: Buffer, b: Buffer): number {
  const af = new Float32Array(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength));
  const bf = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(af.length, bf.length);
  for (let i = 0; i < len; i++) {
    dot += af[i]! * bf[i]!;
    na += af[i]! * af[i]!;
    nb += bf[i]! * bf[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export { EXPECTED_DIMS };
