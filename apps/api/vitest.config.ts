import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/taskboard_test',
    },
    fileParallelism: false,
  },
});
