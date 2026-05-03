import { z } from 'zod';
import { ok, fail } from '@dyyz1993/xcli-core';
import type { SiteInstance } from '@dyyz1993/xcli-core';
import {
  scrollSession,
  mouseSession,
  waitForSelector,
  waitForTimeout,
  navigateSession,
  refreshSession,
  requireSession,
} from '@xcli-v2/session';

interface BuiltinDeps {
  startDaemon: () => Promise<{ port: number; pid: number }>;
  stopDaemon: () => Promise<void>;
  getDaemonStatus: () => { running: boolean; pid?: number; port?: number };
  killAllDaemon: () => Promise<void>;
  isDaemonRunning: () => boolean;
}

export function registerAdvancedCommands(site: SiteInstance, _deps: BuiltinDeps): void {
  site.command('scroll', {
    description: 'Scroll page',
    scope: 'element',
    params: z.object({
      direction: z.enum(['up', 'down']).default('down'),
      distance: z.number().default(500).describe('Pixels to scroll'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await scrollSession(params.session, params.direction, params.distance);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('mouse', {
    description: 'Mouse actions',
    scope: 'element',
    params: z.object({
      action: z.enum(['move', 'down', 'up', 'click']),
      x: z.number().default(0),
      y: z.number().default(0),
      steps: z.number().optional(),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await mouseSession(
          params.session,
          params.action,
          params.x,
          params.y,
          params.steps
        );
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('wait', {
    description: 'Wait for selector or timeout',
    scope: 'element',
    params: z.object({
      selector: z.string().optional().describe('Selector to wait for'),
      timeout: z.number().default(30000).describe('Timeout in ms'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        if (params.selector) {
          const found = await waitForSelector(params.session, params.selector, params.timeout);
          return ok({ found, selector: params.selector });
        }
        await waitForTimeout(params.session, params.timeout);
        return ok({ waited: params.timeout });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('http', {
    description: 'Make HTTP request',
    scope: 'page',
    params: z.object({
      method: z.string().describe('HTTP method'),
      url: z.string().describe('Request URL'),
      body: z.string().optional().describe('JSON body'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        requireSession(params.session);
        const body = params.body ? JSON.parse(params.body) : undefined;
        const res = await fetch(params.url, {
          method: params.method.toUpperCase(),
          headers: { 'Content-Type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('json') ? await res.json() : await res.text();
        return ok({ status: res.status, ok: res.ok, contentType, data });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('navigate', {
    description: 'Browser navigation: back, forward, refresh',
    scope: 'page',
    params: z.object({
      action: z.enum(['back', 'forward', 'refresh']).describe('Navigation action'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        if (params.action === 'refresh') {
          const result = await refreshSession(params.session);
          return ok(result);
        }
        const result = await navigateSession(params.session, params.action);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('structure', {
    description: 'Analyze page structure',
    scope: 'page',
    params: z.object({
      selector: z.string().default('body').describe('Root selector'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        requireSession(params.session);
        const { daemonRequest } = await import('@xcli-v2/session');
        const result = await daemonRequest('page.structure', {
          name: params.session,
          selector: params.selector,
        });
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });
}
