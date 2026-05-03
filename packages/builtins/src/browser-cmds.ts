import { z } from 'zod';
import { ok, fail } from '@dyyz1993/xcli-core';
import type { SiteInstance } from '@dyyz1993/xcli-core';
import {
  openSession,
  closeSession,
  gotoSession,
  clickSession,
  fillSession,
  typeSession,
  pressSession,
  selectSession,
  checkSession,
  getElementSession,
  snapshotSession,
  screenshotSession,
  htmlSession,
  evalScriptSession,
} from '@xcli-v2/session';

interface BuiltinDeps {
  startDaemon: () => Promise<{ port: number; pid: number }>;
  stopDaemon: () => Promise<void>;
  getDaemonStatus: () => { running: boolean; pid?: number; port?: number };
  killAllDaemon: () => Promise<void>;
  isDaemonRunning: () => boolean;
}

export function registerBrowserCommands(site: SiteInstance, deps: BuiltinDeps): void {
  site.command('open', {
    description: 'Open URL and create a browser session',
    scope: 'browser',
    params: z.object({
      url: z.string().describe('URL to open'),
      session: z.string().default('default').describe('Session name'),
    }),
    handler: async (params) => {
      try {
        if (!deps.isDaemonRunning()) {
          await deps.startDaemon();
        }
        const info = await openSession(params.session, params.url);
        return ok({ session: info.name, url: info.url, id: info.id });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('close', {
    description: 'Close a browser session',
    scope: 'browser',
    params: z.object({
      session: z.string().default('default').describe('Session name'),
      all: z.boolean().default(false).describe('Close all sessions'),
    }),
    handler: async (params) => {
      try {
        await closeSession(params.session);
        return ok({ closed: params.session });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('goto', {
    description: 'Navigate to URL',
    scope: 'page',
    params: z.object({
      url: z.string().describe('URL to navigate to'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await gotoSession(params.session, params.url);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('click', {
    description: 'Click element by selector',
    scope: 'element',
    params: z.object({
      selector: z.string().describe('CSS selector or @ref'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await clickSession(params.session, params.selector);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('fill', {
    description: 'Fill input field',
    scope: 'element',
    params: z.object({
      selector: z.string().describe('CSS selector or @ref'),
      text: z.string().describe('Text to fill'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await fillSession(params.session, params.selector, params.text);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('type', {
    description: 'Type text into element',
    scope: 'element',
    params: z.object({
      selector: z.string().describe('CSS selector or @ref'),
      text: z.string().describe('Text to type'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await typeSession(params.session, params.selector, params.text);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('press', {
    description: 'Press a key',
    scope: 'element',
    params: z.object({
      key: z.string().describe('Key name (Enter, Escape, Tab, etc.)'),
      selector: z.string().optional().describe('Optional selector to focus first'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await pressSession(params.session, params.key, params.selector);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('select', {
    description: 'Select option in dropdown',
    scope: 'element',
    params: z.object({
      selector: z.string().describe('CSS selector or @ref'),
      value: z.string().describe('Option value to select'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await selectSession(params.session, params.selector, params.value);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('check', {
    description: 'Check a checkbox',
    scope: 'element',
    params: z.object({
      selector: z.string().describe('CSS selector or @ref'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await checkSession(params.session, params.selector);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('get', {
    description: 'Get element property',
    scope: 'element',
    params: z.object({
      property: z.string().describe('Property name (text, url, title, etc.)'),
      selector: z.string().optional().describe('Optional selector'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await getElementSession(params.session, params.property, params.selector);
        return ok(result);
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('snapshot', {
    description: 'Get page accessibility snapshot',
    scope: 'page',
    params: z.object({
      interactiveOnly: z.boolean().default(false).describe('Only interactive elements'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const elements = await snapshotSession(params.session, params.interactiveOnly);
        return ok({
          data: elements,
          tips: [`Found ${elements.length} elements${params.interactiveOnly ? ' (interactive only)' : ''}`],
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('screenshot', {
    description: 'Capture page screenshot',
    scope: 'page',
    params: z.object({
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const screenshot = await screenshotSession(params.session);
        return ok({ data: screenshot, tips: ['Screenshot captured'] });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('html', {
    description: 'Get page HTML content',
    scope: 'page',
    params: z.object({
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const html = await htmlSession(params.session);
        return ok({ data: html });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });

  site.command('eval', {
    description: 'Execute JavaScript in page',
    scope: 'page',
    params: z.object({
      script: z.string().describe('JavaScript to execute'),
      session: z.string().default('default'),
    }),
    handler: async (params) => {
      try {
        const result = await evalScriptSession(params.session, params.script);
        return ok({ result });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  });
}
