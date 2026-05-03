import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import type { Cookie } from 'playwright-core';
import type { IPCMessage, IPCResponse } from '../ipc-types.js';
import { executePageCommand } from '@xcli-v2/browser-engine';
import { mpageCommandMap, executeMpageCommand } from './worker-commands.js';
import {
  handleStorageGet,
  handleStorageSet,
  handleStorageClear,
  handleSnapshot,
  handleMouse,
  handleGet,
  handleNavigate,
  handleFetch,
  handleVerifySlider,
} from './worker-command-handlers.js';
import {
  handleWsInitScreencast,
  handleRecorderStart,
  handleRecorderStop,
  handleRecorderStatus,
  handleReplayStart,
} from './worker-recorder-ws.js';

interface WorkerSession {
  id: string;
  name: string;
  context: BrowserContext;
  page: Page;
  recorder?: import('@xcli-v2/browser-engine').RecorderController;
  screencastSessionId?: number;
}

type ScreencastFrameCallback = (frame: {
  data: string;
  sessionId: number;
  viewport: { width: number; height: number } | null;
}) => void;

let screencastCallback: ScreencastFrameCallback | null = null;

export function setScreencastCallback(cb: ScreencastFrameCallback): void {
  screencastCallback = cb;
}

const sessions = new Map<string, WorkerSession>();
let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser) return browser;
  const executablePath =
    process.env.XCLI_CHROMIUM_PATH || '/Applications/Chromium.app/Contents/MacOS/Chromium';
  browser = await chromium.launch({ executablePath });
  return browser;
}

function findSession(name: string): WorkerSession | undefined {
  for (const [, session] of sessions) {
    if (session.name === name) return session;
  }
  return undefined;
}

async function executeCommand(msg: IPCMessage): Promise<unknown> {
  const { method, params } = msg;
  const p = params ?? {};

  switch (method) {
    case 'session.create': {
      const b = await getBrowser();
      const context = await b.newContext();
      const page = await context.newPage();
      await page.goto(p.url as string);
      const session: WorkerSession = {
        id: p.sessionId as string,
        name: p.name as string,
        context,
        page,
      };
      sessions.set(session.id, session);
      return { id: session.id, name: session.name };
    }

    case 'session.close': {
      for (const [id, session] of sessions) {
        if (session.name === p.name) {
          await session.context.close();
          sessions.delete(id);
          return { ok: true };
        }
      }
      return { ok: true };
    }

    case 'session.closeAll': {
      for (const [, session] of sessions) {
        await session.context.close();
      }
      sessions.clear();
      return { ok: true };
    }

    case 'session.list': {
      return {
        sessions: Array.from(sessions.values()).map((s) => ({ id: s.id, name: s.name })),
      };
    }

    case 'storage.get':
      return handleStorageGet(findSession(p.name as string), p);
    case 'storage.set':
      return handleStorageSet(findSession(p.name as string), p);
    case 'storage.clear':
      return handleStorageClear(findSession(p.name as string), p);
    case 'page.snapshot':
      return handleSnapshot(findSession(p.name as string), p);
    case 'page.mouse':
      return handleMouse(findSession(p.name as string), p);
    case 'page.get':
      return handleGet(findSession(p.name as string), p);
    case 'page.navigate':
      return handleNavigate(findSession(p.name as string), p);

    case 'page.eval': {
      const es = findSession(p.name as string);
      if (!es) return { error: 'Session not found' };
      try {
        return await executePageCommand(es.page, 'evaluateRaw', { script: p.script });
      } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
      }
    }

    case 'page.verifySlider':
      return handleVerifySlider(findSession(p.name as string), p);
    case 'page.http':
    case 'page.fetch':
      return handleFetch(findSession(p.name as string), p);

    case 'page.addCookie': {
      const acs = findSession(p.name as string);
      if (!acs) return { ok: false, error: 'Session not found' };
      await acs.context.addCookies([p.cookie as Cookie]);
      return { ok: true, cookie: p.cookie };
    }

    case 'recorder.start': {
      const recSession = findSession(p.name as string);
      if (!recSession) throw new Error('Session not found');
      const { recorder, result } = await handleRecorderStart(recSession.page, p);
      recSession.recorder = recorder;
      return result;
    }

    case 'recorder.stop': {
      const rSession = findSession(p.name as string);
      if (!rSession || !rSession.recorder) throw new Error('No active recorder for session');
      const result = await handleRecorderStop(rSession.recorder, p.outputPath as string | undefined);
      rSession.recorder = undefined;
      return result;
    }

    case 'recorder.status':
      return handleRecorderStatus(findSession(p.name as string)?.recorder);

    case 'replay.start': {
      const replaySession = findSession(p.name as string);
      if (!replaySession) throw new Error('Session not found');
      return handleReplayStart(replaySession.page, p);
    }

    case 'ws.initScreencast': {
      const wsSession = sessions.get(p.sessionId as string);
      if (!wsSession) return { ok: false, error: 'Session not found' };
      return handleWsInitScreencast({
        page: wsSession.page,
        context: wsSession.context,
        onFrame: (frame) => {
          wsSession.screencastSessionId = frame.sessionId;
          if (screencastCallback) screencastCallback(frame);
        },
      });
    }

    case 'ws.navigate': {
      const navSession = sessions.get(p.sessionId as string);
      if (!navSession) return { ok: false };
      await navSession.page.goto(p.url as string);
      return { ok: true };
    }

    case 'ws.click': {
      const clickSession = sessions.get(p.sessionId as string);
      if (!clickSession) return { ok: false };
      await clickSession.page.mouse.click(p.x as number, p.y as number);
      return { ok: true };
    }

    case 'ws.mousemove': {
      const moveSession = sessions.get(p.sessionId as string);
      if (!moveSession) return { ok: false };
      await moveSession.page.mouse.move(p.x as number, p.y as number);
      return { ok: true };
    }

    case 'ws.key': {
      const keySession = sessions.get(p.sessionId as string);
      if (!keySession) return { ok: false };
      await keySession.page.keyboard.press(p.key as string);
      return { ok: true };
    }

    default: {
      if (method in mpageCommandMap) {
        const session = findSession(p.name as string);
        if (!session) return { ok: false, error: 'Session not found' };
        return executeMpageCommand(session.page, mpageCommandMap[method], p);
      }
      throw new Error(`Unknown method: ${method}`);
    }
  }
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

function sendToParent(msg: IPCResponse | Record<string, unknown>): void {
  if (process.send) process.send(msg);
}

function startHeartbeat(): void {
  heartbeatInterval = setInterval(() => {
    sendToParent({ type: 'event', event: 'heartbeat' });
  }, 5000);
}

async function cleanup(): Promise<void> {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  for (const [, session] of sessions) {
    try {
      await session.context.close();
    } catch {
      // ignore
    }
  }
  sessions.clear();
  if (browser) {
    try {
      await browser.close();
    } catch {
      // ignore
    }
    browser = null;
  }
}

process.on('message', async (msg: IPCMessage | Record<string, unknown>) => {
  if ('type' in msg && msg.type === 'init') {
    startHeartbeat();
    sendToParent({ type: 'event', event: 'ready', sessionId: msg.sessionId });
    return;
  }

  if ('type' in msg && msg.type === 'shutdown') {
    await cleanup();
    process.exit(0);
    return;
  }

  if ('type' in msg && msg.type === 'request') {
    const ipcMsg = msg as IPCMessage;
    try {
      const result = await executeCommand(ipcMsg);
      sendToParent({ id: ipcMsg.id, type: 'response', result: result ?? null });
    } catch (err) {
      sendToParent({
        id: ipcMsg.id,
        type: 'error',
        error: {
          code: 'COMMAND_ERROR',
          message: err instanceof Error ? err.message : String(err),
          tips: [],
        },
      });
    }
  }
});

process.on('SIGINT', async () => {
  await cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await cleanup();
  process.exit(0);
});
