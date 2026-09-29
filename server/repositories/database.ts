import fs from 'node:fs/promises';
import path from 'node:path';
import mysql, { type Pool, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';
import type { Engine, SearchResultRecord, Snapshot, Store, TrackedKeyword } from '../domain/types.js';
import { id, nowIso } from '../domain/utils.js';

interface JsonState {
  searchResults: SearchResultRecord[];
  tracked: TrackedKeyword[];
}

const emptyState = (): JsonState => ({ searchResults: [], tracked: [] });

export class JsonStore implements Store {
  private state: JsonState = emptyState();
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath = path.resolve(process.env.DATA_FILE ?? 'data/serp-compare.json')) {
    this.filePath = filePath;
  }

  async init(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      this.state = JSON.parse(raw) as JsonState;
      this.state.searchResults ??= [];
      this.state.tracked ??= [];
    } catch {
      this.state = emptyState();
      await this.persist();
    }
  }

  async findFreshSearch(engine: Engine, query: string, gl: string, hl: string, ttlMs: number): Promise<SearchResultRecord | null> {
    const cutoff = Date.now() - ttlMs;
    const match = this.state.searchResults
      .filter((item) => item.engine === engine && item.query === query && item.gl === gl && item.hl === hl)
      .filter((item) => new Date(item.fetchedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.fetchedAt).getTime() - new Date(a.fetchedAt).getTime())[0];
    return match ?? null;
  }

  async saveSearch(record: SearchResultRecord): Promise<void> {
    this.state.searchResults.push(record);
    await this.persist();
  }

  async listTracked(): Promise<TrackedKeyword[]> {
    return structuredClone(this.state.tracked).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async findTracked(trackedId: string): Promise<TrackedKeyword | null> {
    const found = this.state.tracked.find((item) => item.id === trackedId);
    return found ? structuredClone(found) : null;
  }

  async createTracked(input: Pick<TrackedKeyword, 'query' | 'domain' | 'gl' | 'hl'>): Promise<TrackedKeyword> {
    const tracked: TrackedKeyword = { ...input, id: id(), createdAt: nowIso(), snapshots: [] };
    this.state.tracked.unshift(tracked);
    await this.persist();
    return structuredClone(tracked);
  }

  async deleteTracked(trackedId: string): Promise<boolean> {
    const before = this.state.tracked.length;
    this.state.tracked = this.state.tracked.filter((item) => item.id !== trackedId);
    if (this.state.tracked.length !== before) await this.persist();
    return before !== this.state.tracked.length;
  }

  async addSnapshot(snapshot: Snapshot): Promise<void> {
    const tracked = this.state.tracked.find((item) => item.id === snapshot.trackedKeywordId);
    if (!tracked) return;
    tracked.snapshots.push(snapshot);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const content = JSON.stringify(this.state, null, 2);
    this.writeQueue = this.writeQueue.then(() => fs.writeFile(this.filePath, content));
    await this.writeQueue;
  }
}

export class MysqlStore implements Store {
  constructor(private readonly pool: Pool) {}

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS search_results (
        id VARCHAR(64) PRIMARY KEY,
        engine VARCHAR(16) NOT NULL,
        query_text VARCHAR(180) NOT NULL,
        gl_code VARCHAR(8) NOT NULL,
        hl_code VARCHAR(12) NOT NULL,
        results_json JSON NOT NULL,
        fetched_at DATETIME(3) NOT NULL,
        INDEX idx_search_cache (engine, query_text, gl_code, hl_code, fetched_at)
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS tracked_keywords (
        id VARCHAR(64) PRIMARY KEY,
        query_text VARCHAR(180) NOT NULL,
        domain VARCHAR(255) NOT NULL,
        gl_code VARCHAR(8) NOT NULL,
        hl_code VARCHAR(12) NOT NULL,
        created_at DATETIME(3) NOT NULL
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS snapshots (
        id VARCHAR(64) PRIMARY KEY,
        tracked_keyword_id VARCHAR(64) NOT NULL,
        google_position INT NULL,
        bing_position INT NULL,
        checked_at DATETIME(3) NOT NULL,
        INDEX idx_snapshot_keyword (tracked_keyword_id, checked_at)
      )
    `);
  }

  async findFreshSearch(engine: Engine, query: string, gl: string, hl: string, ttlMs: number): Promise<SearchResultRecord | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM search_results WHERE engine = ? AND query_text = ? AND gl_code = ? AND hl_code = ? AND fetched_at >= ? ORDER BY fetched_at DESC LIMIT 1`,
      [engine, query, gl, hl, new Date(Date.now() - ttlMs)],
    );
    const row = rows[0];
    return row ? this.searchFromRow(row) : null;
  }

  async saveSearch(record: SearchResultRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO search_results (id, engine, query_text, gl_code, hl_code, results_json, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.engine, record.query, record.gl, record.hl, JSON.stringify(record.results), new Date(record.fetchedAt)],
    );
  }

  async listTracked(): Promise<TrackedKeyword[]> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM tracked_keywords ORDER BY created_at DESC');
    return Promise.all(rows.map((row) => this.withSnapshots(this.trackedFromRow(row))));
  }

  async findTracked(trackedId: string): Promise<TrackedKeyword | null> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM tracked_keywords WHERE id = ? LIMIT 1', [trackedId]);
    return rows[0] ? this.withSnapshots(this.trackedFromRow(rows[0])) : null;
  }

  async createTracked(input: Pick<TrackedKeyword, 'query' | 'domain' | 'gl' | 'hl'>): Promise<TrackedKeyword> {
    const tracked: TrackedKeyword = { ...input, id: id(), createdAt: nowIso(), snapshots: [] };
    await this.pool.query(
      `INSERT INTO tracked_keywords (id, query_text, domain, gl_code, hl_code, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [tracked.id, tracked.query, tracked.domain, tracked.gl, tracked.hl, new Date(tracked.createdAt)],
    );
    return tracked;
  }

  async deleteTracked(trackedId: string): Promise<boolean> {
    const [result] = await this.pool.query<ResultSetHeader>('DELETE FROM tracked_keywords WHERE id = ?', [trackedId]);
    return result.affectedRows > 0;
  }

  async addSnapshot(snapshot: Snapshot): Promise<void> {
    await this.pool.query(
      `INSERT INTO snapshots (id, tracked_keyword_id, google_position, bing_position, checked_at) VALUES (?, ?, ?, ?, ?)`,
      [snapshot.id, snapshot.trackedKeywordId, snapshot.googlePosition, snapshot.bingPosition, new Date(snapshot.checkedAt)],
    );
  }

  private async withSnapshots(tracked: TrackedKeyword): Promise<TrackedKeyword> {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM snapshots WHERE tracked_keyword_id = ? ORDER BY checked_at ASC', [tracked.id]);
    tracked.snapshots = rows.map((row) => ({
      id: row.id,
      trackedKeywordId: row.tracked_keyword_id,
      googlePosition: row.google_position === null ? null : Number(row.google_position),
      bingPosition: row.bing_position === null ? null : Number(row.bing_position),
      checkedAt: new Date(row.checked_at).toISOString(),
    }));
    return tracked;
  }

  private searchFromRow(row: RowDataPacket): SearchResultRecord {
    return {
      id: row.id,
      engine: row.engine,
      query: row.query_text,
      gl: row.gl_code,
      hl: row.hl_code,
      results: typeof row.results_json === 'string' ? JSON.parse(row.results_json) : row.results_json,
      fetchedAt: new Date(row.fetched_at).toISOString(),
    };
  }

  private trackedFromRow(row: RowDataPacket): TrackedKeyword {
    return {
      id: row.id,
      query: row.query_text,
      domain: row.domain,
      gl: row.gl_code,
      hl: row.hl_code,
      createdAt: new Date(row.created_at).toISOString(),
      snapshots: [],
    };
  }
}

export function createStore(): Store {
  const dsn = process.env.DATABASE_URL;
  if (dsn && /^mysql(?:s)?:\/\//i.test(dsn)) {
    const pool = mysql.createPool({ uri: dsn, waitForConnections: true, connectionLimit: 5, ssl: dsn.includes('ssl') ? {} : undefined });
    return new MysqlStore(pool);
  }
  return new JsonStore();
}
