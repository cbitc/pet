import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 领域与运行时测试都是纯逻辑，不需要任何浏览器环境
    reporters: 'default'
  }
})
