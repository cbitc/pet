/**
 * 渲染诊断运行器：以 PET_DIAG=1 启动 dev，采集主进程/渲染进程日志，
 * 窗口显示后在多个时间点抓「屏幕实拍」（能看到原生合成结果）与「页面截图」，
 * 结束后自动退出。产物在 .diag/。
 *
 * 用法：
 *   node scripts/diag-render.mjs                     # 默认
 *   node scripts/diag-render.mjs --nogpu             # 关闭硬件加速对照
 *   node scripts/diag-render.mjs --switch=disable-gpu
 *   node scripts/diag-render.mjs --features=UseSkiaRenderer
 *
 * 分析：node scripts/analyze-diag.mjs
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'

const args = process.argv.slice(2)
const env = {
  ...process.env,
  PET_DIAG: '1',
  ELECTRON_ENABLE_LOGGING: '1'
}

const logName = []
for (const a of args) {
  const m = /^--(nogpu|switch|features|ms|minimal|scene)(?:=(.*))?$/.exec(a)
  if (!m) continue
  const [, key, val] = m
  if (key === 'nogpu') {
    env.PET_DIAG_NOGPU = '1'
    logName.push('nogpu')
  } else if (key === 'minimal') {
    env.PET_DIAG_MINIMAL = '1'
    logName.push('minimal')
  } else if (key === 'scene') {
    env.PET_DIAG_SCENARIO = val ?? 'dom'
    env.PET_DIAG_LABEL = `scene-${val ?? 'dom'}`
    logName.push(`scene-${val ?? 'dom'}`)
  } else if (key === 'switch') {
    env.PET_DIAG_SWITCH = val ?? ''
    logName.push(`sw-${(val ?? 'none').replace(/[^\w-]/g, '_')}`)
  } else if (key === 'features') {
    env.PET_DIAG_DISABLE_FEATURES = val ?? ''
    logName.push(`ft-${(val ?? 'none').replace(/[^\w-]/g, '_')}`)
  } else if (key === 'ms') {
    env.PET_DIAG_MS = val ?? '7000'
  }
}

fs.mkdirSync('.diag', { recursive: true })
const logPath = `.diag/run-${logName.join('-') || 'default'}.log`
const out = fs.createWriteStream(logPath)

console.log(`[diag] 启动 electron-vite dev（PET_DIAG=1）→ ${logPath}`)

const child = spawn('npx', ['electron-vite', 'dev'], {
  env,
  shell: process.platform === 'win32',
  stdio: ['ignore', 'pipe', 'pipe']
})

const relay = (chunk) => {
  const text = chunk.toString()
  out.write(text)
  process.stdout.write(text)
}
child.stdout.on('data', relay)
child.stderr.on('data', relay)

child.on('exit', (code) => {
  out.end()
  console.log(`[diag] electron-vite 退出 code=${code}`)
  const files = fs.existsSync('.diag') ? fs.readdirSync('.diag').filter((f) => f.endsWith('.png')) : []
  console.log(`[diag] 截图 ${files.length} 张: ${files.join(', ') || '(无)'}`)
})
