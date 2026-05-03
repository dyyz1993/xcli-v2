import { z } from 'zod';
import { ok, fail } from '@dyyz1993/xcli-core';
import type { SiteInstance } from '@dyyz1993/xcli-core';
import { listSessions } from '../session/index.js';

interface BuiltinDeps {
  startDaemon: () => Promise<{ port: number; pid: number }>;
  stopDaemon: () => Promise<void>;
  getDaemonStatus: () => { running: boolean; pid?: number; port?: number };
  killAllDaemon: () => Promise<void>;
  isDaemonRunning: () => boolean;
}

export function registerSystemCommands(site: SiteInstance, deps: BuiltinDeps): void {
  site.command('daemon', {
    description: 'Manage daemon process',
    scope: 'project',
    params: z.object({
      action: z.enum(['start', 'stop', 'status']).default('status'),
    }),
    handler: async (params) => {
      try {
        if (params.action === 'start') {
          if (deps.isDaemonRunning()) {
            const status = deps.getDaemonStatus();
            return ok({ running: true, pid: status.pid, port: status.port });
          }
          const { port, pid } = await deps.startDaemon();
          return ok({ started: true, pid, port });
        }

        if (params.action === 'stop') {
          await deps.stopDaemon();
          return ok({ stopped: true });
        }

        const status = deps.getDaemonStatus();
        return ok({
          running: status.running,
          pid: status.pid,
          port: status.port,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('list', {
    description: 'List active sessions',
    scope: 'project',
    aliases: ['ls'],
    params: z.object({}).default({}),
    handler: async () => {
      try {
        const sessions = await listSessions();
        return ok({ sessions });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('plugins', {
    description: 'Manage plugins',
    scope: 'project',
    params: z.object({
      action: z.enum(['list', 'info', 'reload', 'unload', 'doctor']).default('list'),
      name: z.string().optional().describe('Plugin name for info/reload/unload'),
      global: z.boolean().default(false).describe('Filter global plugins'),
      project: z.boolean().default(false).describe('Filter project plugins'),
    }),
    handler: async (params) => {
      try {
        if (params.action === 'list') {
          return ok({ action: 'list', message: 'Plugin listing delegated to plugin system' });
        }
        if (!params.name && params.action !== 'doctor') {
          return fail('Plugin name required for this action');
        }
        return ok({ action: params.action, name: params.name });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('config', {
    description: 'Manage configuration',
    scope: 'project',
    params: z.object({
      action: z.enum(['get', 'set', 'list']).default('list'),
      key: z.string().optional().describe('Config key'),
      value: z.string().optional().describe('Config value'),
    }),
    handler: async (params) => {
      try {
        return ok({
          action: params.action,
          key: params.key,
          value: params.value,
          message: 'Config management delegated to config system',
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('kill', {
    description: 'Kill daemon and all sessions',
    scope: 'project',
    params: z.object({}).default({}),
    handler: async () => {
      try {
        await deps.killAllDaemon();
        return ok({ killed: true });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });
}
