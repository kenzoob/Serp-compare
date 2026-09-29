import { expect, it } from 'vitest';
import { makeComparison } from '../server/services/comparison.js';
import { positionForDomain, SerpFetcher } from '../server/services/serp-fetcher.js';
import { SerpApiClient } from '../server/services/serp-api-client.js';
import type { SearchResultRecord, Store, TrackedKeyword, Engine } from '../server/domain/types.js';

const record = (engine: Engine, domains: string[], fetchedAt = new Date().toISOString()): SearchResultRecord => ({
  id: engine, engine, query: 'react', gl: 'us', hl: 'en', fetchedAt,
  results: domains.map((domain, index) => ({ position: index + 1, title: domain, link: `https://${domain}/page`, domain })),
});

class MemoryStore implements Store {
  searches: SearchResultRecord[] = [];
  tracked: TrackedKeyword[] = [];
  async init() {}
  async findFreshSearch(engine: Engine, query: string, gl: string, hl: string, ttlMs: number) { const cutoff = Date.now() - ttlMs; return this.searches.find((item) => item.engine === engine && item.query === query && item.gl === gl && item.hl === hl && Date.parse(item.fetchedAt) > cutoff) ?? null; }
  async saveSearch(item: SearchResultRecord) { this.searches.push(item); }
  async listTracked() { return this.tracked; }
  async findTracked(id: string) { return this.tracked.find((item) => item.id === id) ?? null; }
  async createTracked(input: Pick<TrackedKeyword, 'query'|'domain'|'gl'|'hl'>) { const item = { ...input, id: '1', createdAt: new Date().toISOString(), snapshots: [] }; this.tracked.push(item); return item; }
  async deleteTracked(id: string) { const before = this.tracked.length; this.tracked = this.tracked.filter((item) => item.id !== id); return before !== this.tracked.length; }
  async addSnapshot(snapshot: TrackedKeyword['snapshots'][number]) { const item = this.tracked.find((entry) => entry.id === snapshot.trackedKeywordId); item?.snapshots.push(snapshot); }
}

it('calcule les domaines partagés et le pourcentage', () => {
  const result = makeComparison(record('google', ['a.com', 'shared.com', 'c.com']), record('bing', ['shared.com', 'b.com']));
  expect(result.overlapCount).toBe(1);
  expect(result.overlapPercentage).toBe(10);
  expect(result.sharedDomains).toEqual(['shared.com']);
});

it('retrouve une position ou null', () => {
  const results = record('google', ['example.com']).results;
  expect(positionForDomain(results, 'www.example.com')).toBe(1);
  expect(positionForDomain(results, 'missing.com')).toBeNull();
});

it('réutilise le cache avant le client', async () => {
  const store = new MemoryStore();
  const client = new SerpApiClient(undefined);
  const fetcher = new SerpFetcher(store, client);
  await fetcher.fetch('google', 'react', 'us', 'en');
  const second = await fetcher.fetch('google', 'react', 'us', 'en');
  expect(second.cached).toBe(true);
  expect(store.searches).toHaveLength(1);
});

it('parse les résultats de forme SerpApi', () => {
  const client = new SerpApiClient(undefined);
  const parsed = client.parse({ organic_results: [{ position: 1, title: 'Docs', link: 'https://www.example.com/docs', snippet: 'Hello' }] });
  expect(parsed[0]).toMatchObject({ position: 1, title: 'Docs', domain: 'example.com', snippet: 'Hello' });
});
