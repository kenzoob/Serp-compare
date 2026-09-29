import type { Store } from '../domain/types.js';
import { id, nowIso } from '../domain/utils.js';
import { SerpApiClient } from './serp-api-client.js';
import type { Engine, SearchResultRecord, SerpItem } from '../domain/types.js';

export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export class SerpFetcher {
  constructor(private readonly store: Store, private readonly client = new SerpApiClient()) {}

  async fetch(engine: Engine, query: string, gl: string, hl: string, forceRefresh = false): Promise<{ record: SearchResultRecord; cached: boolean }> {
    if (!forceRefresh) {
      const cached = await this.store.findFreshSearch(engine, query, gl, hl, CACHE_TTL_MS);
      if (cached) return { record: cached, cached: true };
    }
    const results = await this.client.search(engine, query, gl, hl);
    const record: SearchResultRecord = { id: id(), engine, query, gl, hl, results, fetchedAt: nowIso() };
    await this.store.saveSearch(record);
    return { record, cached: false };
  }

  get demoMode(): boolean {
    return this.client.isDemo;
  }
}

export function sharedDomains(google: SerpItem[], bing: SerpItem[]): string[] {
  const bingDomains = new Set(bing.map((item) => item.domain));
  return [...new Set(google.map((item) => item.domain).filter((domain) => bingDomains.has(domain)))];
}

export function positionForDomain(results: SerpItem[], domain: string): number | null {
  const normalized = domain.toLowerCase().replace(/^www\./, '');
  return results.find((item) => item.domain.replace(/^www\./, '') === normalized)?.position ?? null;
}
