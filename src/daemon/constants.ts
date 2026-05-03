import { homedir } from 'os';
import { join } from 'path';

export const SESSION_DIR = join(homedir(), '.xcli-v2', 'sessions');
export const DAEMON_CONFIG_PATH = join(SESSION_DIR, 'daemon.json');
export const DAEMON_SOCKET_PATH = join(SESSION_DIR, 'daemon.sock');
export const DAEMON_PORT = 18900;
