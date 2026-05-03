import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'session-daemon': 'src/daemon/session-daemon.ts',
    'worker-entry': 'src/daemon/worker-entry.ts',
  },
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
});
