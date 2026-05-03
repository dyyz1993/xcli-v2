import type { Page, BrowserContext, Frame, CDPSession } from 'playwright-core';
import type { RecordedEvent } from './types.js';

const activeRecorders: Map<string, { events: RecordedEvent[]; controller: unknown }> = new Map();
const initializedContexts: WeakSet<BrowserContext> = new WeakSet();

export { activeRecorders, initializedContexts };

export function registerActiveRecorder(
  recordingId: string,
  events: RecordedEvent[],
  controller: unknown
): void {
  activeRecorders.set(recordingId, { events, controller });
}

export function unregisterActiveRecorder(recordingId: string): void {
  activeRecorders.delete(recordingId);
}

export function markContextInitialized(context: BrowserContext): void {
  initializedContexts.add(context);
}

export function isContextInitialized(context: BrowserContext): boolean {
  return initializedContexts.has(context);
}

export function deleteContextInit(context: BrowserContext): void {
  initializedContexts.delete(context);
}

export async function setupRouteInterception(context: BrowserContext): Promise<void> {
  if (!initializedContexts.has(context)) {
    await context.route('**/__mpage_record_event__', async (route) => {
      const request = route.request();
      const body = request.postData();

      if (body) {
        try {
          const event = JSON.parse(body) as RecordedEvent & { recordingId?: string };
          console.log('[Recorder] Event received:', event.type);
          if (event.recordingId) {
            const recorder = activeRecorders.get(event.recordingId);
            if (recorder) {
              recorder.events.push(event);
            }
          }
        } catch {
          // Ignore parsing errors
        }
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    });

    initializedContexts.add(context);
  }
}

export async function setupCDPNavigationListener(
  page: Page,
  isRecordingFlag: boolean,
  events: RecordedEvent[],
  startTime: number
): Promise<CDPSession | null> {
  console.log('[Recorder] Setting up CDP navigation listener...');
  try {
    const client = await page.context().newCDPSession(page);
    console.log('[Recorder] CDP session created for navigation monitoring');

    await client.send('Page.enable');

    client.on(
      'Page.frameNavigated',
      async (params: { frame: { id: string; url: string; parentId?: string } }) => {
        if (!isRecordingFlag) return;

        const frame = params.frame;
        if (!frame?.parentId) {
          const currentUrl = frame?.url || page.url();
          console.log('[Recorder] CDP Navigation detected:', currentUrl);

          const navEvent: RecordedEvent = {
            id: `evt_${String(events.length + 1).padStart(3, '0')}`,
            type: 'navigation',
            timestamp: Date.now() - startTime,
            data: {
              url: currentUrl,
              navigationType: 'cdp',
              source: 'cdp',
            },
            pageState: {
              url: currentUrl,
              title: await page.title().catch(() => ''),
              readyState: 'loading',
            },
          };
          events.push(navEvent);
          console.log('[Recorder] CDP Navigation event recorded:', currentUrl);
        }
      }
    );

    return client;
  } catch (e) {
    console.log('[Recorder] Failed to setup CDP navigation listener:', e);
    return null;
  }
}

export function createNavigationHandler(
  page: Page,
  isRecording: () => boolean,
  events: RecordedEvent[],
  startTime: number,
  recordingId: string
): (frame: Frame) => Promise<void> {
  return async (frame: Frame) => {
    if (frame !== page.mainFrame()) {
      return;
    }

    if (isRecording()) {
      try {
        const currentUrl = frame.url();

        const lastNav = events.filter((e) => e.type === 'navigation').pop();
        if (
          lastNav &&
          lastNav.data?.url === currentUrl &&
          Date.now() - startTime - lastNav.timestamp < 1000
        ) {
          console.log('[Recorder] Skipping duplicate navigation event:', currentUrl);
          return;
        }

        const navEvent: RecordedEvent = {
          id: `evt_${String(events.length + 1).padStart(3, '0')}`,
          type: 'navigation',
          timestamp: Date.now() - startTime,
          data: {
            url: currentUrl,
            navigationType: 'js',
            source: 'js',
          },
          pageState: {
            url: currentUrl,
            title: await frame.title().catch(() => ''),
            readyState: 'loading',
          },
        };
        events.push(navEvent);
        console.log('[Recorder] JS Navigation event recorded:', currentUrl);

        await page.waitForLoadState('domcontentloaded');

        await page.addScriptTag({
          content: `if (window.__pageRecorder) { window.__pageRecorder.start('${recordingId}'); }`,
        });

        const pageLoadEvent: RecordedEvent = {
          id: `evt_${String(events.length + 1).padStart(3, '0')}`,
          type: 'page_load',
          timestamp: Date.now() - startTime,
          data: {
            url: currentUrl,
            persisted: false,
          },
          pageState: {
            url: currentUrl,
            title: await frame.title().catch(() => ''),
            readyState: 'complete',
          },
        };
        events.push(pageLoadEvent);
        console.log('[Recorder] Page load event recorded:', currentUrl);
      } catch {
        // Ignore errors if page is not ready
      }
    }
  };
}

export function createPageHandler(
  page: Page,
  isRecording: () => boolean,
  events: RecordedEvent[],
  startTime: number,
  recordingId: string,
  trackedPages: Set<Page>
): (newPage: Page) => Promise<void> {
  return async (newPage: Page) => {
    if (!isRecording()) return;

    trackedPages.add(newPage);

    try {
      await newPage.waitForLoadState('domcontentloaded');

      await newPage.addScriptTag({
        content: `if (window.__pageRecorder) { window.__pageRecorder.start('${recordingId}'); }`,
      });

      const tabOpenEvent: RecordedEvent = {
        id: `evt_${String(events.length + 1).padStart(3, '0')}`,
        type: 'tab_open',
        timestamp: Date.now() - startTime,
        data: {
          url: newPage.url(),
          openerUrl: page.url(),
        },
        pageState: {
          url: newPage.url(),
          title: await newPage.title().catch(() => ''),
          readyState: 'complete',
        },
      };
      events.push(tabOpenEvent);
      console.log('[Recorder] Tab opened:', newPage.url());
    } catch {
      // Ignore errors if page is not ready
    }
  };
}
