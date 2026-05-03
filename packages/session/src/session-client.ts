import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn } from 'child_process';
import { SESSION_DIR, DAEMON_CONFIG_PATH } from '@dyyz1993/xcli-core';
import type { SessionInfo } from '@dyyz1993/xcli-core';

function ensureSessionDir() {
  mkdirSync(SESSION_DIR, { recursive: true });
}

function getDaemonPort(): number {
  if (!existsSync(DAEMON_CONFIG_PATH)) {
    return 0;
  }
  try {
    const config = JSON.parse(readFileSync(DAEMON_CONFIG_PATH, 'utf-8'));
    return config.port || 0;
  } catch {
    return 0;
  }
}

async function ensureDaemon(): Promise<void> {
  const port = getDaemonPort();
  if (port > 0) {
    try {
      const res = await fetch(`http://localhost:${port}/api/sessions`);
      if (res.ok) return;
    } catch {
      // daemon not reachable
    }
  }

  const xcliDir = process.cwd();
  const daemonPath = join(xcliDir, 'dist', 'session-daemon.cjs');
  const child = spawn('node', [daemonPath], {
    detached: true,
    stdio: 'ignore',
    cwd: xcliDir,
  });
  child.unref();

  const startTime = Date.now();
  while (Date.now() - startTime < 15000) {
    const p = getDaemonPort();
    if (p > 0) {
      try {
        const res = await fetch(`http://localhost:${p}/api/sessions`);
        if (res.ok) return;
      } catch {
        // still waiting
      }
    }
    await new Promise<void>((r) => {
      setTimeout(r, 500);
    });
  }
  throw new Error('Failed to start daemon');
}

export async function daemonRequest(
  method: string,
  params?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  await ensureDaemon();
  const port = getDaemonPort();
  if (!port) {
    throw new Error('Daemon not running. Use "xcli daemon" to start.');
  }

  const res = await fetch(`http://localhost:${port}/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status}`);
  }

  const result = await res.json();
  if (result.error) {
    throw new Error(result.error);
  }
  return result;
}

export function requireSession(name?: string): string {
  const sessionName = name || 'default';
  const sessionFile = join(SESSION_DIR, `${sessionName}.json`);
  if (!existsSync(sessionFile)) {
    throw new Error(`Session '${sessionName}' not found. Use "xcli open <url>" to create one.`);
  }
  return sessionName;
}

export async function getSession(name: string): Promise<SessionInfo | null> {
  const path = join(SESSION_DIR, `${name}.json`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}

export async function saveSession(session: SessionInfo): Promise<void> {
  const path = join(SESSION_DIR, `${session.name}.json`);
  writeFileSync(path, JSON.stringify(session, null, 2));
}

export async function openSession(name: string, url: string): Promise<SessionInfo> {
  ensureSessionDir();
  const result = (await daemonRequest('session.open', { name, url })) as { id: string };
  const session: SessionInfo = {
    id: result.id,
    name,
    url,
    createdAt: new Date().toISOString(),
  };
  await saveSession(session);
  return session;
}

export async function htmlSession(name?: string): Promise<string> {
  const sessionName = requireSession(name);
  const result = (await daemonRequest('page.html', { name: sessionName })) as { html: string };
  return result.html;
}

export async function screenshotSession(name?: string): Promise<string> {
  const sessionName = requireSession(name);
  const result = (await daemonRequest('page.screenshot', { name: sessionName })) as {
    screenshot: string;
  };
  return `data:image/png;base64,${result.screenshot}`;
}

export interface SnapshotElement {
  ref: string;
  tag: string;
  text: string;
  attrs: Record<string, string>;
}

export async function snapshotSession(
  name?: string,
  interactiveOnly = false
): Promise<SnapshotElement[]> {
  const sessionName = requireSession(name);
  const result = (await daemonRequest('page.snapshot', {
    name: sessionName,
    interactiveOnly,
  })) as { elements: SnapshotElement[] };
  return result.elements || [];
}

export async function listSessions(): Promise<Array<{ id: string; name: string }>> {
  await ensureDaemon();
  const port = getDaemonPort();
  if (!port) return [];
  try {
    const res = await fetch(`http://localhost:${port}/api/sessions`);
    if (res.ok) {
      return await res.json();
    }
  } catch {
    // daemon not reachable
  }
  return [];
}

export async function closeSession(name: string): Promise<void> {
  await daemonRequest('session.close', { name });
}

export async function killDaemon(): Promise<void> {
  await daemonRequest('session.kill', {});
}

export async function closeAllSessions(): Promise<void> {
  await daemonRequest('session.closeAll');
}

export async function evalScriptSession(name: string, script: string): Promise<unknown> {
  const sessionName = requireSession(name);
  const result = (await daemonRequest('page.eval', { name: sessionName, script })) as {
    result: unknown;
  };
  return result.result;
}

export async function waitForSelector(
  name: string,
  selector: string,
  timeout = 30000
): Promise<boolean> {
  const sessionName = requireSession(name);
  const result = (await daemonRequest('page.waitForSelector', {
    name: sessionName,
    selector,
    timeout,
  })) as { found: boolean };
  return result.found;
}

export async function waitForTimeout(name: string, timeout: number): Promise<void> {
  const sessionName = requireSession(name);
  await daemonRequest('page.waitForTimeout', { name: sessionName, timeout });
}

export async function navigateSession(
  name: string,
  direction: 'back' | 'forward'
): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.navigate', { name: sessionName, direction })) as {
    ok: boolean;
  };
}

export async function refreshSession(name: string): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.refresh', { name: sessionName })) as { ok: boolean };
}

export async function gotoSession(name: string, url: string): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.goto', { name: sessionName, url })) as { ok: boolean };
}

export async function pressSession(
  name: string,
  key: string,
  selector?: string
): Promise<{ ok: boolean; key: string }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.press', { name: sessionName, key, selector })) as {
    ok: boolean;
    key: string;
  };
}

export async function getElementSession(
  name: string,
  property: string,
  selector?: string
): Promise<{ ok: boolean; value: string }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.get', { name: sessionName, property, selector })) as {
    ok: boolean;
    value: string;
  };
}

export async function scrollSession(
  name: string,
  direction: 'up' | 'down',
  distance = 500
): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.scroll', { name: sessionName, direction, distance })) as {
    ok: boolean;
  };
}

export async function clickSession(name: string, selector: string): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.click', { name: sessionName, selector })) as { ok: boolean };
}

export async function selectSession(
  name: string,
  selector: string,
  value: string
): Promise<{ ok: boolean; value: string }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.select', { name: sessionName, selector, value })) as {
    ok: boolean;
    value: string;
  };
}

export async function checkSession(name: string, selector: string): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.check', { name: sessionName, selector })) as { ok: boolean };
}

export async function typeSession(
  name: string,
  selector: string,
  text: string
): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.type', { name: sessionName, selector, text })) as {
    ok: boolean;
  };
}

export async function fillSession(
  name: string,
  selector: string,
  text: string
): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.fill', { name: sessionName, selector, text })) as {
    ok: boolean;
  };
}

export async function mouseSession(
  name: string,
  action: 'move' | 'down' | 'up' | 'click',
  x?: number,
  y?: number,
  steps?: number
): Promise<{ ok: boolean }> {
  const sessionName = requireSession(name);
  return (await daemonRequest('page.mouse', {
    name: sessionName,
    action,
    x: x || 0,
    y: y || 0,
    steps,
  })) as { ok: boolean };
}
