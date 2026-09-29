# SERP Compare

SERP Compare compare les 10 premiers résultats organiques Google et Bing pour une requête donnée, met en évidence les domaines communs et suit la position d'un domaine au fil du temps.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Stack technique](#stack-technique)
- [Architecture](#architecture)
- [Installation](#installation)
- [Variables d'environnement](#variables-denvironnement)
- [Scripts](#scripts)
- [API](#api)
- [Tests et couverture](#tests-et-couverture)
- [Intégration continue](#intégration-continue)
- [Déploiement](#déploiement)
- [Direction visuelle](#direction-visuelle)
- [Licence](#licence)

## Fonctionnalités

- **Compare** — une requête, un pays (`gl`) et une langue (`hl`) affichent deux colonnes de résultats (Google / Bing), le score de chevauchement, les domaines partagés et l'âge du cache. Un bouton *Refresh* force un nouvel appel en ignorant le cache.
- **Tracking** — enregistre un couple requête/domaine, rafraîchit sa position à la demande, affiche l'historique sous forme de graphique SVG et exporte l'historique complet en CSV.
- **Mode démo** — l'application démarre immédiatement sans clé API. Le mode démo produit des résultats déterministes (basés sur un hash de la requête) pour tester l'ensemble du parcours sans dépendance externe.
- **Mode SerpApi** — en renseignant `SERPAPI_KEY`, l'application bascule automatiquement sur des résultats live. Les erreurs de clé invalide, quota épuisé, timeout et réseau sont interceptées et traduites en messages lisibles côté client.
- **Cache** — chaque recherche moteur/requête/pays/langue est mise en cache 24h ; un rafraîchissement explicite invalide le cache pour cette clé.
- **Rafraîchissement automatisable** — `POST /api/refresh` et le script `pnpm refresh` rejouent tous les suivis enregistrés, pour un déclenchement via cron.

## Stack technique

| Couche | Choix |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Backend | Node.js, Express 5, TypeScript |
| Validation | Zod |
| Persistance | Fichier JSON local par défaut, MySQL si `DATABASE_URL` est fourni |
| Tests | Vitest, coverage v8 |
| Lint | ESLint (flat config), typescript-eslint, eslint-plugin-react-hooks |
| CI | GitHub Actions |
| Déploiement | Dockerfile multi-stage (build Vite + tsc, runtime Node alpine) |

## Architecture

```
client/src/        interface React (pages Compare et Tracking, appels API)
server/
  domain/          types, erreurs typées (SerpError), utilitaires purs
  services/        SerpApiClient (appel externe + mode démo), SerpFetcher (cache), comparison (calcul du chevauchement)
  repositories/     JsonStore (fichier local) et MysqlStore (SQL), sélectionnées par createStore()
  app.ts           routes Express, validation Zod, rate limiting, gestion d'erreurs
  index.ts         point d'entrée (écoute HTTP)
  refresh.ts        script CLI qui appelle POST /api/refresh
tests/              tests unitaires et d'intégration (Vitest)
public/             logo, manifeste de routes
```

Le serveur sert les fichiers construits (`dist/client`) et les routes `/api/*` sous une seule origine, ce qui évite les problèmes CORS.

## Installation

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Ouvrir `http://localhost:3000`. La persistance locale utilise `data/serp-compare.json` par défaut. Si `DATABASE_URL` pointe vers une URL MySQL, le serveur crée automatiquement les trois tables nécessaires (`search_results`, `tracked_keywords`, `snapshots`) au démarrage.

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `SERPAPI_KEY` | Active le mode live SerpApi. Laissée vide, l'application reste en mode démo. | *(vide)* |
| `DATABASE_URL` | URL MySQL (`mysql://...`). Absente, le stockage retombe sur un fichier JSON local. | *(vide)* |
| `PORT` | Port d'écoute du serveur Express. | `3000` |
| `NODE_ENV` | À laisser **vide en local**. Vite lit ce fichier `.env` au build : `NODE_ENV=development` y force `pnpm build` en mode développement (bundle non minifié, ~2x plus lourd). Le Dockerfile le fixe lui-même à `production` au runtime. | *(vide)* |

## Scripts

```bash
pnpm dev             # serveur de dev (tsx watch, mode démo par défaut)
pnpm lint            # ESLint sur tout le repo
pnpm typecheck       # tsc --noEmit côté serveur puis côté client
pnpm test            # tests Vitest
pnpm test:coverage   # tests + rapport de couverture (seuil 80% statements/lines)
pnpm build           # build client (Vite) puis serveur (tsc)
pnpm start           # lance le serveur compilé (dist-server)
pnpm refresh         # rejoue tous les suivis via POST /api/refresh (CLI)
```

## API

Toutes les routes `/api/*` sont limitées à 60 requêtes/minute par IP.

- `GET /health` — état du serveur et mode demo/SerpApi.
- `GET /api/config` — expose `{ demoMode, cacheTtlHours }` pour l'UI.
- `GET /api/compare?q=react&gl=us&hl=en&refresh=0` — comparaison Google/Bing.
- `GET /api/tracked` — liste des suivis.
- `POST /api/tracked` — crée un suivi avec `{ query, domain, gl, hl }`.
- `POST /api/tracked/:id/refresh` — enregistre un snapshot pour un suivi.
- `GET /api/tracked/:id/history` — renvoie l'historique d'un suivi.
- `GET /api/tracked/:id/export.csv` — export CSV de l'historique.
- `DELETE /api/tracked/:id` — supprime un suivi.
- `POST /api/refresh` — rafraîchit tous les suivis enregistrés.

## Tests et couverture

```bash
pnpm test
pnpm test:coverage
```

La suite couvre : le calcul de chevauchement, le cache du fetcher, le parsing SerpApi, le mapping d'erreurs (`invalid_key`/`quota_exhausted`/`timeout`/`network`/`provider`, testé via un `fetch` mocké), le repository JSON (cycle CRUD complet, expiration du cache, relecture d'un fichier existant) et toutes les routes de l'API.

Le repository MySQL est testé en conditions réelles quand `TEST_DATABASE_URL` est défini (sinon ces tests sont automatiquement passés) :

```bash
TEST_DATABASE_URL="mysql://root:pass@127.0.0.1:3306/serpcompare" pnpm test
```

La couverture serveur est vérifiée avec un seuil (80% lignes/statements, configuré dans `vitest.config.ts`).

## Intégration continue

`.github/workflows/ci.yml` exécute à chaque push/PR sur `main` : `pnpm lint`, `pnpm typecheck`, `pnpm test:coverage` (avec un service MySQL éphémère pour couvrir le `MysqlStore`) et `pnpm build`.

## Déploiement

Le Dockerfile compile le frontend Vite et le serveur TypeScript dans un stage `build`, puis installe uniquement les dépendances de production dans un stage `runtime` séparé (image finale légère, `NODE_ENV=production` fixé explicitement). Express sert le build sur le port fourni par l'environnement. L'endpoint `/health` est prévu pour la sonde de santé. Les assets construits sont servis avec un cache long en production, les routes API restent dynamiques et non mises en cache HTTP.

```bash
docker build -t serpcompare .
docker run -p 3000:3000 -e SERPAPI_KEY=... -e DATABASE_URL=... serpcompare
```

## Direction visuelle

L'interface suit la direction « Signal Atlas » : dashboard éditorial sombre, palette bleu-nuit/cyan/violet, typographies Space Grotesk / Inter / IBM Plex Mono. Détails complets dans [`ideas.md`](ideas.md). Le plan d'implémentation original est dans [`plan.md`](plan.md).

## Licence

MIT — voir [`LICENSE`](LICENSE).
