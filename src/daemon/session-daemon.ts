import { createServer as createNetServer } from 'net';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { startHttpServer } from './daemon/http-server.js';
import { setupWebSocket } from './daemon/ws-handler.js';
import { handleRPCCommandAsync, workerManager } from './daemon/rpc-handlers.js';
import { clearAll } from './daemon/session-store.js';
import { SESSION_DIR, DAEMON_CONFIG_PATH, DAEMON_SOCKET_PATH, DAEMON_PORT } from './constants.js';

function ensureSessionDir() {
  mkdirSync(SESSION_DIR, { recursive: true });
}

function saveDaemonConfig(pid: number) {
  ensureSessionDir();
  const config = { pid, port: DAEMON_PORT, startedAt: new Date().toISOString() };
  writeFileSync(DAEMON_CONFIG_PATH, JSON.stringify(config));
}

async function main() {
  ensureSessionDir();

  if (existsSync(DAEMON_SOCKET_PATH)) {
    try {
      unlinkSync(DAEMON_SOCKET_PATH);
    } catch {
      // ignore unlink error
    }
  }

  const httpServer = startHttpServer(DAEMON_PORT);
  setupWebSocket(httpServer);

  const socketServer = createNetServer((socket) => {
    let data = '';
    socket.on('data', (chunk) => {
      data += chunk.toString();
    });
    socket.on('close', async () => {});
    socket.on('end', async () => {
      try {
        if (!data.trim()) {
          return;
        }
        const { method, params } = JSON.parse(data.trim());
        const result = await handleRPCCommandAsync(method, params);
        socket.write(JSON.stringify(result) + '\n');
        socket.end();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        try {
          socket.write(JSON.stringify({ error: message }) + '\n');
          socket.end();
        } catch {
          socket.end();
        }
      }
    });
    socket.on('error', () => {});
  });

  socketServer.listen(DAEMON_SOCKET_PATH, () => {
    console.log(`Daemon listening on ${DAEMON_SOCKET_PATH}`);
  });

  saveDaemonConfig(process.pid);

  process.on('SIGINT', async () => {
    await workerManager.shutdown();
    clearAll();
    httpServer.close();
    socketServer.close();
    process.exit(0);
  });
}

main().catch(console.error);
