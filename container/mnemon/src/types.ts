export interface Entry {
  id: number;
  content: string;
  category: string;
  importance: number;
  tags: string | null;
  source: string | null;
  embedding: Buffer;
  created_at: number;
  updated_at: number;
  superseded_by: number | null;
}

export interface Edge {
  from_id: number;
  to_id: number;
  relation: string;
  created_at: number;
}

export interface QueryResult {
  id: number;
  content: string;
  category: string;
  importance: number;
  tags: string | null;
  source: string | null;
  created_at: number;
  score: number;
  final_rank: number;
}

export type EntryRow = Omit<Entry, 'embedding'>;
