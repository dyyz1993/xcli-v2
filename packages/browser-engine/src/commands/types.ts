import type { Page } from 'playwright-core';

export type CommandHandler = (page: Page, args: Record<string, unknown>) => Promise<unknown>;

export interface CommandModule {
  [commandName: string]: CommandHandler;
}
