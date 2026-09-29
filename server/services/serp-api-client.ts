import { SerpError } from '../domain/errors.js';
import { hashIndex, normalizeDomain } from '../domain/utils.js';
import type { Engine, SerpItem } from '../domain/types.js';

interface SerpApiResponse {
  organic_results?: Array<{ position?: number; title?: string; link?: string; snippet?: string }>;
  error?: string;
  search_metadata?: { status?: string };
}

const demoDomains = [
  'developer.mozilla.org', 'react.dev', 'web.dev', 'github.com', 'stackoverflow.com',
  'freecodecamp.org', 'css-tricks.com', 'typescriptlang.org', 'npmjs.com', 'medium.com',
  'smashingmagazine.com', 'dev.to', 'w3schools.com', 'frontendmasters.com', 'vite.dev',
];

export class SerpApiClient {
  constructor(private readonly apiKey = process.env.SERPAPI_KEY) {}

  get isDemo(): boolean {
    return !this.apiKey;
  }

  async search(engine: Engine, query: string, gl: string, hl: string): Promise<SerpItem[]> {
    if (!this.apiKey) return this.demoSearch(engine, query, gl, hl);
    const params = new URLSearchParams({ engine, q: query, gl, hl, api_key: this.apiKey, num: '10' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { signal: controller.signal });
      const payload = await response.json() as SerpApiResponse;
      if (response.status === 401 || /invalid.*key|api key/i.test(payload.error ?? '')) {
        throw new SerpError('invalid_key', 'La clé SerpApi est invalide. Vérifiez SERPAPI_KEY dans la configuration.', 502);
      }
      if (response.status === 429 || /limit|quota|exhaust/i.test(payload.error ?? '')) {
        throw new SerpError('quota_exhausted', 'Le quota SerpApi est épuisé. Réessayez plus tard ou augmentez votre quota.', 429);
      }
      if (!response.ok || payload.error) {
        throw new SerpError('provider', payload.error ?? 'SerpApi n’a pas pu fournir les résultats.', 502);
      }
      return this.parse(payload);
    } catch (error) {
      if (error instanceof SerpError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new SerpError('timeout', 'SerpApi met trop de temps à répondre. Réessayez dans quelques secondes.', 504);
      }
      throw new SerpError('network', 'Impossible de joindre SerpApi. Vérifiez la connexion puis réessayez.', 502);
    } finally {
      clearTimeout(timer);
    }
  }

  parse(payload: SerpApiResponse): SerpItem[] {
    return (payload.organic_results ?? []).slice(0, 10).map((item, index) => {
      const link = item.link ?? '#';
      return {
        position: Number(item.position ?? index + 1),
        title: item.title?.trim() || 'Résultat sans titre',
        link,
        domain: normalizeDomain(link),
        snippet: item.snippet?.trim(),
      };
    }).filter((item) => item.link !== '#');
  }

  private demoSearch(engine: Engine, query: string, gl: string, hl: string): SerpItem[] {
    const offset = hashIndex(`${query}:${gl}:${hl}:${engine}`, demoDomains.length);
    const rotated = demoDomains.map((_, index) => demoDomains[(index + offset) % demoDomains.length]);
    const selected = engine === 'google'
      ? rotated.slice(0, 10)
      : rotated.slice(2, 8).concat(rotated.slice(11, 15));
    return selected.map((domain, index) => ({
      position: index + 1,
      title: `${query} — guide et ressources ${engine === 'google' ? 'Google' : 'Bing'}`,
      link: `https://${domain}/search/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))}`,
      domain,
      snippet: `Une ressource de référence pour comprendre ${query}, en ${hl} (${gl}).`,
    }));
  }
}
