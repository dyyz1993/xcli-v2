import type { Page } from 'playwright';
import type { ToolCallRecord } from './session-archive.js';

const TRACKED_METHODS = new Set([
  'goto',
  'waitForSelector',
  'waitForLoadState',
  'waitForTimeout',
  'waitForURL',
  'waitForResponse',
  'waitForRequest',
  'waitForEvent',
  'evaluate',
  'evaluateHandle',
  '$',
  '$$',
  '$eval',
  '$$eval',
  'fill',
  'type',
  'press',
  'click',
  'dblclick',
  'check',
  'uncheck',
  'selectOption',
  'setInputFiles',
  'hover',
  'tap',
  'dispatchEvent',
  'scrollIntoViewIfNeeded',
  'screenshot',
  'pdf',
  'title',
  'url',
  'content',
  'setContent',
  'addScriptTag',
  'addStyleTag',
  'route',
  'unroute',
  'waitUntil',
]);

export interface PageProxyOptions {
  onToolCall: (record: ToolCallRecord) => void;
}

export function createTrackedPage(originalPage: Page, options: PageProxyOptions): Page {
  const handler: ProxyHandler<Page> = {
    get(target: Page, prop: string | symbol) {
      const value = (target as unknown as Record<string | symbol, unknown>)[prop];

      if (typeof prop === 'string' && typeof value === 'function' && TRACKED_METHODS.has(prop)) {
        return function (...args: unknown[]) {
          const start = Date.now();
          const toolName = prop;

          try {
            const result = (value as (...a: unknown[]) => unknown).apply(target, args);

            if (result instanceof Promise) {
              return result
                .then((resolved) => {
                  options.onToolCall({
                    tool: toolName,
                    params: sanitizeArgs(args),
                    result: 'success',
                    duration: Date.now() - start,
                    timestamp: start,
                  });
                  return resolved;
                })
                .catch((err: unknown) => {
                  options.onToolCall({
                    tool: toolName,
                    params: sanitizeArgs(args),
                    result: 'failure',
                    duration: Date.now() - start,
                    timestamp: start,
                  });
                  throw err;
                });
            }

            options.onToolCall({
              tool: toolName,
              params: sanitizeArgs(args),
              result: 'success',
              duration: Date.now() - start,
              timestamp: start,
            });
            return result;
          } catch (err) {
            options.onToolCall({
              tool: toolName,
              params: sanitizeArgs(args),
              result: 'failure',
              duration: Date.now() - start,
              timestamp: start,
            });
            throw err;
          }
        };
      }

      if (typeof prop === 'string' && typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(target);
      }

      return value;
    },
  };

  return new Proxy(originalPage, handler) as Page;
}

function sanitizeArgs(args: unknown[]): unknown[] {
  return args.map((arg) => {
    if (typeof arg === 'function') return '[Function]';
    if (typeof arg === 'string' && arg.length > 200) return arg.slice(0, 200) + '...';
    return arg;
  });
}
