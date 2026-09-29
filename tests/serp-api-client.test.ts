import { afterEach, expect, it, vi } from 'vitest';
import { SerpApiClient } from '../server/services/serp-api-client.js';
import { SerpError } from '../server/domain/errors.js';

const jsonResponse = (body: unknown, init: { status?: number } = {}) => ({
  status: init.status ?? 200,
  ok: (init.status ?? 200) < 400,
  json: async () => body,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it('search : lève invalid_key sur un statut 401', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'Invalid API key' }, { status: 401 })));
  const client = new SerpApiClient('bad-key');
  await expect(client.search('google', 'react', 'us', 'en')).rejects.toMatchObject({ code: 'invalid_key' } satisfies Partial<SerpError>);
});

it('search : lève quota_exhausted sur un statut 429', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'quota exceeded' }, { status: 429 })));
  const client = new SerpApiClient('key');
  await expect(client.search('google', 'react', 'us', 'en')).rejects.toMatchObject({ code: 'quota_exhausted' });
});

it('search : lève provider sur une réponse non ok sans indice de clé ou de quota', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ error: 'upstream unavailable' }, { status: 500 })));
  const client = new SerpApiClient('key');
  await expect(client.search('google', 'react', 'us', 'en')).rejects.toMatchObject({ code: 'provider' });
});

it('search : lève timeout quand la requête est annulée', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  const client = new SerpApiClient('key');
  await expect(client.search('google', 'react', 'us', 'en')).rejects.toMatchObject({ code: 'timeout' });
});

it('search : lève network sur toute autre erreur fetch', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
  const client = new SerpApiClient('key');
  await expect(client.search('google', 'react', 'us', 'en')).rejects.toMatchObject({ code: 'network' });
});

it('search : retourne les résultats parsés quand SerpApi répond correctement', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ organic_results: [{ position: 1, title: 'React', link: 'https://react.dev', snippet: 'UI library' }] })));
  const client = new SerpApiClient('key');
  const results = await client.search('google', 'react', 'us', 'en');
  expect(results).toEqual([{ position: 1, title: 'React', link: 'https://react.dev', domain: 'react.dev', snippet: 'UI library' }]);
});

it('demoSearch : bing a des domaines différents de google pour la même requête', () => {
  const client = new SerpApiClient(undefined);
  const google = client['demoSearch']('google', 'react', 'us', 'en');
  const bing = client['demoSearch']('bing', 'react', 'us', 'en');
  expect(google).toHaveLength(10);
  expect(bing).toHaveLength(10);
  expect(google.map((item) => item.domain)).not.toEqual(bing.map((item) => item.domain));
});
