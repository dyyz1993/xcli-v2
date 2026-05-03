import type { XCLIAPI } from '@dyyz1993/xcli-core';
import { registerBrowserCommands } from './browser-cmds.js';
import { registerAdvancedCommands } from './advanced-cmds.js';
import { registerSystemCommands } from './system-cmds.js';
import { registerRecorderCommands } from './recorder-cmds.js';

interface BuiltinDeps {
  startDaemon: () => Promise<{ port: number; pid: number }>;
  stopDaemon: () => Promise<void>;
  getDaemonStatus: () => { running: boolean; pid?: number; port?: number };
  killAllDaemon: () => Promise<void>;
  isDaemonRunning: () => boolean;
}

export function registerBuiltins(xcli: XCLIAPI, deps: BuiltinDeps): void {
  const site = xcli.createSite({
    name: 'xcli',
    url: 'builtin://xcli',
  });

  registerBrowserCommands(site, deps);
  registerAdvancedCommands(site, deps);
  registerSystemCommands(site, deps);
  registerRecorderCommands(site, deps);
}

export default function (xcli: XCLIAPI): void {
  registerBuiltins(xcli, {
    startDaemon: async () => {
      const { startDaemon } = await import('@dyyz1993/xcli-core');
      return startDaemon();
    },
    stopDaemon: async () => {
      const { stopDaemon } = await import('@dyyz1993/xcli-core');
      await stopDaemon();
    },
    getDaemonStatus: () => {
      const { getDaemonStatus } = require('@dyyz1993/xcli-core') as typeof import('@dyyz1993/xcli-core');
      return getDaemonStatus();
    },
    killAllDaemon: async () => {
      const { killAllDaemon } = await import('@dyyz1993/xcli-core');
      await killAllDaemon();
    },
    isDaemonRunning: () => {
      const { isDaemonRunning } = require('@dyyz1993/xcli-core') as typeof import('@dyyz1993/xcli-core');
      return isDaemonRunning();
    },
  });
}
