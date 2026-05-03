import type { Page } from 'playwright-core';
import type { CommandModule } from './types.js';
import { STRUCTURE_EXTRACTOR_CODE } from './structure-extractor.js';

export const queryCommands: CommandModule = {
  query: async (page: Page, args: Record<string, unknown>) => {
    const selector = args.selector as string;
    const result = await page.evaluate((s) => {
      const elements = Array.from(document.querySelectorAll(s));
      return elements.slice(0, 20).map((el, i) => ({
        index: i,
        tagName: el.tagName,
        id: el.id || '',
        className: (el.className || '').toString().slice(0, 100),
        text: (el.textContent || '').trim().slice(0, 200),
        href: (el as HTMLAnchorElement).href || '',
      }));
    }, selector);
    return { elements: result, count: result.length };
  },

  find: async (page: Page, args: Record<string, unknown>) => {
    const text = args.text as string;
    const tag = (args.tag as string) || '*';
    const result = await page.evaluate(
      (opts) => {
        return Array.from(document.querySelectorAll(opts.tag))
          .filter((el) => {
            if (/SCRIPT|STYLE|NOSCRIPT|META|LINK|HEAD|HTML|TITLE/.test(el.tagName)) return false;
            const sources = [
              el.textContent || '',
              el.getAttribute('aria-label') || '',
              el.getAttribute('title') || '',
              el.getAttribute('alt') || '',
              el.getAttribute('placeholder') || '',
            ];
            if (opts.exact) {
              return sources.some((s) => s.trim() === opts.text);
            }
            return sources.join(' ').includes(opts.text);
          })
          .filter((el, _i, arr) => !arr.some((other) => other !== el && el.contains(other)))
          .slice(0, 20)
          .map((el, i) => ({
            index: i,
            tagName: el.tagName,
            id: el.id || '',
            className: (el.className || '').toString().slice(0, 100),
            text: (el.textContent || '').trim().slice(0, 200),
            href: (el as HTMLAnchorElement).href || '',
            selector: el.id
              ? `#${el.id}`
              : el.className
                ? `.${el.className.split(' ')[0]}`
                : el.tagName.toLowerCase(),
          }));
      },
      { text, tag, exact: args.exact }
    );
    return { elements: result, count: result.length };
  },

  html: async (page: Page, args: Record<string, unknown>) => {
    let html: string;
    if (args.selector) {
      html = await page.innerHTML(args.selector as string);
    } else {
      html = await page.content();
    }

    if (args.clean) {
      html = html
        .replace(/\s*data-v-[a-f0-9]+="[^"]*"/gi, '')
        .replace(/\s*data-v-[a-f0-9]+/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/\s{2,}/g, ' ')
        .replace(/>\s+</g, '><')
        .replace(/\s*class=""/g, '')
        .replace(/\s*style=""/g, '')
        .replace(/\s*id=""/g, '')
        .replace(/<div\s*><\/div>/g, '')
        .replace(/<span\s*><\/span>/g, '')
        .replace(/<div\s*>\s*<\/div>/g, '')
        .replace(/<span\s*>\s*<\/span>/g, '')
        .trim();
    }

    return { html };
  },

  text: async (page: Page, args: Record<string, unknown>) => {
    const text = await page.textContent((args.selector as string) || 'body');
    return { text };
  },

  inputValue: async (page: Page, args: Record<string, unknown>) => {
    const value = await page.locator(args.selector as string).inputValue();
    return { value };
  },

  textContent: async (page: Page, args: Record<string, unknown>) => {
    const text = await page.locator(args.selector as string).textContent();
    return { text };
  },

  getAttribute: async (page: Page, args: Record<string, unknown>) => {
    const value = await page.getAttribute(args.selector as string, args.name as string);
    return { value };
  },

  structure: async (page: Page, args: Record<string, unknown>) => {
    const selector = (args.selector as string) || 'body';

    interface ExtractorResult {
      layout: unknown;
      yaml: string;
    }

    await page.addScriptTag({
      content: `window.__structureExtractor = ${STRUCTURE_EXTRACTOR_CODE};`,
    });

    const result = await page.evaluate((sel: string): ExtractorResult => {
      const ext = (window as unknown as Record<string, unknown>).__structureExtractor;
      if (typeof ext === 'function') {
        return (ext as (opts: { selector: string }) => ExtractorResult)({ selector: sel });
      }
      return { layout: null, yaml: 'Extractor not loaded' };
    }, selector);

    return { structure: result.layout, yaml: result.yaml };
  },
};
