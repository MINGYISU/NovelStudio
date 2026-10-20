import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Safety net: anything that forgets to pass a data dir can never fall back to the real one.
    env: { NOVEL_DATA_DIR: path.join(os.tmpdir(), 'novelstudio-test-unused') },
  },
});
