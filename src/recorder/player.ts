import type { Page, CDPSession } from 'playwright-core';
import * as fs from 'fs';
import * as yaml from 'yaml';
import type {
  RecordingSession,
  RecordedEvent,
  WaitCondition,
  AssertCondition,
  PlaybackOptions,
  PlaybackResult,
  PlaybackError,
} from './types.js';

export class PlaybackEngine {
  private page: Page;
  private recording: RecordingSession;
  private cdpSession: CDPSession | null = null;

  constructor(page: Page, recording: RecordingSession) {
    this.page = page;
    this.recording = recording;
  }

  // eslint-disable-next-line require-await
  static async fromFile(page: Page, filePath: string): Promise<PlaybackEngine> {
    const content = fs.readFileSync(filePath, 'utf-8');
    const recording = yaml.parse(content) as RecordingSession;
    return new PlaybackEngine(page, recording);
  }

  private async ensureCDPSession(): Promise<CDPSession> {
    if (!this.cdpSession) {
      this.cdpSession = await this.page.context().newCDPSession(this.page);
    }
    return this.cdpSession;
  }

  private async sendKeyViaCDP(
    key: string,
    type: 'keyDown' | 'keyUp' | 'rawKeyDown' | 'char'
  ): Promise<void> {
    try {
      const cdp = await this.ensureCDPSession();
      const keyInfo = this.getKeyInfo(key);
      await cdp.send('Input.dispatchKeyEvent', {
        type,
        key: keyInfo.key,
        code: keyInfo.code,
        windowsVirtualKeyCode: keyInfo.windowsVirtualKeyCode,
        nativeVirtualKeyCode: keyInfo.nativeVirtualKeyCode,
      });
    } catch (e) {
      console.log(`[Playback] CDP key event failed: ${e}`);
    }
  }

  private getKeyInfo(key: string): {
    key: string;
    code: string;
    windowsVirtualKeyCode: number;
    nativeVirtualKeyCode: number;
  } {
    const keyMap: Record<
      string,
      { code: string; windowsVirtualKeyCode: number; nativeVirtualKeyCode: number }
    > = {
      Enter: { code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
      Tab: { code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
      Escape: { code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
      Backspace: { code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },
      Delete: { code: 'Delete', windowsVirtualKeyCode: 46, nativeVirtualKeyCode: 46 },
      ArrowUp: { code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
      ArrowDown: { code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
      ArrowLeft: { code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
      ArrowRight: { code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
      Shift: { code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16 },
      Control: { code: 'ControlLeft', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17 },
      Alt: { code: 'AltLeft', windowsVirtualKeyCode: 18, nativeVirtualKeyCode: 18 },
      Meta: { code: 'MetaLeft', windowsVirtualKeyCode: 91, nativeVirtualKeyCode: 91 },
    };

    if (keyMap[key]) {
      return { key, ...keyMap[key] };
    }

    if (key.length === 1) {
      const upperKey = key.toUpperCase();
      return {
        key,
        code: `Key${upperKey}`,
        windowsVirtualKeyCode: upperKey.charCodeAt(0),
        nativeVirtualKeyCode: upperKey.charCodeAt(0),
      };
    }

    return { key, code: key, windowsVirtualKeyCode: 0, nativeVirtualKeyCode: 0 };
  }

  async play(options: PlaybackOptions = {}): Promise<PlaybackResult> {
    const startTime = Date.now();
    const errors: PlaybackError[] = [];
    const { slowMo = 1, noDelay = false, stopOnError = true, onProgress } = options;

    const currentUrl = this.page.url();
    if (currentUrl !== this.recording.startUrl) {
      try {
        await this.page.goto(this.recording.startUrl, {
          timeout: 30000,
          waitUntil: 'domcontentloaded',
        });
      } catch (e) {
        console.log(
          `[Playback] Failed to goto ${this.recording.startUrl}, continuing with current page...`
        );
      }
    }

    if (this.recording.viewport) {
      await this.page.setViewportSize(this.recording.viewport);
    }

    // Aggregate consecutive mousemove events into trajectories
    const events = this.aggregateMouseMoveEvents(this.recording.events || []);

    for (let i = 0; i < events.length; i++) {
      const event = events[i];

      try {
        if (i > 0 && !noDelay) {
          const prevEvent = events[i - 1];
          const delay = event.timestamp - prevEvent.timestamp;
          if (delay > 0) {
            await this.page.waitForTimeout(delay * slowMo);
          }
        }

        if (event.waitBefore && event.waitBefore.length > 0) {
          await this.executeWaits(event.waitBefore);
        }

        await this.executeEvent(event);

        if (event.assertAfter && event.assertAfter.length > 0) {
          await this.executeAssertions(event.assertAfter);
        }

        if (onProgress) {
          onProgress({
            current: i + 1,
            total: events.length,
            event,
          });
        }
      } catch (error) {
        errors.push({
          eventIndex: i,
          event,
          error: (error as Error).message,
        });

        if (stopOnError) {
          break;
        }
      }
    }

    return {
      success: errors.length === 0,
      duration: Date.now() - startTime,
      eventsPlayed: events.length - errors.length,
      totalEvents: events.length,
      errors,
    };
  }

  private async executeWaits(conditions: WaitCondition[]): Promise<void> {
    for (const condition of conditions) {
      await this.executeWait(condition);
    }
  }

  private aggregateMouseMoveEvents(events: RecordedEvent[]): RecordedEvent[] {
    const result: RecordedEvent[] = [];
    let i = 0;

    console.log(`[Playback] Aggregating mousemove events, total events: ${events.length}`);

    while (i < events.length) {
      const event = events[i];

      // Check if this is a mousemove event
      if (event.type === 'mousemove') {
        const trajectoryPoints: Array<{ x: number; y: number; delay: number }> = [];
        const startTime = event.timestamp;

        // Collect consecutive mousemove events
        while (i < events.length && events[i].type === 'mousemove') {
          const currentEvent = events[i];
          const data = currentEvent.data || {};

          if (data.x !== undefined && data.y !== undefined) {
            trajectoryPoints.push({
              x: data.x,
              y: data.y,
              delay: i > 0 ? currentEvent.timestamp - events[i - 1].timestamp : 0,
            });
          }
          i++;
        }

        console.log(`[Playback] Found ${trajectoryPoints.length} consecutive mousemove events`);

        // If we have multiple points, create a trajectory event
        if (trajectoryPoints.length > 1) {
          result.push({
            id: `trajectory_${startTime}`,
            type: 'mousemove',
            timestamp: startTime,
            data: {
              points: trajectoryPoints,
              isTrajectory: true,
            },
            pageState: event.pageState,
          });
          console.log(`[Playback] Created trajectory event with ${trajectoryPoints.length} points`);
        } else if (trajectoryPoints.length === 1) {
          // Single mousemove, keep as is
          result.push(event);
        }
      } else {
        // Not a mousemove event, add as is
        result.push(event);
        i++;
      }
    }

    console.log(`[Playback] Aggregated events: ${result.length} (reduced from ${events.length})`);
    return result;
  }

  private async executeWait(condition: WaitCondition): Promise<void> {
    const timeout = condition.timeout || 30000;

    switch (condition.type) {
      case 'element_visible':
        if (condition.selector) {
          await this.page.waitForSelector(condition.selector, { state: 'visible', timeout });
        }
        break;

      case 'element_hidden':
        if (condition.selector) {
          await this.page.waitForSelector(condition.selector, { state: 'hidden', timeout });
        }
        break;

      case 'element_attached':
        if (condition.selector) {
          await this.page.waitForSelector(condition.selector, { state: 'attached', timeout });
        }
        break;

      case 'element_detached':
        if (condition.selector) {
          await this.page.waitForSelector(condition.selector, { state: 'detached', timeout });
        }
        break;

      case 'text_present':
        if (condition.text) {
          await this.page.waitForFunction(
            (text) => document.body.innerText.includes(text),
            condition.text,
            { timeout }
          );
        }
        break;

      case 'text_gone':
        if (condition.text) {
          await this.page.waitForFunction(
            (text) => !document.body.innerText.includes(text),
            condition.text,
            { timeout }
          );
        }
        break;

      case 'url_match':
        if (condition.url) {
          await this.page.waitForURL(condition.url, { timeout });
        }
        break;

      case 'page_load':
        await this.page.waitForLoadState('load', { timeout });
        break;

      case 'network_idle':
        await this.page.waitForLoadState('networkidle', { timeout });
        break;

      case 'timeout':
        await this.page.waitForTimeout(condition.timeout || 1000);
        break;
    }
  }

  private async waitForAICompletion(): Promise<void> {
    // Wait for AI streaming to complete
    // Check for loading indicators to disappear
    const loadingSelectors = [
      '[class*="generating"]',
      '[class*="loading"]',
      '[data-status="generating"]',
      '[data-state="streaming"]',
    ];

    for (const selector of loadingSelectors) {
      try {
        await this.page
          .waitForSelector(selector, {
            state: 'hidden',
            timeout: 30000,
          })
          .catch(() => {});
      } catch (e) {}
    }

    // Wait for network to be idle
    await this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Additional wait for DOM to stabilize
    await this.page.waitForTimeout(500);
  }

  private async executeAssertions(conditions: AssertCondition[]): Promise<void> {
    for (const condition of conditions) {
      await this.executeAssertion(condition);
    }
  }

  private async executeAssertion(condition: AssertCondition): Promise<void> {
    switch (condition.type) {
      case 'element_exists':
        if (condition.selector) {
          const element = await this.page.$(condition.selector);
          if (!element) {
            throw new Error(`Assertion failed: Element not found - ${condition.selector}`);
          }
        }
        break;

      case 'element_visible':
        if (condition.selector) {
          const visible = await this.page.isVisible(condition.selector);
          if (!visible) {
            throw new Error(`Assertion failed: Element not visible - ${condition.selector}`);
          }
        }
        break;

      case 'element_hidden':
        if (condition.selector) {
          const hidden = await this.page.isHidden(condition.selector);
          if (!hidden) {
            throw new Error(`Assertion failed: Element is visible - ${condition.selector}`);
          }
        }
        break;

      case 'text_equals':
        if (condition.selector && condition.expected !== undefined) {
          const text = await this.page.textContent(condition.selector);
          if (text !== condition.expected) {
            throw new Error(
              `Assertion failed: Text mismatch. Expected "${condition.expected}", got "${text}"`
            );
          }
        }
        break;

      case 'text_contains':
        if (condition.selector && condition.expected !== undefined) {
          const text = await this.page.textContent(condition.selector);
          if (!text?.includes(String(condition.expected))) {
            throw new Error(
              `Assertion failed: Text does not contain "${condition.expected}". Got "${text}"`
            );
          }
        }
        break;

      case 'url_equals':
        if (condition.expected !== undefined) {
          const url = this.page.url();
          if (url !== condition.expected) {
            throw new Error(
              `Assertion failed: URL mismatch. Expected "${condition.expected}", got "${url}"`
            );
          }
        }
        break;

      case 'url_contains':
        if (condition.expected !== undefined) {
          const url = this.page.url();
          if (!url.includes(String(condition.expected))) {
            throw new Error(
              `Assertion failed: URL does not contain "${condition.expected}". Got "${url}"`
            );
          }
        }
        break;
    }
  }

  private async executeEvent(event: RecordedEvent): Promise<void> {
    const data = event.data || {};

    switch (event.type) {
      case 'click':
        if (event.selector) {
          // Auto-wait for AI message to complete if clicking on message action buttons
          if (
            event.selector.includes('message_action') ||
            event.selector.includes('copy') ||
            event.selector.includes('regenerate') ||
            event.selector.includes('share')
          ) {
            console.log('[Playback] Clicking on message action, waiting for message completion...');
            await this.waitForAICompletion();
          }
          await this.page.click(event.selector);
        }
        break;

      case 'dblclick':
        if (event.selector) {
          await this.page.dblclick(event.selector);
        }
        break;

      case 'contextmenu':
        if (event.selector) {
          await this.page.click(event.selector, { button: 'right' });
        }
        break;

      case 'mousedown':
        if (event.selector) {
          await this.page.hover(event.selector);
        }
        break;

      case 'mouseup':
        // Usually paired with mousedown, no action needed
        break;

      case 'mousemove':
        if (data.points && Array.isArray(data.points)) {
          // Trajectory mode - multiple points
          for (const point of data.points) {
            if (point.x !== undefined && point.y !== undefined) {
              await this.page.mouse.move(point.x, point.y);
              if (point.delay && point.delay > 0) {
                await this.page.waitForTimeout(point.delay);
              }
            }
          }
        } else if (data.x !== undefined && data.y !== undefined) {
          // Single point mode
          await this.page.mouse.move(data.x, data.y);
        }
        break;

      case 'hover_enter':
        if (event.selector) {
          await this.page.hover(event.selector);
        }
        break;

      case 'hover_leave':
        // Move mouse away from element
        await this.page.mouse.move(0, 0);
        break;

      case 'scroll':
        try {
          await this.page.evaluate((scrollData) => {
            window.scrollTo(scrollData.scrollX || 0, scrollData.scrollY || 0);
          }, data);
        } catch (e) {
          console.log(`[Playback] Scroll failed (possibly cross-origin frame): ${e}`);
        }
        break;

      case 'keydown':
        if (data.key) {
          await this.sendKeyViaCDP(data.key, 'keyDown');
        }
        break;

      case 'keyup':
        if (data.key) {
          await this.sendKeyViaCDP(data.key, 'keyUp');
        }
        break;

      case 'input':
        if (event.selector && data.value !== undefined) {
          const currentValue = await this.page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return el ? (el as HTMLInputElement).value || el.textContent || '' : '';
          }, event.selector);
          if (data.value.length > currentValue.length) {
            const newChars = data.value.slice(currentValue.length);
            for (const char of newChars) {
              await this.sendKeyViaCDP(char, 'char');
            }
          } else if (data.value !== currentValue) {
            await this.page.fill(event.selector, data.value);
          }
        }
        break;

      case 'change':
        if (event.selector) {
          // Always use fill for text inputs, only use check/uncheck for actual checkboxes/radios
          if (data.value !== undefined) {
            await this.page.fill(event.selector, data.value);
          } else if (data.checked !== undefined) {
            // Only handle checked for actual checkboxes/radios
            const element = await this.page.$(event.selector);
            const isCheckboxOrRadio = element
              ? await element.evaluate((el) => {
                  const input = el as HTMLInputElement;
                  return input.type === 'checkbox' || input.type === 'radio';
                })
              : false;

            if (isCheckboxOrRadio) {
              if (data.checked) {
                await this.page.check(event.selector);
              } else {
                await this.page.uncheck(event.selector);
              }
            }
          }
        }
        break;

      case 'focus':
        if (event.selector) {
          await this.page.focus(event.selector);
        }
        break;

      case 'blur':
        // Blur by focusing on body
        await this.page.focus('body');
        break;

      case 'select':
        if (event.selector && data.value !== undefined) {
          await this.page.selectOption(event.selector, data.value);
        }
        break;

      case 'navigation':
        if (data.url) {
          try {
            await this.page.goto(data.url, { timeout: 15000 });
          } catch (e) {
            console.log(`[Playback] Navigation timeout for ${data.url}, continuing...`);
          }
        }
        break;

      case 'page_load':
        await this.page.waitForLoadState('domcontentloaded');
        break;

      case 'hash_change':
        if (data.url) {
          await this.page.goto(data.url);
        }
        break;

      case 'tab_open':
        // Handle new tab opening - navigate to the URL
        if (data.url) {
          console.log(`[Playback] Opening tab: ${data.url}`);
          await this.page.goto(data.url);
        }
        break;

      case 'file_upload':
        if (event.selector && data.files) {
          await this.page.setInputFiles(event.selector, data.files);
        }
        break;

      case 'wait':
        // Wait event is handled by waitBefore
        break;

      case 'assert':
        // Assert event is handled by assertAfter
        break;
    }
  }
}
