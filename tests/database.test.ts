import { afterAll, afterEach, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { JsonStore, MysqlStore, createStore } from '../server/repositories/database.js';
import { id, nowIso } from '../server/domain/utils.js';
import type { SearchResultRecord } from '../server/domain/types.js';

const record = (fetchedAt = nowIso()): SearchResultRecord => ({
  id: id(), engine: 'google', query: 'react', gl: 'us', hl: 'en', fetchedAt,
  results: [{ position: 1, title: 'React', link: 'https://react.dev', domain: 'react.dev' }],
});

async function makeJsonStore() {
  const filePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'serp-compare-')), 'store.json');
  const store = new JsonStore(filePath);
  await store.init();
  return store;
}

it('JsonStore : persiste et relit un suivi avec ses snapshots', async () => {
  const store = await makeJsonStore();
  const tracked = await store.createTracked({ query: 'react', domain: 'react.dev', gl: 'us', hl: 'en' });
  await store.addSnapshot({ id: id(), trackedKeywordId: tracked.id, googlePosition: 3, bingPosition: null, checkedAt: nowIso() });
  const found = await store.findTracked(tracked.id);
  expect(found?.snapshots).toHaveLength(1);
  expect(found?.snapshots[0].googlePosition).toBe(3);
});

it('JsonStore : liste les suivis du plus récent au plus ancien', async () => {
  const store = await makeJsonStore();
  const first = await store.createTracked({ query: 'a', domain: 'a.com', gl: 'us', hl: 'en' });
  const second = await store.createTracked({ query: 'b', domain: 'b.com', gl: 'us', hl: 'en' });
  const listed = await store.listTracked();
  expect(listed.map((item) => item.id)).toEqual([second.id, first.id]);
});

it('JsonStore : supprime un suivi existant et rejette un id inconnu', async () => {
  const store = await makeJsonStore();
  const tracked = await store.createTracked({ query: 'react', domain: 'react.dev', gl: 'us', hl: 'en' });
  expect(await store.deleteTracked('missing')).toBe(false);
  expect(await store.deleteTracked(tracked.id)).toBe(true);
  expect(await store.findTracked(tracked.id)).toBeNull();
});

it('JsonStore : retrouve une recherche fraîche et ignore une recherche expirée', async () => {
  const store = await makeJsonStore();
  const stale = record(new Date(Date.now() - 60_000).toISOString());
  await store.saveSearch(stale);
  const fresh = await store.findFreshSearch('google', 'react', 'us', 'en', 30_000);
  expect(fresh).toBeNull();
  const recent = record();
  await store.saveSearch(recent);
  const found = await store.findFreshSearch('google', 'react', 'us', 'en', 60_000);
  expect(found?.id).toBe(recent.id);
});

it('JsonStore : recharge un fichier existant au lieu de le réinitialiser', async () => {
  const filePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'serp-compare-')), 'store.json');
  const first = new JsonStore(filePath);
  await first.init();
  await first.createTracked({ query: 'react', domain: 'react.dev', gl: 'us', hl: 'en' });
  const second = new JsonStore(filePath);
  await second.init();
  expect(await second.listTracked()).toHaveLength(1);
});

it('createStore : choisit JsonStore sans DATABASE_URL et MysqlStore avec une URL mysql', () => {
  const original = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  expect(createStore()).toBeInstanceOf(JsonStore);
  process.env.DATABASE_URL = 'mysql://root:pass@localhost:3306/serpcompare';
  expect(createStore()).toBeInstanceOf(MysqlStore);
  if (original === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = original;
});

const mysqlUrl = process.env.TEST_DATABASE_URL;

const mysqlPool = mysqlUrl ? mysql.createPool({ uri: mysqlUrl }) : null;
const mysqlStore = mysqlPool ? new MysqlStore(mysqlPool) : null;

afterAll(async () => {
  if (mysqlPool) await mysqlPool.end();
});

afterEach(async () => {
  if (mysqlPool) await mysqlPool.query('DELETE FROM snapshots; DELETE FROM tracked_keywords; DELETE FROM search_results;').catch(() => undefined);
});

it.runIf(mysqlStore)('MysqlStore : crée les tables et effectue le cycle CRUD complet sur un suivi', async () => {
  await mysqlStore!.init();
  const tracked = await mysqlStore!.createTracked({ query: 'react', domain: 'react.dev', gl: 'us', hl: 'en' });
  await mysqlStore!.addSnapshot({ id: id(), trackedKeywordId: tracked.id, googlePosition: 2, bingPosition: 5, checkedAt: nowIso() });
  const found = await mysqlStore!.findTracked(tracked.id);
  expect(found?.snapshots).toHaveLength(1);
  expect(found?.snapshots[0]).toMatchObject({ googlePosition: 2, bingPosition: 5 });
  expect(await mysqlStore!.deleteTracked(tracked.id)).toBe(true);
  expect(await mysqlStore!.findTracked(tracked.id)).toBeNull();
});

it.runIf(mysqlStore)('MysqlStore : met en cache une recherche puis la retrouve fraîche', async () => {
  await mysqlStore!.init();
  const search = record();
  await mysqlStore!.saveSearch(search);
  const found = await mysqlStore!.findFreshSearch('google', 'react', 'us', 'en', 60_000);
  expect(found?.id).toBe(search.id);
  expect(found?.results).toEqual(search.results);
});
