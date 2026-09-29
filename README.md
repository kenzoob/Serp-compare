# SERP Compare

SERP Compare compare les 10 premiers résultats organiques Google et Bing, met en évidence les domaines communs et suit la position d’un domaine au fil du temps.

## Fonctionnalités

La page **Compare** accepte une requête, un pays (`gl`) et une langue (`hl`). Elle affiche deux colonnes de résultats, le score de chevauchement et l’âge du cache. La page **Tracking** permet d’enregistrer un couple requête/domaine, de rafraîchir sa position et d’exporter l’historique en CSV.

L’application démarre immédiatement en mode démo sans clé API. Le mode démo produit des résultats déterministes réalistes afin de tester l’ensemble du parcours. Pour utiliser SerpApi, renseignez `SERPAPI_KEY`; les erreurs de clé, quota, timeout et réseau sont traduites en messages lisibles.

## Installation

```bash
pnpm install
cp .env.example .env
pnpm dev
```

Ouvrir `http://localhost:3000`. La persistance locale utilise `data/serp-compare.json`. Si `DATABASE_URL` est une URL MySQL, le serveur crée automatiquement les trois tables nécessaires (`search_results`, `tracked_keywords`, `snapshots`).

## Scripts

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm start
pnpm refresh
```

`pnpm refresh` appelle l’endpoint de rafraîchissement pour tous les suivis existants. En production, il peut être déclenché par un cron quotidien (par exemple `/api/refresh` avec une authentification réseau ajoutée selon l’hébergement).

## API

- `GET /health` — état du serveur et mode demo/SerpApi.
- `GET /api/compare?q=react&gl=us&hl=en&refresh=0` — comparaison Google/Bing.
- `GET /api/tracked` — liste des suivis.
- `POST /api/tracked` — crée un suivi avec `{ query, domain, gl, hl }`.
- `POST /api/tracked/:id/refresh` — enregistre un snapshot.
- `GET /api/tracked/:id/history` — renvoie l’historique.
- `GET /api/tracked/:id/export.csv` — export CSV.
- `DELETE /api/tracked/:id` — supprime un suivi.
- `POST /api/refresh` — rafraîchit tous les suivis.

## Déploiement

Le Dockerfile compile le frontend Vite et le serveur TypeScript, puis lance Express sur le port fourni par l’environnement. Le endpoint `/health` est prévu pour la sonde de santé. Les assets sont servis avec un cache long en production, tandis que les API restent dynamiques.

## Licence

MIT.
