import { createHash, randomUUID } from 'node:crypto';

export function id(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function cleanQuery(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
}

export function cleanCountry(value: unknown): string {
  const normalized = String(value ?? 'us').trim().toLowerCase();
  return /^[a-z]{2}$/.test(normalized) ? normalized : 'us';
}

export function cleanLanguage(value: unknown): string {
  const normalized = String(value ?? 'en').trim().toLowerCase();
  return /^[a-z]{2}(?:-[a-z]{2})?$/.test(normalized) ? normalized : 'en';
}

export function normalizeDomain(value: string): string {
  let raw = value.trim().toLowerCase();
  if (!raw) return '';
  if (!/^https?:\/\//.test(raw)) raw = `https://${raw}`;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return value.trim().toLowerCase().replace(/^www\./, '').split('/')[0] ?? '';
  }
}

export function hashIndex(input: string, modulo: number): number {
  const hex = createHash('sha256').update(input).digest('hex').slice(0, 8);
  return parseInt(hex, 16) % modulo;
}

export function ageSeconds(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
}
