import { spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'fs';
import { SESSION_DIR, DAEMON_CONFIG_PATH, DAEMON_PORT } from '../constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function getDaemonPid(): number {
  if (!existsSync(DAEMON_CONFIG_PATH)) {
    return 0;
  }
  try {
    const config = JSON.parse(readFileSync(DAEMON_CONFIG_PATH, 'utf-8'));
    return config.pid || 0;
  } catch {
    return 0;
  }
}

function removeDaemonPort() {
  if (existsSync(DAEMON_CONFIG_PATH)) {
    unlinkSync(DAEMON_CONFIG_PATH);
  }
}

export function isDaemonRunning(): boolean {
  const port = getDaemonPort();
  if (!port) return false;

  try {
    process.kill(getDaemonPid(), 0);
    return true;
  } catch {
    removeDaemonPort();
    return false;
  }
}

export async function startDaemon(): Promise<{ port: number; pid: number }> {
  if (isDaemonRunning()) {
    const port = getDaemonPort();
    const pid = getDaemonPid();
    return { port, pid };
  }

  const daemonScript = join(__dirname, 'session-daemon.js');

  const child = spawn('node', [daemonScript], {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  return new Promise((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        removeDaemonPort();
        reject(new Error('Daemon start timeout'));
      }
    }, 15000);

    const checkInterval = setInterval(() => {
      if (existsSync(DAEMON_CONFIG_PATH)) {
        try {
          const config = JSON.parse(readFileSync(DAEMON_CONFIG_PATH, 'utf-8'));
          if (config.port === DAEMON_PORT && config.pid) {
            resolved = true;
            clearTimeout(timeout);
            clearInterval(checkInterval);
            resolve({ port: config.port, pid: config.pid });
          }
        } catch {
          // ignore
        }
      }
    }, 100);

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        clearInterval(checkInterval);
        reject(err);
      }
    });
  });
}

export async function stopDaemon(): Promise<void> {
  if (!isDaemonRunning()) {
    removeDaemonPort();
    return;
  }

  const pid = getDaemonPid();
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ESRCH') {
      throw e;
    }
  }
  removeDaemonPort();
}

export function getDaemonStatus(): { running: boolean; port: number; pid: number } {
  const port = getDaemonPort();
  const pid = getDaemonPid();
  return {
    running: isDaemonRunning(),
    port,
    pid,
  };
}

export async function killAllDaemon(): Promise<void> {
  if (!isDaemonRunning()) {
    removeDaemonPort();
    return;
  }

  const pid = getDaemonPid();
  try {
    process.kill(pid, 'SIGKILL');
  } catch (e: unknown) {
    if ((e as { code?: string }).code !== 'ESRCH') {
      throw e;
    }
  }
  removeDaemonPort();

  const files = readdirSync(SESSION_DIR).filter(
    (f: string) => f.endsWith('.json') && f !== 'daemon.json'
  );
  for (const file of files) {
    try {
      unlinkSync(join(SESSION_DIR, file));
    } catch {
      // ignore
    }
  }
}
