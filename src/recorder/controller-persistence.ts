import type { Page } from 'playwright-core';
import type { RecordingSession, RecordedEvent } from './types.js';

export async function buildRecordingSession(
  page: Page,
  recordingId: string,
  name: string,
  startTime: number,
  startUrl: string,
  events: RecordedEvent[]
): Promise<RecordingSession> {
  return {
    id: recordingId,
    name: name,
    startTime: startTime,
    endTime: Date.now(),
    duration: Date.now() - startTime,
    startUrl: startUrl,
    viewport: page.viewportSize() || { width: 1280, height: 720 },
    events: events,
    metadata: {
      browser: 'Chromium',
      os: process.platform,
      userAgent: await page.evaluate(() => navigator.userAgent).catch(() => 'unknown'),
      recordedAt: new Date().toISOString(),
    },
  };
}

export function getDefaultOutputPath(startTime: number): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
  const recordingsDir = `${homeDir}/.mpage/recordings`;

  const date = new Date(startTime);
  const dateStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `rec_${dateStr}.yaml`;

  return `${recordingsDir}/${filename}`;
}

export function generateRecordingId(): string {
  return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
