import express, { type Request, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { z } from 'zod';
import type { Store, TrackedKeyword } from './domain/types.js';
import { publicErrorMessage } from './domain/errors.js';
import { cleanCountry, cleanLanguage, cleanQuery, normalizeDomain, nowIso, id } from './domain/utils.js';
import { SerpFetcher, positionForDomain } from './services/serp-fetcher.js';
import { makeComparison } from './services/comparison.js';

const clientDist = path.resolve(process.cwd(), 'dist/client');

const compareQuerySchema = z.object({
  q: z.string().trim().min(2, 'Saisissez au moins 2 caractères.').max(180),
  gl: z.string().trim().regex(/^[a-z]{2}$/i).optional().default('us'),
  hl: z.string().trim().regex(/^[a-z]{2}(?:-[a-z]{2})?$/i).optional().default('en'),
  refresh: z.enum(['0', '1']).optional().default('0'),
});

const trackedBodySchema = z.object({
  query: z.string().trim().min(2, 'La requête doit contenir au moins 2 caractères.').max(180),
  domain: z.string().trim().min(3, 'Le domaine est requis.').max(255),
  gl: z.string().trim().regex(/^[a-z]{2}$/i).optional().default('us'),
  hl: z.string().trim().regex(/^[a-z]{2}(?:-[a-z]{2})?$/i).optional().default('en'),
});

export function createApp(store: Store, fetcher = new SerpFetcher(store)) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '50kb' }));
  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { code: 'rate_limited', message: 'Trop de requêtes. Réessayez dans un instant.' } },
    }),
  );

  app.get('/health', (_req, res) => res.json({ ok: true, mode: fetcher.demoMode ? 'demo' : 'serpapi', time: nowIso() }));

  app.get('/api/config', (_req, res) => res.json({ demoMode: fetcher.demoMode, cacheTtlHours: 24 }));

  app.get('/api/compare', async (req, res, next) => {
    try {
      const input = compareQuerySchema.parse({
        q: String(req.query.q ?? ''),
        gl: String(req.query.gl ?? 'us'),
        hl: String(req.query.hl ?? 'en'),
        refresh: String(req.query.refresh ?? '0'),
      });
      const query = cleanQuery(input.q);
      const gl = cleanCountry(input.gl);
      const hl = cleanLanguage(input.hl);
      const forceRefresh = input.refresh === '1';
      const [google, bing] = await Promise.all([
        fetcher.fetch('google', query, gl, hl, forceRefresh),
        fetcher.fetch('bing', query, gl, hl, forceRefresh),
      ]);
      res.json(makeComparison(google.record, bing.record, forceRefresh));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/tracked', async (_req, res, next) => {
    try { res.json({ tracked: await store.listTracked() }); } catch (error) { next(error); }
  });

  app.post('/api/tracked', async (req, res, next) => {
    try {
      const input = trackedBodySchema.parse(req.body);
      const tracked = await store.createTracked({
        query: cleanQuery(input.query),
        domain: normalizeDomain(input.domain),
        gl: cleanCountry(input.gl),
        hl: cleanLanguage(input.hl),
      });
      res.status(201).json({ tracked });
    } catch (error) { next(error); }
  });

  app.delete('/api/tracked/:id', async (req, res, next) => {
    try {
      const deleted = await store.deleteTracked(req.params.id);
      if (!deleted) return res.status(404).json({ error: { code: 'not_found', message: 'Suivi introuvable.' } });
      return res.status(204).send();
    } catch (error) { return next(error); }
  });

  app.get('/api/tracked/:id/history', async (req, res, next) => {
    try {
      const tracked = await store.findTracked(req.params.id);
      if (!tracked) return res.status(404).json({ error: { code: 'not_found', message: 'Suivi introuvable.' } });
      return res.json({ tracked });
    } catch (error) { return next(error); }
  });

  app.get('/api/tracked/:id/export.csv', async (req, res, next) => {
    try {
      const tracked = await store.findTracked(req.params.id);
      if (!tracked) return res.status(404).send('Suivi introuvable.');
      const header = 'checked_at,google_position,bing_position,query,domain,gl,hl';
      const rows = tracked.snapshots.map((snapshot) => [
        snapshot.checkedAt, snapshot.googlePosition ?? '', snapshot.bingPosition ?? '', tracked.query, tracked.domain, tracked.gl, tracked.hl,
      ].map(csvCell).join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="serp-${tracked.id}.csv"`);
      return res.send([header, ...rows].join('\n'));
    } catch (error) { return next(error); }
  });

  app.post('/api/tracked/:id/refresh', async (req, res, next) => {
    try {
      const tracked = await store.findTracked(req.params.id);
      if (!tracked) return res.status(404).json({ error: { code: 'not_found', message: 'Suivi introuvable.' } });
      const [google, bing] = await Promise.all([
        fetcher.fetch('google', tracked.query, tracked.gl, tracked.hl, true),
        fetcher.fetch('bing', tracked.query, tracked.gl, tracked.hl, true),
      ]);
      const snapshot = {
        id: id(), trackedKeywordId: tracked.id,
        googlePosition: positionForDomain(google.record.results, tracked.domain),
        bingPosition: positionForDomain(bing.record.results, tracked.domain),
        checkedAt: nowIso(),
      };
      await store.addSnapshot(snapshot);
      const updated = await store.findTracked(tracked.id);
      return res.json({ tracked: updated });
    } catch (error) { return next(error); }
  });

  app.post('/api/refresh', async (_req, res, next) => {
    try {
      const tracked = await store.listTracked();
      const refreshed: TrackedKeyword[] = [];
      for (const item of tracked) {
        const [google, bing] = await Promise.all([
          fetcher.fetch('google', item.query, item.gl, item.hl, true),
          fetcher.fetch('bing', item.query, item.gl, item.hl, true),
        ]);
        await store.addSnapshot({
          id: id(), trackedKeywordId: item.id,
          googlePosition: positionForDomain(google.record.results, item.domain),
          bingPosition: positionForDomain(bing.record.results, item.domain),
          checkedAt: nowIso(),
        });
        const updated = await store.findTracked(item.id);
        if (updated) refreshed.push(updated);
      }
      return res.json({ refreshed: refreshed.length, tracked: refreshed });
    } catch (error) { return next(error); }
  });

  app.use('/assets', express.static(path.join(clientDist, 'assets'), { maxAge: '1y', immutable: true }));
  app.use(express.static(clientDist, { index: 'index.html', maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));
  app.get(/^\/(?!api(?:\/|$)|health(?:\/|$)|assets(?:\/|$)).*/, (_req, res, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: { code: 'validation', message: error.issues[0]?.message ?? 'Les données envoyées sont invalides.' } });
    }
    const mapped = publicErrorMessage(error);
    return res.status(mapped.status).json({ error: { code: mapped.code, message: mapped.message } });
  });

  return app;
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
