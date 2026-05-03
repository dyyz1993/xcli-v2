import type WebSocket from 'ws';
import { WebSocketServer } from 'ws';
import { parse } from 'url';
import type { IncomingMessage } from 'http';
import type { Server } from 'http';
import type { Duplex } from 'stream';
import { sessions, wsConnections } from './session-store.js';
import { workerManager } from './rpc-handlers.js';

async function handleWebSocket(ws: WebSocket, sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    ws.close();
    return;
  }

  const conns = wsConnections.get(sessionId);
  if (conns) conns.add(ws);

  ws.on('close', () => {
    conns?.delete(ws);
  });

  ws.on('message', async (msg: WebSocket.RawData) => {
    try {
      const cmd = JSON.parse(msg.toString());
      const response = await workerManager.sendCommand(sessionId, {
        type: 'request',
        method: `ws.${cmd.type}`,
        params: { ...cmd, sessionId },
        sessionId,
      });

      if (response.type === 'response' && response.result) {
        const result = response.result as Record<string, unknown>;
        if (result.screenshot) {
          ws.send(
            JSON.stringify({
              type: 'screenshot',
              data: result.screenshot,
              viewport: result.viewport,
            })
          );
        }
      }
    } catch {
      // ignore message error
    }
  });

  const initResponse = await workerManager.sendCommand(sessionId, {
    type: 'request',
    method: 'ws.initScreencast',
    params: { sessionId },
    sessionId,
  });

  if (initResponse.type === 'error') {
    ws.close();
  }
}

export function setupWebSocket(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    const { pathname, query } = parse(req.url || '', true);
    if (pathname === '/ws') {
      const sessionId = query.s as string;
      wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
        handleWebSocket(ws, sessionId);
      });
    } else {
      socket.destroy();
    }
  });

  return wss;
}
