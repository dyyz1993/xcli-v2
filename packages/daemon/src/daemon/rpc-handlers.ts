import { WorkerManager } from './worker-manager.js';
import {
  createSessionMeta,
  removeSession,
  clearAll,
  listSessions,
  generateId,
  findSession,
} from './session-store.js';
import type { IPCResponse } from '../ipc-types.js';

const workerManager = new WorkerManager();

function getSessionId(name: string): string | undefined {
  const session = findSession(name);
  return session?.id;
}

async function routeToWorker(
  sessionId: string,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  const response: IPCResponse = await workerManager.sendCommand(sessionId, {
    type: 'request',
    method,
    params,
    sessionId,
  });

  if (response.type === 'error') {
    throw new Error(response.error?.message || 'Worker command failed');
  }
  return response.result;
}

export { workerManager };

export async function handleRPCCommandAsync(
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const p = params ?? ({} as Record<string, unknown>);

  switch (method) {
    case 'session.open': {
      const id = generateId();
      createSessionMeta(p.name as string, p.url as string, id);
      await workerManager.spawnWorker(id);
      const result = await routeToWorker(id, 'session.create', {
        sessionId: id,
        name: p.name,
        url: p.url,
      });
      return result;
    }

    case 'session.close': {
      const sid = getSessionId(p.name as string);
      if (sid) {
        await routeToWorker(sid, 'session.close', { name: p.name });
        await workerManager.killWorker(sid);
        removeSession(p.name as string);
      }
      return { ok: true };
    }

    case 'session.closeAll': {
      const workerIds = workerManager.getActiveWorkers();
      for (const wid of workerIds) {
        try {
          await routeToWorker(wid, 'session.closeAll', {});
        } catch {
          // ignore errors during closeAll
        }
      }
      await workerManager.shutdown();
      clearAll();
      return { ok: true };
    }

    case 'session.list': {
      return { sessions: listSessions() };
    }

    case 'session.kill': {
      const killSid = getSessionId(p.name as string);
      if (killSid) {
        await workerManager.killWorker(killSid);
        removeSession(p.name as string);
      }
      return { ok: true };
    }

    case 'storage.get':
    case 'storage.set':
    case 'storage.clear':
    case 'page.html':
    case 'page.screenshot':
    case 'page.snapshot':
    case 'page.mouse':
    case 'page.click':
    case 'page.select':
    case 'page.check':
    case 'page.press':
    case 'page.get':
    case 'page.type':
    case 'page.fill':
    case 'page.scroll':
    case 'page.eval':
    case 'page.waitForSelector':
    case 'page.waitForTimeout':
    case 'page.goto':
    case 'page.navigate':
    case 'page.refresh':
    case 'page.verifySlider':
    case 'page.http':
    case 'page.fetch':
    case 'page.addCookie':
    case 'recorder.start':
    case 'recorder.stop':
    case 'recorder.status':
    case 'replay.start':
    case 'page.structure': {
      const sessionId = getSessionId(p.name as string);
      if (!sessionId) {
        throw new Error(`Session '${p.name}' not found`);
      }
      return routeToWorker(sessionId, method, p);
    }

    default:
      throw new Error(`Unknown method: ${method}`);
  }
}
