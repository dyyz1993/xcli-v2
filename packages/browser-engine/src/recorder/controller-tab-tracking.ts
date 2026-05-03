import type { Page, BrowserContext, CDPSession } from 'playwright-core';
import { getRecorderScript } from './inject.js';
import type { RecordedEvent } from './types.js';

export async function setupBrowserCDPListener(
  page: Page,
  isRecordingFlag: boolean,
  events: RecordedEvent[],
  startTime: number,
  recordingId: string,
  trackedPages: Set<Page>
): Promise<CDPSession | null> {
  console.log('[Recorder] Setting up browser-level CDP listener...');
  try {
    const browser = page.context().browser();
    console.log('[Recorder] Browser object:', browser ? 'exists' : 'null');

    if (browser) {
      console.log('[Recorder] Creating new browser CDP session...');
      const session = await browser.newBrowserCDPSession();
      console.log('[Recorder] Browser CDP session created:', session ? 'success' : 'failed');

      await session.send('Target.setDiscoverTargets', { discover: true });
      console.log('[Recorder] Target discovery enabled');

      session.on(
        'Target.targetCreated',
        async (params: {
          targetInfo: {
            type: string;
            url: string;
            title?: string;
            openerId?: string;
            targetId: string;
          };
        }) => {
          if (!isRecordingFlag) return;

          const { targetInfo } = params;
          console.log('[Recorder] CDP: Target created:', targetInfo?.type, targetInfo?.url);

          if (targetInfo?.type === 'page' && targetInfo?.openerId) {
            console.log('[Recorder] CDP: New tab detected:', targetInfo.url);

            const allPages = browser.contexts().flatMap((ctx) => ctx.pages());
            const newPage = allPages.find((p) => {
              try {
                return p.url() === targetInfo.url || p.url().includes(targetInfo.url);
              } catch {
                return false;
              }
            });

            if (newPage && !trackedPages.has(newPage)) {
              console.log('[Recorder] CDP: Found new page, injecting script...');
              trackedPages.add(newPage);

              try {
                await newPage.waitForLoadState('domcontentloaded', { timeout: 5000 });
                await newPage.addScriptTag({ content: getRecorderScript() });
                await newPage.addScriptTag({
                  content: `if (window.__pageRecorder) { window.__pageRecorder.start('${recordingId}'); }`,
                });
                console.log('[Recorder] CDP: Script injected successfully');
              } catch (e) {
                console.log('[Recorder] CDP: Failed to inject script:', e);
              }

              const tabOpenEvent: RecordedEvent = {
                id: `evt_${String(events.length + 1).padStart(3, '0')}`,
                type: 'tab_open',
                timestamp: Date.now() - startTime,
                data: {
                  url: targetInfo.url,
                  openerUrl: page.url(),
                },
                pageState: {
                  url: targetInfo.url,
                  title: targetInfo.title || '',
                  readyState: 'complete',
                },
              };
              events.push(tabOpenEvent);
              console.log('[Recorder] CDP: Tab opened:', targetInfo.url);
            }
          }
        }
      );

      console.log('[Recorder] Browser-level CDP session created');
      return session;
    }
  } catch (e) {
    console.log('[Recorder] Failed to create browser CDP session:', e);
  }
  return null;
}

export function startPagePolling(
  page: Page,
  context: BrowserContext,
  isRecording: () => boolean,
  events: RecordedEvent[],
  startTime: number,
  recordingId: string,
  trackedPages: Set<Page>
): ReturnType<typeof setInterval> {
  const pollInterval = setInterval(async () => {
    if (!isRecording()) {
      clearInterval(pollInterval);
      return;
    }

    try {
      const browser = page.context().browser();
      const allPages: Page[] = [];
      if (browser) {
        for (const ctx of browser.contexts()) {
          allPages.push(...ctx.pages());
        }
      } else {
        allPages.push(...context.pages());
      }

      for (const newPage of allPages) {
        if (!trackedPages.has(newPage)) {
          const pageUrl = newPage.url();
          console.log('[Recorder] New page detected:', pageUrl);

          trackedPages.add(newPage);

          if (pageUrl === 'about:blank' || !pageUrl) {
            console.log('[Recorder] Tracking blank page, waiting for navigation...');

            try {
              await newPage.waitForURL(/^(?!about:blank).*/, { timeout: 10000 });
              const realUrl = newPage.url();
              console.log('[Recorder] Page navigated to:', realUrl);

              await injectScriptToPage(newPage, realUrl, page, events, startTime, recordingId);
            } catch (e) {
              console.log('[Recorder] Blank page did not navigate:', e);
            }
          } else {
            await injectScriptToPage(newPage, pageUrl, page, events, startTime, recordingId);
          }
        }
      }
    } catch (e) {
      console.log('[Recorder] Poll error:', e);
    }
  }, 500);

  return pollInterval;
}

export async function injectScriptToPage(
  newPage: Page,
  pageUrl: string,
  mainPage: Page,
  events: RecordedEvent[],
  startTime: number,
  recordingId: string
): Promise<void> {
  try {
    await newPage.waitForLoadState('domcontentloaded', { timeout: 5000 });

    await newPage.addScriptTag({
      content: getRecorderScript(),
    });

    await newPage.addScriptTag({
      content: `if (window.__pageRecorder) { window.__pageRecorder.start('${recordingId}'); }`,
    });

    console.log('[Recorder] Script injected successfully');
  } catch (e) {
    console.log('[Recorder] Failed to inject script:', e);
  }

  const tabOpenEvent: RecordedEvent = {
    id: `evt_${String(events.length + 1).padStart(3, '0')}`,
    type: 'tab_open',
    timestamp: Date.now() - startTime,
    data: {
      url: pageUrl,
      openerUrl: mainPage.url(),
    },
    pageState: {
      url: pageUrl,
      title: await newPage.title().catch(() => ''),
      readyState: 'complete',
    },
  };
  events.push(tabOpenEvent);
  console.log('[Recorder] Tab opened:', pageUrl);
}
