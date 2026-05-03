import { fork, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { join } from 'path';
import type { IPCMessage, IPCResponse } from '../ipc-types.js';

interface WorkerEntry {
  process: ChildProcess;
  sessionId: string;
  status: 'starting' | 'ready' | 'busy' | 'crashed';
  lastHeartbeat: number;
}

interface PendingRequest {
  resolve: (value: IPCResponse) => void;
  reject: (reason: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
}

function generateRequestId(): string {
  return randomBytes(4).toString('hex');
}

export class WorkerManager extends EventEmitter {
  private workers: Map<string, WorkerEntry> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private commandQueues: Map<string, Promise<void>> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    super();
    this.startHealthCheck();
  }

  async spawnWorker(sessionId: string): Promise<void> {
    if (this.workers.has(sessionId)) {
      const existing = this.workers.get(sessionId);
      if (!existing) return;
      if (existing.status !== 'crashed') {
        return;
      }
      this.cleanupWorker(sessionId);
    }

    const workerPath = join(__dirname, 'worker-entry.js');
    const child = fork(workerPath, [], {
      stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env },
    });

    const entry: WorkerEntry = {
      process: child,
      sessionId,
      status: 'starting',
      lastHeartbeat: Date.now(),
    };

    this.workers.set(sessionId, entry);

    child.on('message', (msg: IPCResponse) => {
      this.handleWorkerMessage(sessionId, msg);
    });

    child.on('error', (err) => {
      console.error(`Worker ${sessionId} error:`, err.message);
      this.onWorkerCrash(sessionId);
    });

    child.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${sessionId} exited with code ${code}`);
        this.onWorkerCrash(sessionId);
      }
    });

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Worker ${sessionId} failed to start within timeout`));
      }, 15_000);

      const readyHandler = (msg: Record<string, unknown>) => {
        if (msg.type === 'event' && msg.event === 'ready') {
          clearTimeout(timeout);
          child.off('message', readyHandler);
          entry.status = 'ready';
          resolve();
        }
      };

      child.on('message', readyHandler);
      child.send({ type: 'init', sessionId });
    });
  }

  async killWorker(sessionId: string): Promise<void> {
    const entry = this.workers.get(sessionId);
    if (!entry) return;

    try {
      entry.process.send({ type: 'shutdown' });
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          entry.process.kill('SIGKILL');
          resolve();
        }, 5_000);
        entry.process.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    } catch {
      entry.process.kill('SIGKILL');
    }

    this.cleanupWorker(sessionId);
  }

  async sendCommand(sessionId: string, message: Omit<IPCMessage, 'id'>): Promise<IPCResponse> {
    const entry = this.workers.get(sessionId);
    if (!entry || entry.status === 'crashed') {
      return {
        id: '',
        type: 'error',
        error: {
          code: 'WORKER_NOT_FOUND',
          message: `No active worker for session '${sessionId}'`,
          tips: ['Create a session first using session.open'],
        },
      };
    }

    const prev = this.commandQueues.get(sessionId) || Promise.resolve();
    let resolveResult!: (value: IPCResponse) => void;
    let rejectResult!: (reason: unknown) => void;
    const resultPromise = new Promise<IPCResponse>((res, rej) => {
      resolveResult = res;
      rejectResult = rej;
    });

    const chain = prev.then(async () => {
      try {
        const result = await this.sendCommandInternal(sessionId, message);
        resolveResult(result);
      } catch (err) {
        rejectResult(err);
      }
    });
    this.commandQueues.set(
      sessionId,
      chain.catch(() => {})
    );

    return resultPromise;
  }

  private async sendCommandInternal(
    sessionId: string,
    message: Omit<IPCMessage, 'id'>
  ): Promise<IPCResponse> {
    const entry = this.workers.get(sessionId);
    if (!entry || entry.status === 'crashed') {
      return {
        id: '',
        type: 'error',
        error: {
          code: 'WORKER_NOT_FOUND',
          message: `Worker for session '${sessionId}' is not available`,
          tips: [],
        },
      };
    }

    const id = generateRequestId();
    const fullMessage: IPCMessage = { ...message, id, sessionId };

    return new Promise<IPCResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${id} timed out after ${REQUEST_TIMEOUT}ms`));
      }, REQUEST_TIMEOUT);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      entry.status = 'busy';
      entry.process.send(fullMessage);
    });
  }

  getWorkerStatus(sessionId: string): WorkerEntry['status'] | null {
    return this.workers.get(sessionId)?.status ?? null;
  }

  getActiveWorkers(): string[] {
    return Array.from(this.workers.entries())
      .filter(([, e]) => e.status !== 'crashed')
      .map(([id]) => id);
  }

  onWorkerCrash(sessionId: string): void {
    const entry = this.workers.get(sessionId);
    if (entry) {
      entry.status = 'crashed';
      this.cleanupPendingForSession(sessionId);

      for (const [id, pending] of this.pendingRequests.entries()) {
        clearTimeout(pending.timeout);
        pending.resolve({
          id,
          type: 'error',
          error: {
            code: 'WORKER_CRASHED',
            message: `Worker for session '${sessionId}' has crashed`,
            tips: ['Try restarting the session'],
          },
        });
      }
    }

    this.emit('worker:crash', sessionId);
  }

  async shutdown(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    const killPromises = Array.from(this.workers.keys()).map((id) => this.killWorker(id));
    await Promise.allSettled(killPromises);

    this.workers.clear();
    this.pendingRequests.clear();
    this.commandQueues.clear();
  }

  private handleWorkerMessage(sessionId: string, msg: IPCResponse): void {
    const entry = this.workers.get(sessionId);
    if (!entry) return;

    if (msg.type === 'response' || msg.type === 'error') {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.id);
        entry.status = 'ready';
        pending.resolve(msg);
      }
    }

    if ((msg as unknown as Record<string, unknown>).type === 'event') {
      const eventMsg = msg as unknown as Record<string, unknown>;
      if (eventMsg.event === 'heartbeat') {
        entry.lastHeartbeat = Date.now();
      }
    }
  }

  private startHealthCheck(): void {
    this.heartbeatTimer = setInterval(() => {
      for (const [sessionId, entry] of this.workers) {
        if (entry.status !== 'crashed' && Date.now() - entry.lastHeartbeat > HEARTBEAT_TIMEOUT) {
          console.warn(`Worker ${sessionId} heartbeat timeout, marking as crashed`);
          this.onWorkerCrash(sessionId);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  private cleanupWorker(sessionId: string): void {
    const entry = this.workers.get(sessionId);
    if (entry) {
      try {
        if (entry.process.connected) {
          entry.process.kill('SIGKILL');
        }
      } catch {
        // process may already be dead
      }
    }
    this.workers.delete(sessionId);
    this.commandQueues.delete(sessionId);
  }

  private cleanupPendingForSession(sessionId: string): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      if (id.startsWith(sessionId)) {
        clearTimeout(pending.timeout);
        pending.resolve({
          id,
          type: 'error',
          error: {
            code: 'WORKER_CRASHED',
            message: `Worker for session '${sessionId}' has crashed`,
            tips: [],
          },
        });
        this.pendingRequests.delete(id);
      }
    }
  }
}
