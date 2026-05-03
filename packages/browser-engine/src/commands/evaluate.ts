import type { Page } from 'playwright-core';
import type { CommandModule } from './types.js';

export const evaluateCommands: CommandModule = {
  evaluate: async (page: Page, args: Record<string, unknown>) => {
    if (typeof args.expression !== 'string') {
      throw new Error('evaluate: "expression" parameter is required and must be a string');
    }
    const result = await page.evaluate(args.expression);
    return { result };
  },

  evaluateRaw: async (page: Page, args: Record<string, unknown>) => {
    if (typeof args.script !== 'string') {
      throw new Error('evaluateRaw: "script" parameter is required and must be a string');
    }
    const wrapped = `(async () => { return ${args.script}; })()`;
    const result = await page.evaluate(wrapped);
    return { result };
  },

  wait: async (page: Page, args: Record<string, unknown>) => {
    if (args.state) {
      await page.waitForLoadState(args.state as 'load' | 'domcontentloaded' | 'networkidle');
      return { state: args.state };
    }
    const timeout = (args.timeout as number) || 1000;
    await page.waitForTimeout(timeout);
    return { waited: timeout };
  },
};
