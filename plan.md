# Plan d’implémentation — SERP Compare

## Objectif
Construire une application web complète qui compare les 10 premiers résultats organiques Google et Bing pour une requête, calcule le chevauchement des domaines, met en cache les résultats, et suit l’évolution de la position d’un domaine dans le temps.

## Choix d’architecture
- **Frontend** : React + TypeScript + Vite, rendu côté navigateur (SPA) pour une interface interactive et légère.
- **Backend** : Node.js + Express + TypeScript, API JSON sous `/api` et service des fichiers statiques construits.
- **Persistance** : base SQL compatible avec `DATABASE_URL` fournie par la plateforme, avec un adaptateur SQLite local de secours pour le mode sandbox/demo. Schéma idempotent créé au démarrage.
- **Données de recherche** : `SerpApiClient` utilisant `fetch` côté serveur, avec mode démo déterministe lorsque `SERPAPI_KEY` est absente.
- **Cache** : table `search_results`, clé logique moteur + requête + gl + hl, réutilisation pendant 24 h, invalidation explicite au rafraîchissement.
- **API** : routes REST pour comparaison, suivis, snapshots et CSV. Les erreurs sont transformées en messages contextualisés et en statuts HTTP stables.
- **Déploiement** : un serveur Express sert le build frontend et les API sur `PORT`/`0.0.0.0`; le chemin `/health` répond sans authentification. Les assets versionnés sont cacheables, les API sont privées/non stockées.

## Modules principaux
- `server/domain/types.ts` : contrats de données explicites.
- `server/services/serp-api-client.ts` : appel SerpApi, parsing Google/Bing, erreurs typées.
- `server/services/comparison.ts` : domaines normalisés, résultats partagés, score.
- `server/services/serp-fetcher.ts` : cache et orchestration moteur/API.
- `server/repositories/database.ts` : schéma et accès aux suivis, snapshots et résultats.
- `server/app.ts` : Express, validation, routes et gestion d’erreurs.
- `client/src/` : navigation, écrans Compare/Tracking, graphiques SVG, formulaires accessibles.
- `public/manus-routes.json` : manifeste des routes web.
- `tests/` : tests unitaires et API avec Vitest.

## Parcours livrés
1. Comparer une requête avec paramètres `gl` et `hl`, voir Google et Bing côte à côte.
2. Voir le score de chevauchement et mettre en évidence les domaines communs.
3. Recharger les données en ignorant le cache ; afficher l’âge des données.
4. Ajouter un suivi requête/domaine ; consulter la liste et rafraîchir un suivi.
5. Voir l’historique des positions dans un graphique responsive.
6. Exporter un historique en CSV.
7. Utiliser le mode démo sans clé et basculer automatiquement vers SerpApi si la clé existe.
8. Afficher des erreurs utiles pour validation, clé invalide, quota, timeout et réseau.
9. Fournir un endpoint de rafraîchissement automatisable (`POST /api/refresh`) et un script CLI `npm run refresh`.

## Direction de déploiement
Le frontend est compilé dans `dist/client`, mais le serveur Express sert également ce répertoire pour conserver un seul origin et éviter les problèmes CORS. Les routes `/api/*` et `/health` sont dynamiques ; les autres chemins sont renvoyés vers l’SPA. Le cache HTTP est désactivé pour les API et l’HTML, et activé longuement pour les assets hashés en production.

## Vérification
- `npm run typecheck` pour TypeScript.
- `npm test` pour les tests Vitest.
- `npm run build` pour compiler le frontend et le backend.
- Démarrage sur le port déclaré puis vérification HTTP de `/health`, `/manus-routes.json`, `/api/compare` et du fallback SPA.
- Inspection du code pour cohérence des contrats frontend/backend et robustesse des erreurs.
