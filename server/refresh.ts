import { createStore } from './repositories/database.js';
import { SerpFetcher, positionForDomain } from './services/serp-fetcher.js';
import { id, nowIso } from './domain/utils.js';

const store = createStore();
await store.init();
const fetcher = new SerpFetcher(store);
const tracked = await store.listTracked();
for (const item of tracked) {
  const [google, bing] = await Promise.all([
    fetcher.fetch('google', item.query, item.gl, item.hl, true),
    fetcher.fetch('bing', item.query, item.gl, item.hl, true),
  ]);
  await store.addSnapshot({
    id: id(),
    trackedKeywordId: item.id,
    googlePosition: positionForDomain(google.record.results, item.domain),
    bingPosition: positionForDomain(bing.record.results, item.domain),
    checkedAt: nowIso(),
  });
}
console.log(`Refreshed ${tracked.length} tracked keyword${tracked.length === 1 ? '' : 's'}.`);
