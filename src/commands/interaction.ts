import type { Page } from 'playwright-core';
import type { CommandModule } from './types.js';

export const interactionCommands: CommandModule = {
  click: async (page: Page, args: Record<string, unknown>) => {
    const selector = args.selector as string;
    const options: Record<string, unknown> = {};
    if (args.timeout !== undefined) options.timeout = args.timeout;
    if (args.force !== undefined) options.force = args.force;
    await page.waitForSelector(selector, { timeout: (args.timeout as number) || 10000 });
    await page.click(selector, options);
    return { selector };
  },

  fill: async (page: Page, args: Record<string, unknown>) => {
    const selector = args.selector as string;
    const value = args.value as string;
    const options: Record<string, unknown> = {};
    if (args.timeout !== undefined) options.timeout = args.timeout;
    await page.waitForSelector(selector, { timeout: (args.timeout as number) || 10000 });
    await page.fill(selector, value, options);
    await page.evaluate((sel: string) => {
      const el = document.querySelector(sel) as HTMLInputElement | HTMLTextAreaElement | null;
      if (el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, selector);
    return { selector, value };
  },

  type: async (page: Page, args: Record<string, unknown>) => {
    const selector = args.selector as string;
    const text = args.text as string;
    const options: Record<string, unknown> = {};
    if (args.timeout !== undefined) options.timeout = args.timeout;
    if (args.delay !== undefined) options.delay = args.delay;
    await page.type(selector, text, options);
    return { selector, text };
  },

  press: async (page: Page, args: Record<string, unknown>) => {
    const key = args.key as string;
    const selector = (args.selector as string) || 'body';
    const options: Record<string, unknown> = {};
    if (args.delay !== undefined) options.delay = args.delay;
    await page.press(selector, key, options);
    return { key, selector };
  },

  hover: async (page: Page, args: Record<string, unknown>) => {
    const selector = args.selector as string;
    const options: Record<string, unknown> = {};
    if (args.timeout !== undefined) options.timeout = args.timeout;
    await page.hover(selector, options);
    return { selector };
  },

  scroll: async (page: Page, args: Record<string, unknown>) => {
    if (args.selector) {
      await page.locator(args.selector as string).scrollIntoViewIfNeeded();
      return { scrolledTo: args.selector };
    }
    await page.evaluate(`window.scrollTo(${args.x ?? 0}, ${args.y ?? 0})`);
    return { x: args.x ?? 0, y: args.y ?? 0 };
  },

  select: async (page: Page, args: Record<string, unknown>) => {
    await page.waitForSelector(args.selector as string, { timeout: 10000 });
    await page.selectOption(args.selector as string, args.value as string);
    return { selector: args.selector, value: args.value };
  },

  check: async (page: Page, args: Record<string, unknown>) => {
    await page.waitForSelector(args.selector as string, { timeout: 10000 });
    await page.check(args.selector as string);
    return { selector: args.selector };
  },

  waitForSelector: async (page: Page, args: Record<string, unknown>) => {
    await page.waitForSelector(args.selector as string, {
      timeout: (args.timeout as number) || 30000,
    });
    return { selector: args.selector };
  },
};
