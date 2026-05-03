import type { Page } from 'playwright';

interface HumanizeOptions {
  moveSteps?: { min: number; max: number };
  moveDelay?: { min: number; max: number };
  clickJitter?: number;
  mdClickGap?: { min: number; max: number };
  typeDelay?: { min: number; max: number };
  pauseBefore?: { min: number; max: number };
}

const defaults: HumanizeOptions = {
  moveSteps: { min: 15, max: 35 },
  moveDelay: { min: 6, max: 22 },
  clickJitter: 0.6,
  mdClickGap: { min: 40, max: 120 },
  typeDelay: { min: 30, max: 150 },
  pauseBefore: { min: 100, max: 400 },
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function bezierPoint(t: number, p0: number, p1: number, p2: number, p3: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class HumanizedPage {
  private page: Page;
  private opts: Required<HumanizeOptions>;

  constructor(page: Page, opts?: HumanizeOptions) {
    this.page = page;
    this.opts = { ...defaults, ...opts } as Required<HumanizeOptions>;
  }

  get raw(): Page {
    return this.page;
  }

  async goto(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(rand(300, 800));
  }

  async waitForSelector(selector: string): Promise<void> {
    await this.page.waitForSelector(selector, { state: 'visible' });
    await this.page.waitForTimeout(rand(100, 300));
  }

  async click(selector: string): Promise<void> {
    await this.pause();
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    let box = await el.boundingBox();
    if (!box) {
      await this.page
        .waitForSelector(selector, { state: 'visible', timeout: 3000 })
        .catch(() => {});
      box = await el.boundingBox();
    }
    if (!box) throw new Error(`Element not visible: ${selector}`);

    const jitterX = (Math.random() - 0.5) * box.width * this.opts.clickJitter;
    const jitterY = (Math.random() - 0.5) * box.height * this.opts.clickJitter;
    const targetX = box.x + box.width / 2 + jitterX;
    const targetY = box.y + box.height / 2 + jitterY;

    await this.moveToPoint(targetX, targetY);

    const mdGap = rand(this.opts.mdClickGap.min, this.opts.mdClickGap.max);
    await this.page.mouse.down();
    await this.page.waitForTimeout(mdGap);
    await this.page.mouse.up();

    await this.page.waitForTimeout(rand(50, 200));
  }

  async fill(selector: string, text: string): Promise<void> {
    await this.pause();
    try {
      await this.click(selector);
    } catch {
      await this.page.click(selector);
    }
    await this.page.waitForTimeout(rand(100, 300));
    await this.page.fill(selector, text);
  }

  async type(selector: string, text: string): Promise<void> {
    await this.fill(selector, text);
  }

  async hover(selector: string): Promise<void> {
    await this.pause();
    const el = await this.page.$(selector);
    if (!el) throw new Error(`Element not found: ${selector}`);
    const box = await el.boundingBox();
    if (!box) throw new Error(`Element not visible: ${selector}`);

    const jitterX = (Math.random() - 0.5) * box.width * this.opts.clickJitter;
    const jitterY = (Math.random() - 0.5) * box.height * this.opts.clickJitter;
    const targetX = box.x + box.width / 2 + jitterX;
    const targetY = box.y + box.height / 2 + jitterY;

    await this.moveToPoint(targetX, targetY);
  }

  private async moveToPoint(targetX: number, targetY: number): Promise<void> {
    const start = await this.currentMousePos();
    const steps = Math.floor(rand(this.opts.moveSteps.min, this.opts.moveSteps.max));

    const cp1x = start.x + (targetX - start.x) * rand(0.2, 0.4) + rand(-60, 60);
    const cp1y = start.y + (targetY - start.y) * rand(0.5, 0.8) + rand(-60, 60);
    const cp2x = start.x + (targetX - start.x) * rand(0.6, 0.8) + rand(-40, 40);
    const cp2y = start.y + (targetY - start.y) * rand(0.2, 0.5) + rand(-40, 40);

    for (let i = 1; i <= steps; i++) {
      const t = easeInOutCubic(i / steps);

      const x = bezierPoint(t, start.x, cp1x, cp2x, targetX) + rand(-1.5, 1.5);
      const y = bezierPoint(t, start.y, cp1y, cp2y, targetY) + rand(-1.5, 1.5);

      await this.page.mouse.move(x, y);
      await this.page.waitForTimeout(rand(this.opts.moveDelay.min, this.opts.moveDelay.max));
    }
  }

  private async currentMousePos(): Promise<{ x: number; y: number }> {
    try {
      const pos = await this.page.evaluate(() => {
        const mx = (window as unknown as Record<string, unknown>)._lastMouseX as number | undefined;
        const my = (window as unknown as Record<string, unknown>)._lastMouseY as number | undefined;
        return { x: mx || 0, y: my || 0 };
      });
      if (pos.x > 0 || pos.y > 0) return pos;
    } catch {}
    return {
      x: rand(100, 400),
      y: rand(100, 300),
    };
  }

  private async pause(): Promise<void> {
    await this.page.waitForTimeout(rand(this.opts.pauseBefore.min, this.opts.pauseBefore.max));
  }
}

export function humanize(page: Page, opts?: HumanizeOptions): HumanizedPage {
  return new HumanizedPage(page, opts);
}
