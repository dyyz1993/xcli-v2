import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { Page, BrowserContext, Frame, CDPSession } from 'playwright-core';
import { getRecorderScript } from './inject.js';
import type { RecordingSession, RecorderStatus, RecordedEvent } from './types.js';
import {
  setupRouteInterception,
  setupCDPNavigationListener,
  createNavigationHandler,
  createPageHandler,
  deleteContextInit,
  registerActiveRecorder,
  unregisterActiveRecorder,
} from './controller-events.js';
import { setupBrowserCDPListener, startPagePolling } from './controller-tab-tracking.js';
import {
  buildRecordingSession,
  getDefaultOutputPath,
  generateRecordingId,
} from './controller-persistence.js';

export class RecorderController {
  private page: Page;
  private context: BrowserContext;
  private isRecordingFlag: boolean = false;
  private events: RecordedEvent[] = [];
  private recordingId: string;
  private startTime: number = 0;
  private startUrl: string = '';
  private name: string = '';
  private navigationHandler: ((frame: Frame) => Promise<void>) | null = null;
  private pageHandler: ((page: Page) => Promise<void>) | null = null;
  private trackedPages: Set<Page> = new Set();
  private browserCDPSession: CDPSession | null = null;
  private cdpClient: CDPSession | null = null;
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(page: Page) {
    this.page = page;
    this.context = page.context();
    this.recordingId = generateRecordingId();
  }

  async start(options: { url?: string; name?: string }): Promise<void> {
    if (this.isRecordingFlag) {
      throw new Error('Recording is already in progress');
    }

    this.isRecordingFlag = true;
    this.startTime = Date.now();
    this.events = [];
    this.name = options.name || '';
    this.recordingId = generateRecordingId();

    registerActiveRecorder(this.recordingId, this.events, this);

    // 1. Setup route to intercept event communication
    await setupRouteInterception(this.context);

    await this.ensureContextValid();

    // 2. Add init script with the recorder
    const initScript = getRecorderScript();
    await this.context.addInitScript(initScript);

    // 3. Navigate to URL
    if (options.url) {
      await this.page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      this.startUrl = options.url;
    } else {
      this.startUrl = this.page.url();
      await this.injectRecorderScript();
    }

    // 4. Start recording on current page
    await this.page.addScriptTag({
      content: `if (window.__pageRecorder) { window.__pageRecorder.start('${this.recordingId}'); }`,
    });

    // 4.1 Record initial page_load event
    const initialUrl = this.page.url();
    const initialPageLoadEvent: RecordedEvent = {
      id: `evt_${String(this.events.length + 1).padStart(3, '0')}`,
      type: 'page_load',
      timestamp: Date.now() - this.startTime,
      data: {
        url: initialUrl,
        persisted: false,
      },
      pageState: {
        url: initialUrl,
        title: await this.page.title().catch(() => ''),
        readyState: 'complete',
      },
    };
    this.events.push(initialPageLoadEvent);
    console.log('[Recorder] Initial page load event recorded:', initialUrl);

    // 5. Setup CDP-level navigation listener
    this.cdpClient = await setupCDPNavigationListener(
      this.page,
      this.isRecordingFlag,
      this.events,
      this.startTime
    );

    // 6. Setup Playwright navigation handler as backup
    this.navigationHandler = createNavigationHandler(
      this.page,
      () => this.isRecordingFlag,
      this.events,
      this.startTime,
      this.recordingId
    );
    this.page.on('framenavigated', this.navigationHandler);

    // 6.1 Setup context 'page' listener for new tabs
    this.pageHandler = createPageHandler(
      this.page,
      () => this.isRecordingFlag,
      this.events,
      this.startTime,
      this.recordingId,
      this.trackedPages
    );
    this.context.on('page', this.pageHandler);
    this.trackedPages.add(this.page);

    // 7. Setup browser-level CDP listener
    this.browserCDPSession = await setupBrowserCDPListener(
      this.page,
      this.isRecordingFlag,
      this.events,
      this.startTime,
      this.recordingId,
      this.trackedPages
    );

    // 8. Poll for new pages
    this.pollIntervalId = startPagePolling(
      this.page,
      this.context,
      () => this.isRecordingFlag,
      this.events,
      this.startTime,
      this.recordingId,
      this.trackedPages
    );
  }

  private async injectRecorderScript(): Promise<void> {
    await this.page.addScriptTag({ content: getRecorderScript() });
  }

  private async ensureContextValid(): Promise<void> {
    try {
      const pages = this.context.pages();
      if (pages.length === 0) {
        this.page = await this.context.newPage();
        console.log('[Recorder] Created new page in existing context');
      } else {
        try {
          await this.page.url();
        } catch {
          this.page = pages[0];
          console.log('[Recorder] Switched to existing page');
        }
      }
    } catch {
      const browser = this.context.browser();
      if (browser) {
        const oldContext = this.context;
        this.context = await browser.newContext();
        this.page = await this.context.newPage();
        deleteContextInit(oldContext);
        console.log('[Recorder] Created new context and page');
      }
    }
  }

  async stop(outputPath?: string): Promise<{ path: string; session: RecordingSession }> {
    if (!this.isRecordingFlag) {
      throw new Error('No recording in progress');
    }

    this.isRecordingFlag = false;

    if (this.navigationHandler) {
      this.page.off('framenavigated', this.navigationHandler);
      this.navigationHandler = null;
    }

    if (this.pageHandler) {
      this.context.off('page', this.pageHandler);
      this.pageHandler = null;
    }

    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    if (this.browserCDPSession) {
      try {
        await this.browserCDPSession.send('Target.setDiscoverTargets', { discover: false });
        await this.browserCDPSession.detach();
      } catch {
        // Ignore errors
      }
      this.browserCDPSession = null;
    }

    await Promise.all(
      Array.from(this.trackedPages).map(async (trackedPage) => {
        try {
          await trackedPage.addScriptTag({
            content: `if (window.__pageRecorder) { window.__pageRecorder.stop(); }`,
          });
        } catch {
          // Ignore errors if page is already closed
        }
      })
    );
    this.trackedPages.clear();

    unregisterActiveRecorder(this.recordingId);

    try {
      await this.page.addScriptTag({
        content: `if (window.__pageRecorder) { window.__pageRecorder.stop(); }`,
      });
    } catch {
      // Ignore errors if page is already closed
    }

    const session = await buildRecordingSession(
      this.page,
      this.recordingId,
      this.name,
      this.startTime,
      this.startUrl,
      this.events
    );

    const finalPath = outputPath || getDefaultOutputPath(this.startTime);

    const dir = path.dirname(finalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const yamlContent = yaml.stringify(session);
    fs.writeFileSync(finalPath, yamlContent, 'utf-8');

    return { path: finalPath, session };
  }

  getStatus(): RecorderStatus | null {
    if (!this.isRecordingFlag) return null;

    return {
      isRecording: true,
      eventCount: this.events.length,
      duration: Date.now() - this.startTime,
    };
  }

  get id(): string {
    return this.recordingId;
  }
}
