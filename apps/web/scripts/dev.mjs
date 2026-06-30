import { createWebServer } from './vite.shared.mjs';

const server = await createWebServer();
await server.listen();
server.printUrls();

const keepAlive = setInterval(() => undefined, 60_000);

async function close() {
  clearInterval(keepAlive);
  await server.close();
  process.exit(0);
}

process.once('SIGINT', close);
process.once('SIGTERM', close);
