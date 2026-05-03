import * as fs from 'fs';
import * as path from 'path';
import { homedir } from 'os';

const ARCHIVE_DIR = path.join(homedir(), '.xcli', 'archives');

export interface ToolCallRecord {
  tool: string;
  params: unknown[];
  result: 'success' | 'failure';
  duration: number;
  timestamp: number;
}

export interface CommandArchiveEntry {
  step: number;
  command: string;
  params: Record<string, unknown>;
  result: {
    success: boolean;
    data: unknown;
    message?: string;
    tips: string[];
  };
  toolCalls: ToolCallRecord[];
  duration: number;
  timestamp: number;
  validation?: {
    l1_functional: { status: string; detail: string };
    l2_behavior: { status: string; score: number; details: string[] };
    l3_regression: { status: string; diff: string[] };
  };
}

export interface OutlineEntry {
  step: number;
  type: 'command';
  command: string;
  status: 'success' | 'failure';
  duration: number;
}

export interface SessionArchive {
  id: string;
  name: string;
  url: string;
  createdAt: string;
  endedAt: string;
  outline: OutlineEntry[];
  commands: CommandArchiveEntry[];
}

function getArchivePath(sessionId: string): string {
  return path.join(ARCHIVE_DIR, `${sessionId}.json`);
}

function ensureArchiveDir(): void {
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

export function saveArchive(archive: SessionArchive): string {
  ensureArchiveDir();
  const filePath = getArchivePath(archive.id);
  archive.endedAt = new Date().toISOString();
  fs.writeFileSync(filePath, JSON.stringify(archive, null, 2), 'utf-8');
  return filePath;
}

export function loadArchive(sessionId: string): SessionArchive | null {
  const filePath = getArchivePath(sessionId);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SessionArchive;
}

export function listArchives(): SessionArchive[] {
  ensureArchiveDir();
  const files = fs.readdirSync(ARCHIVE_DIR).filter((f) => f.endsWith('.json'));
  return files.map((f) => {
    const raw = fs.readFileSync(path.join(ARCHIVE_DIR, f), 'utf-8');
    return JSON.parse(raw) as SessionArchive;
  });
}

export function searchArchives(options: {
  failed?: boolean;
  command?: string;
  site?: string;
  from?: string;
  to?: string;
}): SessionArchive[] {
  let archives = listArchives();

  if (options.from) {
    const from = new Date(options.from).getTime();
    archives = archives.filter((a) => new Date(a.createdAt).getTime() >= from);
  }
  if (options.to) {
    const to = new Date(options.to).getTime();
    archives = archives.filter((a) => new Date(a.createdAt).getTime() <= to);
  }
  if (options.failed) {
    archives = archives.filter((a) => a.commands.some((c) => !c.result.success));
  }
  if (options.command) {
    archives = archives.filter((a) =>
      a.commands.some((c) => c.command.includes(options.command!))
    );
  }
  if (options.site) {
    archives = archives.filter((a) => a.url.includes(options.site!));
  }

  return archives;
}

export function diffArchives(
  archiveA: SessionArchive,
  archiveB: SessionArchive,
  commandFilter?: string
): {
  commandA: CommandArchiveEntry | null;
  commandB: CommandArchiveEntry | null;
  differences: string[];
}[] {
  const commandsA = commandFilter
    ? archiveA.commands.filter((c) => c.command.includes(commandFilter))
    : archiveA.commands;
  const commandsB = commandFilter
    ? archiveB.commands.filter((c) => c.command.includes(commandFilter))
    : archiveB.commands;

  const results: {
    commandA: CommandArchiveEntry | null;
    commandB: CommandArchiveEntry | null;
    differences: string[];
  }[] = [];

  const maxLen = Math.max(commandsA.length, commandsB.length);
  for (let i = 0; i < maxLen; i++) {
    const cmdA = commandsA[i] || null;
    const cmdB = commandsB[i] || null;
    const diffs: string[] = [];

    if (cmdA && cmdB) {
      if (cmdA.result.success !== cmdB.result.success) {
        diffs.push(`success: ${cmdA.result.success} → ${cmdB.result.success}`);
      }
      if (cmdA.duration !== cmdB.duration) {
        diffs.push(`duration: ${cmdA.duration}ms → ${cmdB.duration}ms`);
      }
      const dataA = JSON.stringify(cmdA.result.data);
      const dataB = JSON.stringify(cmdB.result.data);
      if (dataA !== dataB) {
        const lenA = Array.isArray(cmdA.result.data) ? cmdA.result.data.length : -1;
        const lenB = Array.isArray(cmdB.result.data) ? cmdB.result.data.length : -1;
        if (lenA >= 0 && lenB >= 0) {
          diffs.push(`data count: ${lenA} → ${lenB}`);
        } else {
          diffs.push(`data changed`);
        }
      }
    } else {
      diffs.push(cmdA ? 'only in A' : 'only in B');
    }

    results.push({ commandA: cmdA, commandB: cmdB, differences: diffs });
  }

  return results;
}

export function appendCommandToArchive(
  sessionId: string,
  sessionName: string,
  sessionUrl: string,
  entry: CommandArchiveEntry
): void {
  let archive = loadArchive(sessionId);
  if (!archive) {
    archive = {
      id: sessionId,
      name: sessionName,
      url: sessionUrl,
      createdAt: new Date().toISOString(),
      endedAt: '',
      outline: [],
      commands: [],
    };
  }

  archive.commands.push(entry);
  archive.outline.push({
    step: entry.step,
    type: 'command',
    command: entry.command,
    status: entry.result.success ? 'success' : 'failure',
    duration: entry.duration,
  });

  saveArchive(archive);
}
