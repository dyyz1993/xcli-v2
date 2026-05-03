import type { Page, BrowserContext, CDPSession } from 'playwright-core';
import { RecorderController, PlaybackEngine } from '@xcli-v2/browser-engine';

interface ScreencastDeps {
  page: Page;
  context: BrowserContext;
  onFrame: (frame: { data: string; sessionId: number; viewport: { width: number; height: number } | null }) => void;
}

export async function handleWsInitScreencast(deps: ScreencastDeps): Promise<unknown> {
  const cdpSession: CDPSession = await deps.context.newCDPSession(deps.page);
  await cdpSession.send('Page.startScreencast', { everyNthFrame: 1 });

  cdpSession.on('Page.screencastFrame', (frame: Record<string, unknown>) => {
    const data = frame.data as string;
    const cdpSessionId = frame.sessionId as number;
    const viewport = deps.page.viewportSize();
    const viewportData = viewport ? { width: viewport.width, height: viewport.height } : null;

    cdpSession.send('Page.screencastFrameAck', { sessionId: cdpSessionId }).catch(() => {});
    deps.onFrame({ data, sessionId: cdpSessionId, viewport: viewportData });
  });
  return { ok: true };
}

export async function handleRecorderStart(
  page: Page,
  params: Record<string, unknown>
): Promise<{ recorder: RecorderController; result: unknown }> {
  const recorder = new RecorderController(page);
  await recorder.start({
    url: params.url as string | undefined,
    name: params.recorderName as string | undefined,
  });
  return { recorder, result: { ok: true, recordingId: recorder.id } };
}

export async function handleRecorderStop(
  recorder: RecorderController,
  outputPath?: string
): Promise<unknown> {
  const recorderResult = await recorder.stop(outputPath);
  return { ok: true, path: recorderResult.path, eventCount: recorderResult.session.events.length };
}

export function handleRecorderStatus(recorder?: RecorderController): unknown {
  if (!recorder) return { ok: true, status: null };
  return { ok: true, status: recorder.getStatus() };
}

export async function handleReplayStart(
  page: Page,
  params: Record<string, unknown>
): Promise<unknown> {
  const engine = await PlaybackEngine.fromFile(page, params.filePath as string);
  const replayResult = await engine.play({ slowMo: (params.slowMo as number) || 1 });
  return { ok: true, result: replayResult };
}
