import { randomBytes } from 'crypto';
import type WebSocket from 'ws';

export interface SessionMeta {
  id: string;
  name: string;
  url: string;
}

export const sessions = new Map<string, SessionMeta>();
export const wsConnections = new Map<string, Set<WebSocket>>();

function generateSessionId(): string {
  return randomBytes(4).toString('hex');
}

export function generateId(): string {
  return generateSessionId();
}

export function findSession(name: string): SessionMeta | undefined {
  for (const [, session] of sessions) {
    if (session.name === name) return session;
  }
  return undefined;
}

export function createSessionMeta(sessionName: string, url: string, id?: string): SessionMeta {
  const sessionId = id || generateSessionId();
  const meta: SessionMeta = { id: sessionId, name: sessionName, url };
  sessions.set(sessionId, meta);
  wsConnections.set(sessionId, new Set());
  return meta;
}

export function removeSession(name: string): SessionMeta | undefined {
  for (const [id, session] of sessions) {
    if (session.name === name) {
      sessions.delete(id);
      wsConnections.delete(id);
      return session;
    }
  }
  return undefined;
}

export function clearAll(): void {
  sessions.clear();
  wsConnections.clear();
}

export function listSessions(): Array<{ id: string; name: string }> {
  return Array.from(sessions.values()).map((s) => ({ id: s.id, name: s.name }));
}
