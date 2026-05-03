export type { SessionMeta } from './daemon/session-store.js';
export {
  sessions,
  wsConnections,
  findSession,
  createSessionMeta,
  removeSession,
  clearAll,
  listSessions,
  generateId,
} from './daemon/session-store.js';
export { handleRPCCommandAsync, workerManager } from './daemon/rpc-handlers.js';
export { startHttpServer } from './daemon/http-server.js';
export { setupWebSocket } from './daemon/ws-handler.js';
export type { IPCMessage, IPCResponse } from './ipc-types.js';
export { WorkerManager } from './daemon/worker-manager.js';
export { setScreencastCallback } from './daemon/worker-entry.js';
export {
  isDaemonRunning,
  startDaemon,
  stopDaemon,
  getDaemonStatus,
  killAllDaemon,
} from './daemon-manager.js';
