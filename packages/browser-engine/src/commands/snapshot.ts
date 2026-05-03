import { tmpdir } from 'os';
import { join } from 'path';
import type { Page } from 'playwright-core';
import type { CommandModule } from './types.js';

const DEFAULT_STORAGE = join(process.env.XCLI_V2_STORAGE_DIR || tmpdir(), 'xcli-v2');

export const snapshotCommands: CommandModule = {
  screenshot: async (page: Page, args: Record<string, unknown>) => {
    const filename = (args.path as string) || `screenshot-${Date.now()}.png`;
    const filePath = join(DEFAULT_STORAGE, filename);
    await page.screenshot({ ...args, path: filePath });
    return { path: filePath };
  },

  screenshotBase64: async (page: Page, args: Record<string, unknown>) => {
    const buffer = await page.screenshot({
      fullPage: (args.fullPage as boolean) || false,
      ...(args.type ? { type: args.type as 'png' | 'jpeg' } : {}),
    });
    return { screenshot: buffer.toString('base64') };
  },

  a11y: async (page: Page, args: Record<string, unknown>) => {
    const selector = (args.selector as string) || 'body';
    const format = (args.format as string) || 'yaml';
    const snapshot = await page.evaluate((sel: string) => {
      function walk(node: Element | null, depth: number): Record<string, unknown> | null {
        if (!node || node.nodeType !== 1) return null;

        const tag = node.tagName;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK', 'HEAD', 'HTML'].indexOf(tag) !== -1) {
          return null;
        }

        const role =
          node.getAttribute('role') ||
          (tag === 'BUTTON'
            ? 'button'
            : tag === 'A'
              ? 'link'
              : tag === 'INPUT'
                ? 'textbox'
                : tag === 'TEXTAREA'
                  ? 'textbox'
                  : tag === 'SELECT'
                    ? 'combobox'
                    : tag === 'IMG'
                      ? 'img'
                      : tag === 'H1' ||
                          tag === 'H2' ||
                          tag === 'H3' ||
                          tag === 'H4' ||
                          tag === 'H5' ||
                          tag === 'H6'
                        ? 'heading'
                        : tag === 'UL' || tag === 'OL'
                          ? 'list'
                          : tag === 'LI'
                            ? 'listitem'
                            : tag === 'NAV'
                              ? 'navigation'
                              : tag === 'MAIN'
                                ? 'main'
                                : tag === 'HEADER'
                                  ? 'banner'
                                  : tag === 'FOOTER'
                                    ? 'contentinfo'
                                    : tag === 'FORM'
                                      ? 'form'
                                      : tag === 'TABLE'
                                        ? 'table'
                                        : tag === 'TR'
                                          ? 'row'
                                          : tag === 'TD' || tag === 'TH'
                                            ? 'cell'
                                            : tag === 'SPAN'
                                              ? 'text'
                                              : '');

        let directText = '';
        for (let i = 0; i < node.childNodes.length; i++) {
          const child = node.childNodes[i];
          if (child.nodeType === 3) {
            directText += child.textContent || '';
          }
        }
        directText = directText.trim();

        const name =
          node.getAttribute('aria-label') ||
          node.getAttribute('alt') ||
          node.getAttribute('title') ||
          (tag === 'INPUT' || tag === 'TEXTAREA' ? node.getAttribute('placeholder') : '') ||
          (directText ? directText.slice(0, 100) : '');

        let cssSelector = '';
        if (node.id) {
          cssSelector = '#' + node.id;
        } else if (node.className && typeof node.className === 'string') {
          const classes = node.className
            .trim()
            .split(/\s+/)
            .filter(function (c: string) {
              return c && !c.startsWith('reds-');
            });
          if (classes.length > 0) {
            cssSelector = '.' + classes.slice(0, 2).join('.');
          }
        }

        const result: Record<string, unknown> = {};
        if (role) result.role = role;
        if (name) result.name = name;
        result.tag = tag.toLowerCase();
        if (cssSelector) result.selector = cssSelector;
        if (node.id) result.id = node.id;
        if (node.getAttribute('href')) result.href = node.getAttribute('href');
        if ((node as HTMLInputElement).disabled) result.disabled = true;

        const children: Record<string, unknown>[] = [];
        for (let j = 0; j < node.children.length; j++) {
          const childResult = walk(node.children[j], depth + 1);
          if (childResult) children.push(childResult);
        }

        if (children.length > 0) {
          result.children = children;
        }

        if (!role && !name && children.length === 0) return null;

        return result;
      }

      function toYaml(node: Record<string, unknown> | null, indent: number): string {
        if (!node) return '';
        const spaces = '  '.repeat(indent);
        const lines: string[] = [];

        let header = '';
        if (node.role) {
          header = node.role as string;
          if (node.name) header += ' "' + (node.name as string) + '"';
        } else if (node.name) {
          header = node.name as string;
        } else {
          header = node.tag as string;
        }

        if (node.selector && (node.selector as string).includes('.active')) {
          header = '✓ ' + header;
        }

        lines.push(spaces + '- ' + header);

        if (node.selector && node.selector !== '.' + node.tag) {
          lines.push(spaces + '  selector: ' + (node.selector as string));
        }
        if (node.href) {
          lines.push(spaces + '  href: ' + (node.href as string));
        }
        if (node.disabled) {
          lines.push(spaces + '  disabled: true');
        }

        const nodeChildren = node.children as Record<string, unknown>[] | undefined;
        if (nodeChildren && nodeChildren.length > 0) {
          for (let k = 0; k < nodeChildren.length; k++) {
            lines.push(toYaml(nodeChildren[k], indent + 1));
          }
        }

        return lines.join('\n');
      }

      const root = document.querySelector(sel) || document.body;
      const result = walk(root, 0);

      return {
        json: result,
        yaml: result ? toYaml(result, 0) : '',
      };
    }, selector);

    if (format === 'json') {
      return { snapshot: (snapshot as { json: unknown; yaml: string }).json };
    }
    return { snapshot: (snapshot as { json: unknown; yaml: string }).yaml };
  },

  snapshot: async (page: Page, args: Record<string, unknown>) => {
    const selector = (args.selector as string) || 'body';
    const snapshot = await page.locator(selector).ariaSnapshot();
    return { snapshot };
  },
};
