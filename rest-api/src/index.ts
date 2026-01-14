import { createServer, Server } from 'http';
import { config } from './config';
import { TimescaleClient } from './db';
import { createApp } from './app';
import { AlgorithmProcessorClient } from './algorithmProcessorClient';

let server: Server | null = null;
let db: TimescaleClient | null = null;
let shutdownInProgress = false;

async function start() {
  if (config.timescaleEnabled) {
    db = new TimescaleClient(config);
    const ok = await db.ping();
    if (!ok) {
      console.warn('TimescaleDB not reachable at startup');
    }
  }

  const predictionClient = config.algorithmProcessorBaseUrl
    ? new AlgorithmProcessorClient(config.algorithmProcessorBaseUrl, config.algorithmProcessorTimeoutMs)
    : null;
  const app = createApp(db, { predictionClient });
  server = createServer(app);
  server.listen(config.port, () => {
    console.log(`REST API listening on port ${'localhost'}:${config.port}${'/docs'}`);
  });

  setupGracefulShutdown();
}

async function shutdown(signal: string) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;
  console.log(JSON.stringify({ level: 'info', msg: 'shutdown', signal }));

  if (server) {
    await new Promise<void>((resolve) => {
      server?.close(() => resolve());
    });
  }
  if (db) {
    try {
      await db.close();
    } catch (err) {
      console.warn('Failed to close TimescaleDB pool', err);
    }
  }
  process.exit(0);
}

function setupGracefulShutdown() {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

start().catch((err) => {
  console.error('Failed to start REST API', err);
  process.exit(1);
});
