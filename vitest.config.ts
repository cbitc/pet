import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 领域与运行时测试都是纯逻辑，不需要任何浏览器环境
    reporters: 'default',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // 只统计「纯逻辑」层：Electron/DOM 适配器不在此环境运行，统计无意义
      include: [
        'src/domain/**/*.ts',
        'src/shared/**/*.ts',
        'src/contracts/**/*.ts',
        'src/app/**/*.ts'
      ],
      // 纯类型 / 常量声明没有可执行语句，纳入只会制造 0% 噪声
      exclude: [
        '**/*.d.ts',
        'src/contracts/ipc.ts',
        'src/contracts/model-catalog.ts',
        'src/contracts/wire-protocol.ts'
      ],
      // 防止纯逻辑层覆盖率回退（当前约 97% 语句 / 99% 行）
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 95
      }
    }
  }
})
