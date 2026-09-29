import { createApp } from './app.js';
import { createStore } from './repositories/database.js';

const port = Number(process.env.PORT ?? 3000);
const host = '0.0.0.0';
const store = createStore();
await store.init();
const app = createApp(store);

app.listen(port, host, () => {
  console.log(`SERP Compare listening on http://${host}:${port} (${process.env.SERPAPI_KEY ? 'SerpApi' : 'demo'} mode)`);
});
