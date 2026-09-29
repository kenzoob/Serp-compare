# SERP Compare

[![CI](https://github.com/kenzoob/Serp-compare/actions/workflows/ci.yml/badge.svg)](https://github.com/kenzoob/Serp-compare/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](package.json)

Compare Google and Bing's top 10 organic results for any query, surface the domains that rank on both, and track how a domain's position moves over time.

No API key required to try it — the app ships with a deterministic demo engine and only switches to live data when you provide one.

## Contents

- [Quickstart](#quickstart)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [API reference](#api-reference)
- [Testing](#testing)
- [Continuous integration](#continuous-integration)
- [Deployment](#deployment)
- [Visual design](#visual-design)
- [License](#license)

## Quickstart

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:3000`. That's it — no key, no database, no config. The app runs in demo mode out of the box with realistic, deterministic results so you can exercise the full flow immediately.

## Features

- **Compare** — enter a query, country (`gl`) and language (`hl`); see Google and Bing side by side, an overlap score, the shared domains highlighted, and how stale the cached data is. A *Refresh* action bypasses the cache for a live re-fetch.
- **Tracking** — save a query/domain pair, refresh its rank on demand, watch its history render as an SVG line chart, and export the full history to CSV.
- **Demo mode** — zero setup. Results are generated deterministically from a hash of the query, so the same input always produces the same believable result set — useful for testing the whole UX without hitting a real API.
- **Live mode** — set `SERPAPI_KEY` and the app transparently switches to [SerpApi](https://serpapi.com). Invalid-key, quota-exhausted, timeout and network failures are all caught server-side and turned into readable client messages instead of raw errors.
- **Caching** — each engine/query/country/language combination is cached for 24h; an explicit refresh invalidates just that cache entry.
- **Automatable refresh** — `POST /api/refresh` and the `pnpm refresh` CLI script replay every tracked keyword in one call, so a daily cron can keep history up to date.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Validation | Zod |
| Storage | Local JSON file by default; MySQL when `DATABASE_URL` is set |
| Tests | Vitest, `@vitest/coverage-v8` |
| Lint | ESLint (flat config), typescript-eslint, eslint-plugin-react-hooks |
| CI | GitHub Actions |
| Deploy | Multi-stage Dockerfile (Vite + tsc build, Node alpine runtime) |

## Architecture

```
client/src/           React UI — Compare and Tracking pages, thin API client
server/
  domain/              pure types, typed errors (SerpError), string/date utils
  services/
    serp-api-client.ts   calls SerpApi, or generates demo results when no key is set
    serp-fetcher.ts       wraps the client with the 24h cache
    comparison.ts          computes overlap % and shared domains
  repositories/
    database.ts           JsonStore (file) and MysqlStore (SQL) behind one Store interface,
                            picked at runtime by createStore()
  app.ts                 Express routes, Zod validation, rate limiting, error mapping
  index.ts               HTTP entry point
  refresh.ts              CLI: replays every tracked keyword via POST /api/refresh
tests/                  unit + integration tests (Vitest)
public/                 logo, route manifest
```

The server serves the built client (`dist/client`) and the `/api/*` routes from the same origin — one deployable unit, no CORS to manage.

Storage is behind a single `Store` interface (`domain/types.ts`), so `JsonStore` and `MysqlStore` are interchangeable: business logic never knows which one it's talking to.

## Configuration

| Variable | Purpose | Default |
|---|---|---|
| `SERPAPI_KEY` | Enables live SerpApi results. Left empty, the app stays in demo mode. | *(empty)* |
| `DATABASE_URL` | A `mysql://...` URL. Omitted, storage falls back to a local JSON file. | *(empty)* |
| `PORT` | Port the Express server listens on. | `3000` |
| `NODE_ENV` | **Leave empty locally.** Vite reads this `.env` file at build time — `NODE_ENV=development` here silently forces `pnpm build` into development mode (an unminified bundle, roughly 2x larger). The Dockerfile sets it to `production` explicitly at runtime, so containers are unaffected. | *(empty)* |

## Scripts

```bash
pnpm dev             # dev server (tsx watch), demo mode by default
pnpm lint            # ESLint across the repo
pnpm typecheck       # tsc --noEmit for server, then client
pnpm test            # Vitest
pnpm test:coverage   # Vitest + coverage report (80% statements/lines gate)
pnpm build           # build client (Vite) then server (tsc)
pnpm start           # run the compiled server (dist-server)
pnpm refresh         # CLI: replay all tracked keywords via POST /api/refresh
```

## API reference

All `/api/*` routes are rate-limited to 60 requests/minute per IP.

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server status and current mode (`demo` / `serpapi`). |
| `GET` | `/api/config` | `{ demoMode, cacheTtlHours }` for the UI. |
| `GET` | `/api/compare` | Google vs. Bing comparison. Query params: `q`, `gl`, `hl`, `refresh` (`0`/`1`). |
| `GET` | `/api/tracked` | List all tracked keywords. |
| `POST` | `/api/tracked` | Create a tracked keyword. Body: `{ query, domain, gl, hl }`. |
| `POST` | `/api/tracked/:id/refresh` | Fetch current positions and save a snapshot. |
| `GET` | `/api/tracked/:id/history` | Full history for one tracked keyword. |
| `GET` | `/api/tracked/:id/export.csv` | History as a CSV download. |
| `DELETE` | `/api/tracked/:id` | Remove a tracked keyword. |
| `POST` | `/api/refresh` | Refresh every tracked keyword in one call. |

Example:

```bash
curl "http://localhost:3000/api/compare?q=react&gl=us&hl=en"
```

```json
{
  "query": "react",
  "overlapCount": 7,
  "overlapPercentage": 70,
  "sharedDomains": ["github.com", "stackoverflow.com", "..."],
  "engines": {
    "google": { "results": [ /* 10 ranked items */ ], "cached": false },
    "bing":   { "results": [ /* 10 ranked items */ ], "cached": false }
  }
}
```

## Testing

```bash
pnpm test
pnpm test:coverage
```

Coverage includes: overlap-score math, the fetcher's cache logic, SerpApi response parsing, every error-mapping branch (`invalid_key` / `quota_exhausted` / `timeout` / `network` / `provider`, exercised through a mocked `fetch`), a full CRUD cycle against `JsonStore` (including cache expiry and reloading an existing file), and every API route.

`MysqlStore` is tested against a **real** MySQL instance when `TEST_DATABASE_URL` is set — otherwise those cases skip automatically:

```bash
TEST_DATABASE_URL="mysql://root:pass@127.0.0.1:3306/serpcompare" pnpm test
```

Server coverage is enforced via a threshold in `vitest.config.ts` (80% statements/lines).

## Continuous integration

`.github/workflows/ci.yml` runs on every push and PR to `main`: `pnpm lint` → `pnpm typecheck` → `pnpm test:coverage` (against an ephemeral MySQL service, so `MysqlStore` is exercised in CI too) → `pnpm build`.

## Deployment

The Dockerfile is a two-stage build: a `build` stage compiles the Vite client and the TypeScript server, then a separate `runtime` stage installs only production dependencies and copies the compiled output — a small final image with `NODE_ENV=production` set explicitly. Express serves everything on the port given by the environment. `/health` is meant for the platform's health probe; built assets get a long cache lifetime in production while API routes stay dynamic and uncached.

```bash
docker build -t serpcompare .
docker run -p 3000:3000 -e SERPAPI_KEY=... -e DATABASE_URL=... serpcompare
```

## Visual design

The UI follows the "Signal Atlas" direction: a dark editorial dashboard, a blue-black/cyan/violet palette, and a Space Grotesk / Inter / IBM Plex Mono type system. Full rationale in [`ideas.md`](ideas.md); the original implementation plan is in [`plan.md`](plan.md).

## License

MIT — see [`LICENSE`](LICENSE).
