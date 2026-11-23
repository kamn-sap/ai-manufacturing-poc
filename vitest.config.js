import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['backend/**/*.test.js', 'infra/cdk/**/*.test.ts'],
    reporters: ['default', 'junit'],
    outputFile: { junit: 'unit-results.xml' },
  },
});
