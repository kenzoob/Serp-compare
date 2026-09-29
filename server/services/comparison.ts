import type { CompareResponse, SearchResultRecord } from '../domain/types.js';
import { ageSeconds } from '../domain/utils.js';
import { sharedDomains } from './serp-fetcher.js';

export function makeComparison(google: SearchResultRecord, bing: SearchResultRecord, forceRefresh = false): CompareResponse {
  const shared = sharedDomains(google.results, bing.results);
  const fetchedAt = new Date(Math.max(new Date(google.fetchedAt).getTime(), new Date(bing.fetchedAt).getTime())).toISOString();
  const cached = !forceRefresh && ageSeconds(google.fetchedAt) > 1 && ageSeconds(bing.fetchedAt) > 1;
  return {
    query: google.query,
    gl: google.gl,
    hl: google.hl,
    fetchedAt,
    cached,
    cacheAgeSeconds: ageSeconds(fetchedAt),
    overlapCount: shared.length,
    overlapPercentage: Math.round((shared.length / 10) * 100),
    sharedDomains: shared,
    engines: {
      google: { results: google.results, fetchedAt: google.fetchedAt, cached: cached },
      bing: { results: bing.results, fetchedAt: bing.fetchedAt, cached: cached },
    },
  };
}
