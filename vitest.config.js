import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/**/*.test.js'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'unit-results.xml' },
  },
});
