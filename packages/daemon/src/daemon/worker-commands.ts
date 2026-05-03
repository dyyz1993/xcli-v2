import type { Page } from 'playwright-core';
import { executePageCommand } from '@xcli-v2/browser-engine';

export type MpageCommandMapping = {
  command: string;
  mapArgs: (p: Record<string, unknown>) => Record<string, unknown>;
  mapResult: (result: unknown, p: Record<string, unknown>) => unknown;
};

export const mpageCommandMap: Record<string, MpageCommandMapping> = {
  'page.goto': {
    command: 'goto',
    mapArgs: (p) => ({ url: p.url, waitUntil: p.waitUntil }),
    mapResult: (result, p) => ({ ok: true, ...(result as Record<string, unknown>), url: p.url }),
  },
  'page.click': {
    command: 'click',
    mapArgs: (p) => ({ selector: p.selector }),
    mapResult: (_r, p) => ({ ok: true, selector: p.selector }),
  },
  'page.fill': {
    command: 'fill',
    mapArgs: (p) => ({ selector: p.selector, value: p.text }),
    mapResult: (_r, p) => ({ ok: true, selector: p.selector, text: p.text }),
  },
  'page.type': {
    command: 'type',
    mapArgs: (p) => ({ selector: p.selector, text: p.text }),
    mapResult: (_r, p) => ({ ok: true, selector: p.selector, text: p.text }),
  },
  'page.press': {
    command: 'press',
    mapArgs: (p) => ({ selector: p.selector, key: p.key }),
    mapResult: (_r, p) => ({ ok: true, key: p.key, selector: p.selector }),
  },
  'page.select': {
    command: 'select',
    mapArgs: (p) => ({ selector: p.selector, value: p.value }),
    mapResult: (_r, p) => ({ ok: true, selector: p.selector, value: p.value }),
  },
  'page.check': {
    command: 'check',
    mapArgs: (p) => ({ selector: p.selector }),
    mapResult: (_r, p) => ({ ok: true, selector: p.selector }),
  },
  'page.html': {
    command: 'html',
    mapArgs: (p) => ({ selector: p.selector, clean: p.clean }),
    mapResult: (result) => result,
  },
  'page.screenshot': {
    command: 'screenshotBase64',
    mapArgs: (p) => ({ fullPage: p.fullPage, type: p.type }),
    mapResult: (result) => result,
  },
  'page.scroll': {
    command: 'scroll',
    mapArgs: (p) => {
      const dir = p.direction as string;
      const dist = p.distance as number;
      if (dir === 'up') return { x: 0, y: -dist };
      if (dir === 'down') return { x: 0, y: dist };
      return { x: p.x, y: p.y };
    },
    mapResult: (_r, p) => ({ ok: true, direction: p.direction, distance: p.distance }),
  },
  'page.eval': {
    command: 'evaluateRaw',
    mapArgs: (p) => ({ script: p.script }),
    mapResult: (result) => result,
  },
  'page.waitForSelector': {
    command: 'waitForSelector',
    mapArgs: (p) => ({ selector: p.selector, timeout: p.timeout }),
    mapResult: (_r, p) => ({ ok: true, selector: p.selector }),
  },
  'page.waitForTimeout': {
    command: 'wait',
    mapArgs: (p) => ({ timeout: p.timeout }),
    mapResult: (_r, p) => ({ ok: true, timeout: p.timeout }),
  },
  'page.refresh': {
    command: 'reload',
    mapArgs: () => ({}),
    mapResult: () => ({ ok: true }),
  },
  'page.structure': {
    command: 'structure',
    mapArgs: (p) => ({ selector: p.selector || 'body' }),
    mapResult: (result) => ({ ok: true, ...(result as Record<string, unknown>) }),
  },
};

export async function executeMpageCommand(
  page: Page,
  mapping: MpageCommandMapping,
  p: Record<string, unknown>
): Promise<unknown> {
  const mpageArgs = mapping.mapArgs(p);
  const result = await executePageCommand(page, mapping.command, mpageArgs);
  return mapping.mapResult(result, p);
}
