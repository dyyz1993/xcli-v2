import { z } from 'zod';
import { ok, fail } from '@dyyz1993/xcli-core';
import type { SiteInstance } from '@dyyz1993/xcli-core';
import { requireSession, daemonRequest } from '../session/index.js';

interface BuiltinDeps {
  startDaemon: () => Promise<{ port: number; pid: number }>;
  stopDaemon: () => Promise<void>;
  getDaemonStatus: () => { running: boolean; pid?: number; port?: number };
  killAllDaemon: () => Promise<void>;
  isDaemonRunning: () => boolean;
}

export function registerRecorderCommands(site: SiteInstance, _deps: BuiltinDeps): void {
  site.command('record', {
    description: 'Start or stop page recording',
    scope: 'page',
    params: z.object({
      action: z.enum(['start', 'stop', 'status']),
      url: z.string().optional().describe('URL for start action'),
      name: z.string().optional().describe('Recording name'),
      output: z.string().optional().describe('Output path for stop action'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        requireSession(params.session);

        if (params.action === 'start') {
          if (!params.url) {
            return fail('--url is required for record start');
          }
          const result = await daemonRequest('recorder.start', {
            name: params.session,
            url: params.url,
            recorderName: params.name,
          });
          return ok({
            recordingId: result.recordingId,
            session: params.session,
            url: params.url,
          });
        }

        if (params.action === 'stop') {
          const result = await daemonRequest('recorder.stop', {
            name: params.session,
            outputPath: params.output,
          });
          return ok({
            path: result.path,
            eventCount: result.eventCount,
          });
        }

        if (params.action === 'status') {
          const result = await daemonRequest('recorder.status', {
            name: params.session,
          });
          const status = result.status as Record<string, unknown> | null;
          if (status) {
            return ok({
              active: true,
              eventCount: status.eventCount,
              duration: status.duration,
            });
          }
          return ok({ active: false });
        }

        return fail(`Unknown record action: ${params.action}`);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('replay', {
    description: 'Replay a recorded session',
    scope: 'page',
    params: z.object({
      file: z.string().describe('Recording file path (.yaml)'),
      slowMo: z.number().optional().describe('Slow motion multiplier'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        requireSession(params.session);

        const result = await daemonRequest('replay.start', {
          name: params.session,
          filePath: params.file,
          slowMo: params.slowMo,
        });

        const replayResult = result.result as Record<string, unknown>;
        return ok({
          success: replayResult.success,
          eventsPlayed: replayResult.eventsPlayed,
          totalEvents: replayResult.totalEvents,
          duration: replayResult.duration,
          errors: replayResult.errors,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });
}
