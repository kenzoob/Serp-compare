import { expect, it } from 'vitest';
import { SerpError, publicErrorMessage } from '../server/domain/errors.js';

it('publicErrorMessage : expose le code et le statut d’une SerpError', () => {
  const error = new SerpError('quota_exhausted', 'Le quota SerpApi est épuisé.', 429);
  expect(publicErrorMessage(error)).toEqual({ status: 429, code: 'quota_exhausted', message: 'Le quota SerpApi est épuisé.' });
});

it('publicErrorMessage : utilise le statut 502 par défaut pour une SerpError', () => {
  const error = new SerpError('network', 'Impossible de joindre SerpApi.');
  expect(publicErrorMessage(error).status).toBe(502);
});

it('publicErrorMessage : retombe sur une erreur interne générique pour toute autre erreur', () => {
  expect(publicErrorMessage(new Error('boom'))).toEqual({
    status: 500,
    code: 'internal',
    message: 'Une erreur inattendue est survenue. Réessayez dans un instant.',
  });
  expect(publicErrorMessage('boom').code).toBe('internal');
  expect(publicErrorMessage(undefined).code).toBe('internal');
});
