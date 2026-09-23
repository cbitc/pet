/**
 * 冒烟自检：以 PET_SMOKE=1 启动 dev，主进程在窗口就绪后截图到 .smoke/pet.png 并退出。
 * 用法：npm run smoke
 */
import { spawn } from 'node:child_process'

const env = {
  ...process.env,
  PET_SMOKE: '1',
  ELECTRON_ENABLE_LOGGING: '1'
}

const child = spawn('npx', ['electron-vite', 'dev'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
})

child.on('exit', (code) => process.exit(code ?? 1))
