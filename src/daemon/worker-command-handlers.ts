import type { BrowserContext, Page } from 'playwright-core';
import type { Cookie } from 'playwright-core';
import { executePageCommand } from '../commands/index.js';

export interface SessionRef {
  name: string;
  context: BrowserContext;
  page: Page;
}

export async function handleStorageGet(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return p.type === 'cookies' ? { cookies: [] } : { localStorage: {} };
  if (p.type === 'cookies') {
    const cookies = await session.context.cookies();
    return { cookies };
  }
  if (p.type === 'localStorage') {
    const lsData = await session.page.evaluate(() => {
      const result: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) result[key] = localStorage.getItem(key) || '';
      }
      return result;
    });
    return { localStorage: lsData };
  }
  return p.type === 'cookies' ? { cookies: [] } : { localStorage: {} };
}

export async function handleStorageSet(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: true };
  if (p.type === 'cookies' && p.data) {
    await session.context.addCookies([p.data as Cookie]);
  } else if (p.type === 'localStorage' && p.key !== undefined) {
    await session.page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [p.key as string, (p.value as string) || '']
    );
  }
  return { ok: true };
}

export async function handleStorageClear(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: true };
  if (p.type === 'cookies') {
    await session.context.clearCookies();
  } else if (p.type === 'localStorage') {
    await session.page.evaluate(() => localStorage.clear());
  }
  return { ok: true };
}

export async function handleSnapshot(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { elements: [] };
  const elements = await session.page.evaluate(
    (interactive: boolean) => {
      const allElements = document.querySelectorAll(
        interactive ? 'a, button, input, select, textarea, [onclick], [role="button"]' : '*'
      );
      const results: Array<{ tag: string; text: string; attrs: Record<string, string> }> = [];
      const seen = new Set<string>();

      allElements.forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const text = el.textContent?.trim().slice(0, 100) || '';
        const attrs: Record<string, string> = {};
        for (const attr of el.attributes) {
          attrs[attr.name] = attr.value;
        }
        const key = `${tag}-${text}-${Object.keys(attrs).join(',')}`;
        if (!seen.has(key) && (text || tag === 'img' || tag === 'input')) {
          seen.add(key);
          results.push({ tag, text, attrs });
        }
      });

      return results.slice(0, 100).map((item, idx) => ({
        ref: `@e${idx + 1}`,
        ...item,
      }));
    },
    (p.interactiveOnly as boolean) || false
  );
  return { elements };
}

export async function handleMouse(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: false, error: 'Session not found' };
  const action = p.action as string;
  const x = p.x as number;
  const y = p.y as number;
  const steps = p.steps as number | undefined;
  if (action === 'move') {
    await session.page.mouse.move(x, y, { steps: steps || 1 });
  } else if (action === 'down') {
    await session.page.mouse.down();
  } else if (action === 'up') {
    await session.page.mouse.up();
  } else if (action === 'click') {
    await session.page.mouse.click(x, y);
  }
  return { ok: true, action, x, y };
}

export async function handleGet(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: false, error: 'Session not found' };
  const prop = p.property as string;
  if (prop === 'url') {
    return { ok: true, property: prop, selector: p.selector, value: session.page.url() };
  }
  if (prop === 'title') {
    const titleResult = await executePageCommand(session.page, 'title', {});
    return {
      ok: true,
      property: prop,
      selector: p.selector,
      value: (titleResult as Record<string, unknown>).title as string,
    };
  }
  if (p.selector) {
    if (prop === 'value') {
      const valueResult = await executePageCommand(session.page, 'inputValue', {
        selector: p.selector,
      });
      return {
        ok: true,
        property: prop,
        selector: p.selector,
        value: (valueResult as Record<string, unknown>).value as string,
      };
    }
    const textResult = await executePageCommand(session.page, 'textContent', {
      selector: p.selector,
    });
    return {
      ok: true,
      property: prop,
      selector: p.selector,
      value: (textResult as Record<string, unknown>).text as string,
    };
  }
  return { ok: true, property: prop, selector: p.selector, value: '' };
}

export async function handleNavigate(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: false, error: 'Session not found' };
  const direction = p.direction as string;
  if (direction === 'back') {
    await executePageCommand(session.page, 'goBack', {});
  } else if (direction === 'forward') {
    await executePageCommand(session.page, 'goForward', {});
  }
  return { ok: true, direction };
}

export async function handleFetch(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: false, error: 'Session not found' };
  const requestHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  if (p.headers) Object.assign(requestHeaders, p.headers as Record<string, string>);
  const fetchOptions: RequestInit = {
    method: (p.method as string) || 'GET',
    headers: requestHeaders,
  };
  if (p.body && (p.method === 'POST' || p.method === 'PUT' || p.method === 'PATCH')) {
    fetchOptions.body = JSON.stringify(p.body);
  }
  const response = await session.page.evaluate(
    async ({ u, opts }: { u: string; opts: RequestInit }) => {
      const res = await fetch(u, opts);
      const contentType = res.headers.get('content-type') || '';
      let data;
      if (contentType.includes('json')) {
        data = await res.json();
      } else {
        data = await res.text();
      }
      return { status: res.status, ok: res.ok, contentType, data };
    },
    { u: p.url as string, opts: fetchOptions }
  );
  return response;
}

export async function handleVerifySlider(
  session: SessionRef | undefined,
  p: Record<string, unknown>
): Promise<unknown> {
  if (!session) return { ok: false, error: 'Session not found' };
  const baseUrl = p.baseUrl as string;
  const captchaData = await session.page.evaluate(async (url: string) => {
    const res = await fetch(url);
    return res.json();
  }, `${baseUrl}/examples/33/slider-captcha`);
  const { captchaId, targetX } = captchaData;
  const result = await session.page.evaluate(
    async ({ cId, tX, verifyUrl }: { cId: string; tX: number; verifyUrl: string }) => {
      const sliderKnob = document.getElementById('slider-knob');
      const sliderBg = document.getElementById('slider-bg');
      if (!sliderKnob || !sliderBg) return { error: 'Elements not found' };
      const currentLeft = parseInt(sliderKnob.style.left || '0', 10);
      const distance = tX - currentLeft;
      const dispatchDrag = (type: string, clientX: number) => {
        const evt = new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: clientX,
          clientY: 100,
        });
        sliderKnob.dispatchEvent(evt);
      };
      dispatchDrag('mousedown', sliderBg.getBoundingClientRect().left);
      for (let i = 0; i <= 20; i++) {
        const x = sliderBg.getBoundingClientRect().left + currentLeft + (distance * i) / 20;
        dispatchDrag('mousemove', x);
      }
      dispatchDrag('mouseup', sliderBg.getBoundingClientRect().left + tX);
      const verifyRes = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ captchaId: cId, x: tX }),
      }).then((r) => r.json());
      return { ok: verifyRes.success, targetX: tX, verifyResult: verifyRes };
    },
    { cId: captchaId, tX: targetX, verifyUrl: `${baseUrl}/examples/33/verify-slider` }
  );
  return result;
}
