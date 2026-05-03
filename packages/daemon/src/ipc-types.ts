export interface IPCMessage {
  id: string;
  type: 'request' | 'response' | 'event' | 'error';
  method: string;
  params: Record<string, unknown>;
  sessionId: string;
}

export interface IPCResponse {
  id: string;
  type: 'response' | 'error';
  result?: unknown;
  error?: { code: string; message: string; tips: string[] };
}
