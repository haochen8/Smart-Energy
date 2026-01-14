"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const config_1 = require("./config");
const db_1 = require("./db");
const app_1 = require("./app");
let server = null;
let db = null;
let shutdownInProgress = false;
async function start() {
    if (config_1.config.timescaleEnabled) {
        db = new db_1.TimescaleClient(config_1.config);
        const ok = await db.ping();
        if (!ok) {
            console.warn('TimescaleDB not reachable at startup');
        }
    }
    const app = (0, app_1.createApp)(db);
    server = (0, http_1.createServer)(app);
    server.listen(config_1.config.port, () => {
        console.log(`REST API listening on port ${config_1.config.port}`);
    });
    setupGracefulShutdown();
}
async function shutdown(signal) {
    if (shutdownInProgress)
        return;
    shutdownInProgress = true;
    console.log(JSON.stringify({ level: 'info', msg: 'shutdown', signal }));
    if (server) {
        await new Promise((resolve) => {
            server?.close(() => resolve());
        });
    }
    if (db) {
        try {
            await db.close();
        }
        catch (err) {
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
