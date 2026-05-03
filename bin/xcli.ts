#!/usr/bin/env node

import { readdirSync, existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import {
  Core,
  parseArgs,
  coerceCliArgs,
  wrapResult,
  outputFormatter,
  helpGenerator,
  checkGuard,
  loadConfig,
  saveConfig,
  suggestCommand,
  createSelfEvolveEngine,
} from '@dyyz1993/xcli-core';
import type { CommandContext, CommandResult, OutputMode, SelfEvolveEngine } from '@dyyz1993/xcli-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const core = new Core({
  name: 'xcli',
  version: '2.0.0',
  description: 'Extensible browser automation CLI powered by @dyyz1993/xcli-core',
  configDirName: '.xcli',
  envPrefix: 'XCLI',
  pluginDirs: ['./plugins', './.xcli/plugins', '~/.xcli/plugins'],
  pluginPackageName: 'xcli',
});

const evolveEngine: SelfEvolveEngine = createSelfEvolveEngine({
  historyFile: join(homedir(), '.xcli', 'evolve-history.json'),
  maxRecords: 1000,
});

interface XcliConfig {
  api?: { baseUrl?: string };
  output?: { mode?: string };
  daemon?: { autoStart?: boolean; port?: number };
  cdp?: { defaultPort?: number };
}

const BUILTIN_COMMANDS = ['version', 'config', 'help', 'plugins', 'daemon'] as const;

function getConfigDir(): string {
  return join(homedir(), '.xcli');
}

function loadXcliConfig(): XcliConfig {
  const configPath = join(getConfigDir(), 'config.json');
  if (!existsSync(configPath)) return {};
  try {
    return JSON.parse(readFileSync(configPath, 'utf-8'));
  } catch {
    return {};
  }
}

function saveXcliConfig(config: XcliConfig): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function parseConfigValue(value: string): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
  return value;
}

function resolveOutputMode(options: Record<string, unknown>): OutputMode {
  if (options.json) return 'json';
  if (options.yaml) return 'yaml';
  return 'text';
}

function outputFlags(options: Record<string, unknown>) {
  return {
    color: !options['no-color'] as boolean,
    emoji: !options['no-emoji'] as boolean,
    showTips: !options['no-tips'] as boolean,
  };
}

// --- Plugin & builtin loading ---

async function loadBuiltinCommands(): Promise<void> {
  const builtinsDir = join(__dirname, '..', 'packages', 'builtins', 'src');
  for (const category of ['browser', 'storage', 'system']) {
    const categoryDir = join(builtinsDir, category);
    if (!existsSync(categoryDir)) continue;
    try {
      for (const entry of readdirSync(categoryDir)) {
        if (!entry.endsWith('.ts') && !entry.endsWith('.js')) continue;
        try {
          const mod = await import(join(categoryDir, entry));
          if (mod.register && typeof mod.register === 'function') mod.register(core);
        } catch { /* skip */ }
      }
    } catch { /* skip unreadable */ }
  }
}

async function loadPlugins(): Promise<string[]> {
  const errors: string[] = [];
  const cwd = process.cwd();
  const dirs = [
    join(cwd, 'plugins'),
    join(cwd, '.xcli', 'plugins'),
    join(homedir(), '.xcli', 'plugins'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    try {
      for (const entry of readdirSync(dir)) {
        const pluginPath = join(dir, entry, 'index.ts');
        if (!existsSync(pluginPath)) continue;
        try {
          await core.loader.loadPlugin(pluginPath, entry);
          evolveEngine.record({ type: 'plugin_loaded', plugin: entry, status: 'ok' });
        } catch (err) {
          errors.push(entry);
          evolveEngine.record({
            type: 'plugin_loaded', plugin: entry, status: 'error',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } catch { /* ignore */ }
  }
  return errors;
}

// --- CDP & Daemon helpers ---

async function resolveCdpEndpoint(options: Record<string, unknown>): Promise<string | undefined> {
  const cdpFlag = options.cdp;
  if (!cdpFlag || cdpFlag === true) return undefined;
  const cdpStr = String(cdpFlag);
  if (/^\d+$/.test(cdpStr)) {
    try {
      const res = await fetch(`http://localhost:${cdpStr}/json/version`);
      const data = (await res.json()) as { webSocketDebuggerUrl?: string };
      return data.webSocketDebuggerUrl;
    } catch {
      console.error(`Cannot connect to CDP port ${cdpStr}`);
      process.exit(1);
    }
  }
  return cdpStr;
}

async function ensureDaemonRunning(options: Record<string, unknown>): Promise<void> {
  const config = loadXcliConfig();
  if (config.daemon?.autoStart === false) return;
  const port = (options.daemonPort as number) ?? config.daemon?.port ?? 9527;
  try {
    const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) return;
  } catch { /* not running */ }
  try {
    const { startDaemon } = await import('../packages/daemon/src/index.js');
    await startDaemon({ port });
    evolveEngine.record({ type: 'daemon_start', port, status: 'ok' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    evolveEngine.record({ type: 'daemon_start', port, status: 'error', error: msg });
    console.error(`[daemon] Failed to start: ${msg}`);
  }
}

// --- Help ---

function showHelp(options: Record<string, unknown>): void {
  const { color, emoji } = outputFlags(options);
  const sites = core.loader.getSites();
  const h = emoji ? '🌐' : '';

  console.log(`\n${h} xcli - Extensible browser automation CLI\n`);
  console.log('Usage: xcli <site> <command> [options]');
  console.log('       xcli <builtin> [args]\n');
  console.log('Builtin commands:');
  console.log('  version          Show version');
  console.log('  config           Manage configuration');
  console.log('  plugins          List loaded plugins');
  console.log('  daemon           Manage browser daemon');
  console.log('  help             Show this help\n');

  if (sites.length > 0) {
    console.log('Sites (plugins):');
    for (const site of sites) {
      const cmds = site.getAllCommands();
      const desc = site.config.description ? ` - ${site.config.description}` : '';
      console.log(`\n  ${site.name}${desc}`);
      for (const c of cmds) console.log(`    ${c.name.padEnd(14)} ${c.description}`);
    }
  }

  console.log('\nFlags:');
  console.log('  --json           JSON output');
  console.log('  --yaml           YAML output');
  console.log('  --no-color       Disable colored output');
  console.log('  --no-emoji       Disable emoji in output');
  console.log('  --no-tips        Disable tips');
  console.log('  --cdp <port|url> Connect to Chrome via CDP');
  console.log('  --help, -h       Show help\n');
}

// --- Builtin command handlers ---

async function executeBuiltin(cmd: string, args: string[], options: Record<string, unknown>): Promise<boolean> {
  if (cmd === 'version') { console.log(`xcli v${core.version}`); return true; }
  if (cmd === 'help') { showHelp(options); return true; }
  if (cmd === 'plugins') return handlePluginsCommand(args);
  if (cmd === 'config') return handleConfigCommand(args);
  if (cmd === 'daemon') return handleDaemonCommand(args);
  return false;
}

async function handlePluginsCommand(args: string[]): Promise<boolean> {
  const sub = args[0];
  if (sub === 'errors') {
    const records = evolveEngine.query({ type: 'plugin_loaded', status: 'error' });
    if (records.length === 0) { console.log('No plugin loading errors.'); return true; }
    console.log('Plugin loading errors:\n');
    for (const r of records) console.log(`  ${r.plugin}: ${r.error}`);
    return true;
  }

  const plugins = core.loader.getLoadedPlugins();
  if (plugins.length === 0) { console.log('No plugins loaded.'); return true; }
  console.log('Loaded plugins:\n');
  for (const p of plugins) {
    const cmds = p.getRegisteredCommands();
    console.log(`  ${p.id.padEnd(20)} status=${p.status}  commands=[${cmds.join(', ')}]`);
  }
  return true;
}

async function handleConfigCommand(args: string[]): Promise<boolean> {
  const sub = args[0];
  if (!sub || sub === 'list') { console.log(JSON.stringify(loadXcliConfig(), null, 2)); return true; }

  if (sub === 'get') {
    const key = args[1];
    if (!key) { console.error('Usage: xcli config get <key>'); return true; }
    let val: unknown = loadXcliConfig();
    for (const part of key.split('.')) {
      val = val && typeof val === 'object' ? (val as Record<string, unknown>)[part] : undefined;
    }
    console.log(val !== undefined ? JSON.stringify(val) : '(not set)');
    return true;
  }

  if (sub === 'set') {
    const [key, value] = args.slice(1);
    if (!key || value === undefined) { console.error('Usage: xcli config set <key> <value>'); return true; }
    const config = loadXcliConfig();
    const parts = key.split('.');
    let target = config as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]] || typeof target[parts[i]] !== 'object') target[parts[i]] = {};
      target = target[parts[i]] as Record<string, unknown>;
    }
    target[parts[parts.length - 1]] = parseConfigValue(value);
    saveXcliConfig(config);
    console.log(`Set ${key} = ${value}`);
    return true;
  }

  console.error(`Unknown config subcommand: ${sub}`);
  return true;
}

async function handleDaemonCommand(args: string[]): Promise<boolean> {
  const sub = args[0];
  const config = loadXcliConfig();
  const port = config.daemon?.port ?? 9527;

  if (sub === 'status') {
    try {
      const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(1500) });
      const data = (await res.json()) as { pid?: number; uptime?: number };
      console.log(`Daemon running on port ${port} (pid=${data.pid}, uptime=${data.uptime}s)`);
    } catch { console.log(`Daemon not running (port ${port})`); }
    return true;
  }

  if (sub === 'start') {
    const startPort = Number(args[1]) || port;
    try {
      const { startDaemon } = await import('../packages/daemon/src/index.js');
      await startDaemon({ port: startPort });
      console.log(`Daemon started on port ${startPort}`);
    } catch (err) { console.error(`Failed to start daemon: ${err instanceof Error ? err.message : err}`); }
    return true;
  }

  if (sub === 'stop') {
    try {
      const res = await fetch(`http://localhost:${port}/shutdown`, { method: 'POST', signal: AbortSignal.timeout(1500) });
      console.log(res.ok ? 'Daemon stopped.' : 'Failed to stop daemon.');
    } catch { console.log('Daemon not running.'); }
    return true;
  }

  console.error('Usage: xcli daemon [status|start|stop]');
  return true;
}

// --- Site command execution ---

async function executeSiteCommand(
  siteName: string,
  cmdName: string,
  args: string[],
  options: Record<string, unknown>,
  cdpEndpoint?: string,
): Promise<void> {
  const site = core.loader.getSite(siteName);
  if (!site) { console.error(`Unknown site: ${siteName}`); process.exit(1); }
  const { color, emoji, showTips } = outputFlags(options);

  if (cmdName === 'help') {
    const cmds = site.getAllCommands();
    console.log(helpGenerator.generateSiteHelp(site.name, site.url, cmds, { cliName: 'xcli', color, emoji }));
    return;
  }

  const cmd = site.getCommand(cmdName);
  if (!cmd) {
    console.error(`Unknown command: ${siteName} ${cmdName}`);
    const suggestion = suggestCommand(cmdName, site.getAllCommands().map((c) => c.name));
    if (suggestion) console.error(`Did you mean: xcli ${siteName} ${suggestion}?`);
    console.log('\nAvailable commands:');
    for (const c of site.getAllCommands()) console.log(`  ${c.name.padEnd(15)} ${c.description}`);
    process.exit(1);
  }

  if (options.help || options.h) {
    console.log(helpGenerator.generate({
      name: `${siteName} ${cmdName}`, description: cmd.description,
      parameters: cmd.parameters, result: cmd.result, examples: cmd.examples, tips: cmd.tips,
    }, { color, emoji }));
    return;
  }

  const guardResult = checkGuard(core, `${siteName} ${cmdName}`);
  if (guardResult?.blocked) { console.error(guardResult.message); process.exit(1); }

  await ensureDaemonRunning(options);

  const ctx: CommandContext = {
    args, options, cwd: process.cwd(), page: null,
    storage: site.getStorage(),
    output: { mode: resolveOutputMode(options), showTips, color, emoji },
    error: (msg: string) => console.error(msg),
    config: loadXcliConfig() as Record<string, unknown>,
    site, cliName: 'xcli', cdpEndpoint,
  };

  const coerced = coerceCliArgs(cmd.parameters, options);
  let finalParams: Record<string, unknown> = coerced;
  if (cmd.parameters) {
    try {
      finalParams = cmd.parameters.parse(coerced) as Record<string, unknown>;
    } catch (validationErr) {
      const zodErr = validationErr as { errors?: Array<{ path: (string | number)[]; message: string }> };
      const msgs = zodErr.errors?.map((e) => `${e.path.join('.')}: ${e.message}`) ?? [String(validationErr)];
      console.error(`Validation error: ${msgs.join(', ')}`);
      process.exit(1);
    }
  }

  const start = Date.now();
  try {
    const raw = await cmd.handler(finalParams, ctx);
    const result: CommandResult = wrapResult(raw);
    const duration = Date.now() - start;
    evolveEngine.record({ type: 'command_executed', command: `${siteName} ${cmdName}`, duration, status: result.success ? 'ok' : 'error' });

    const mode = resolveOutputMode(options);
    if (mode === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      if (result.success) {
        const formatted = outputFormatter.format(result.data, { mode: mode === 'yaml' ? 'yaml' : 'text', color, emoji });
        if (formatted) console.log(formatted);
      } else {
        console.error(outputFormatter.formatError(result.message || 'Command failed', { color, emoji }));
      }
      if (result.tips.length > 0 && showTips) {
        for (const tip of result.tips) console.log(emoji ? `💡 ${tip}` : `Tip: ${tip}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    evolveEngine.record({ type: 'command_executed', command: `${siteName} ${cmdName}`, duration: Date.now() - start, status: 'error', error: message });
    if (message === 'NOT_LOGGED_IN') {
      console.error('Not logged in. Run: xcli config set auth.token <token>');
    } else if (message === 'DAEMON_NOT_RUNNING') {
      console.error('Daemon is not running. Run: xcli daemon start');
    } else {
      console.error(outputFormatter.formatError(message, { color, emoji }));
    }
    process.exit(1);
  }
}

// --- Main entry ---

async function main(): Promise<void> {
  const pluginErrors = await loadPlugins();
  await loadBuiltinCommands();

  const argv = process.argv.slice(2);
  const { positional, options } = parseArgs(argv);

  if (positional.length === 0) {
    showHelp(options);
    if (pluginErrors.length > 0) {
      console.log(`[Warning] ${pluginErrors.length} plugin(s) failed to load: ${pluginErrors.join(', ')}`);
    }
    return;
  }

  const [cmd, ...cmdArgs] = positional;
  const { color, emoji } = outputFlags(options);

  // Try site resolution first
  const site = core.loader.getSite(cmd);
  if (site) {
    if ((options.help || options.h) && cmdArgs.length === 0) {
      console.log(helpGenerator.generateSiteHelp(site.name, site.url, site.getAllCommands(), { cliName: 'xcli', color, emoji }));
      return;
    }
    const cdpEndpoint = await resolveCdpEndpoint(options);
    const siteCmd = cmdArgs[0] || 'help';
    await executeSiteCommand(cmd, siteCmd, cmdArgs.slice(1), options, cdpEndpoint);
    return;
  }

  // Try builtin commands
  for (const builtin of BUILTIN_COMMANDS) {
    if (cmd === builtin) {
      await executeBuiltin(cmd, cmdArgs, options);
      return;
    }
  }

  if (options.help || options.h) { showHelp(options); return; }

  // Suggest similar commands
  const allNames = [...core.loader.getSites().map((s) => s.name), ...BUILTIN_COMMANDS];
  const suggestion = suggestCommand(cmd, allNames);
  if (suggestion) {
    console.error(`Unknown command: ${cmd}\nDid you mean: xcli ${suggestion}?`);
  } else {
    console.error(`Unknown command: ${cmd}\nRun 'xcli help' for usage.`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
