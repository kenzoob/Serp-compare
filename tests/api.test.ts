import { describe, expect, it } from 'vitest';
import { createApp } from '../server/app.js';
import { SerpFetcher } from '../server/services/serp-fetcher.js';
import { SerpApiClient } from '../server/services/serp-api-client.js';
import type { Engine, SearchResultRecord, Snapshot, Store, TrackedKeyword } from '../server/domain/types.js';

class ApiStore implements Store {
  searches: SearchResultRecord[] = [];
  tracked: TrackedKeyword[] = [];
  async init() {}
  async findFreshSearch(engine: Engine, query: string, gl: string, hl: string, ttlMs: number) { const cutoff = Date.now() - ttlMs; return this.searches.find((x) => x.engine === engine && x.query === query && x.gl === gl && x.hl === hl && Date.parse(x.fetchedAt) > cutoff) ?? null; }
  async saveSearch(r: SearchResultRecord) { this.searches.push(r); }
  async listTracked() { return this.tracked; }
  async findTracked(id: string) { return this.tracked.find((x) => x.id === id) ?? null; }
  async createTracked(input: Pick<TrackedKeyword, 'query'|'domain'|'gl'|'hl'>) { const item: TrackedKeyword = { ...input, id: 'tracked-1', createdAt: new Date().toISOString(), snapshots: [] }; this.tracked.push(item); return item; }
  async deleteTracked(id: string) { const old = this.tracked.length; this.tracked = this.tracked.filter((x) => x.id !== id); return old !== this.tracked.length; }
  async addSnapshot(s: Snapshot) { this.tracked.find((x) => x.id === s.trackedKeywordId)?.snapshots.push(s); }
}

async function call(app: ReturnType<typeof createApp>, url: string, init?: RequestInit) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const response = await fetch(`http://127.0.0.1:${port}${url}`, init);
  const body = await response.json().catch(() => null);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return { response, body };
}

describe('API', () => {
  it('retourne une comparaison démo', async () => {
    const store = new ApiStore();
    const result = await call(createApp(store, new SerpFetcher(store, new SerpApiClient(undefined))), '/api/compare?q=react&gl=us&hl=en');
    expect(result.response.status).toBe(200);
    expect(result.body.engines.google.results).toHaveLength(10);
    expect(result.body.overlapPercentage).toBeGreaterThanOrEqual(0);
  });

  it('rejette une requête trop courte avec un message utile', async () => {
    const store = new ApiStore();
    const result = await call(createApp(store), '/api/compare?q=x');
    expect(result.response.status).toBe(400);
    expect(result.body.error.code).toBe('validation');
  });

  it('crée un suivi avec un domaine normalisé', async () => {
    const store = new ApiStore();
    const result = await call(createApp(store), '/api/tracked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'react', domain: 'https://www.React.dev/docs', gl: 'fr', hl: 'fr' }) });
    expect(result.response.status).toBe(201);
    expect(result.body.tracked.domain).toBe('react.dev');
  });
});
