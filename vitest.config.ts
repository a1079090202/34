import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // 测试一律用内存库，绝不碰店里的文件数据库
    env: { DRIVING_SCHOOL_DB: ':memory:' },
  },
  resolve: {
    alias: {
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
});
