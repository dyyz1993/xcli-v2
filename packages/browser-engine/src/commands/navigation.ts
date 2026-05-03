import type { Page } from 'playwright-core';
import type { CommandModule } from './types.js';

export const navigationCommands: CommandModule = {
  goto: async (page: Page, args: Record<string, unknown>) => {
    await page.goto(args.url as string, {
      waitUntil: (args.waitUntil as 'load' | 'domcontentloaded' | 'networkidle') || 'load',
      timeout: (args.timeout as number) || 30000,
    });
    return { url: page.url() };
  },

  goBack: async (page: Page) => {
    await page.goBack();
    return { url: page.url() };
  },

  goForward: async (page: Page) => {
    await page.goForward();
    return { url: page.url() };
  },

  reload: async (page: Page) => {
    await page.reload();
    return { url: page.url() };
  },

  title: async (page: Page) => {
    const title = await page.title();
    return { title };
  },

  url: async (page: Page) => {
    return { url: page.url() };
  },
};
