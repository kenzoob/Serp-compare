export type SerpErrorCode = 'invalid_key' | 'quota_exhausted' | 'timeout' | 'network' | 'provider' | 'validation';

export class SerpError extends Error {
  constructor(
    public readonly code: SerpErrorCode,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'SerpError';
  }
}

export function publicErrorMessage(error: unknown): { status: number; code: string; message: string } {
  if (error instanceof SerpError) {
    return { status: error.status, code: error.code, message: error.message };
  }
  return {
    status: 500,
    code: 'internal',
    message: 'Une erreur inattendue est survenue. Réessayez dans un instant.',
  };
}
