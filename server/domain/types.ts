export type Engine = 'google' | 'bing';

export interface SerpItem {
  position: number;
  title: string;
  link: string;
  domain: string;
  snippet?: string;
}

export interface SearchResultRecord {
  id: string;
  engine: Engine;
  query: string;
  gl: string;
  hl: string;
  results: SerpItem[];
  fetchedAt: string;
}

export interface Snapshot {
  id: string;
  trackedKeywordId: string;
  googlePosition: number | null;
  bingPosition: number | null;
  checkedAt: string;
}

export interface TrackedKeyword {
  id: string;
  query: string;
  domain: string;
  gl: string;
  hl: string;
  createdAt: string;
  snapshots: Snapshot[];
}

export interface CompareResponse {
  query: string;
  gl: string;
  hl: string;
  fetchedAt: string;
  cached: boolean;
  cacheAgeSeconds: number;
  overlapCount: number;
  overlapPercentage: number;
  sharedDomains: string[];
  engines: Record<Engine, { results: SerpItem[]; fetchedAt: string; cached: boolean }>;
}

export interface Store {
  init(): Promise<void>;
  findFreshSearch(engine: Engine, query: string, gl: string, hl: string, ttlMs: number): Promise<SearchResultRecord | null>;
  saveSearch(record: SearchResultRecord): Promise<void>;
  listTracked(): Promise<TrackedKeyword[]>;
  findTracked(id: string): Promise<TrackedKeyword | null>;
  createTracked(input: Pick<TrackedKeyword, 'query' | 'domain' | 'gl' | 'hl'>): Promise<TrackedKeyword>;
  deleteTracked(id: string): Promise<boolean>;
  addSnapshot(snapshot: Snapshot): Promise<void>;
}
