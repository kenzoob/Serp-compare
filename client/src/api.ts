export type Engine = 'google' | 'bing';
export interface SerpItem { position: number; title: string; link: string; domain: string; snippet?: string; }
export interface CompareResponse { query: string; gl: string; hl: string; fetchedAt: string; cached: boolean; cacheAgeSeconds: number; overlapCount: number; overlapPercentage: number; sharedDomains: string[]; engines: Record<Engine, { results: SerpItem[]; fetchedAt: string; cached: boolean }>; }
export interface Snapshot { id: string; trackedKeywordId: string; googlePosition: number | null; bingPosition: number | null; checkedAt: string; }
export interface TrackedKeyword { id: string; query: string; domain: string; gl: string; hl: string; createdAt: string; snapshots: Snapshot[]; }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) }, ...options });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: { message: 'Une erreur est survenue.' } }));
    throw new Error(payload.error?.message ?? 'Une erreur est survenue.');
  }
  return response.status === 204 ? (undefined as T) : response.json() as Promise<T>;
}

export function compare(query: string, gl: string, hl: string, refresh = false) {
  const params = new URLSearchParams({ q: query, gl, hl, refresh: refresh ? '1' : '0' });
  return request<CompareResponse>(`/api/compare?${params.toString()}`);
}
export function getConfig() { return request<{ demoMode: boolean; cacheTtlHours: number }>('/api/config'); }
export function listTracked() { return request<{ tracked: TrackedKeyword[] }>('/api/tracked'); }
export function createTracked(input: { query: string; domain: string; gl: string; hl: string }) { return request<{ tracked: TrackedKeyword }>('/api/tracked', { method: 'POST', body: JSON.stringify(input) }); }
export function refreshTracked(id: string) { return request<{ tracked: TrackedKeyword }>(`/api/tracked/${id}/refresh`, { method: 'POST' }); }
export function deleteTracked(id: string) { return request<void>(`/api/tracked/${id}`, { method: 'DELETE' }); }
