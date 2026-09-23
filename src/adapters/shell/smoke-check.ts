/**
 * 冒烟自检钩子（主进程侧）——仅由 PET_SMOKE=1 触发，正常运行完全不参与。
 *
 * 它模拟真实用户操作，覆盖那些只能端到端验证的路径：
 *   点击宠物（应为点击，非拖动）→ 输入框弹出
 *   拖动宠物 → 位置改变 → 防抖后落盘
 *   说一句话 → 输入→运行时→IPC→网关→Mock 心智→流式回包
 * 随后截图宠物页与设置页，交回 scripts/smoke.mjs 判定。
 */

import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { store } from './config-store'

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

function outDir(): string {
  // 打包态 getAppPath() 指向 app.asar（只读），改用 exe 所在目录
  return app.isPackaged
    ? path.join(path.dirname(process.execPath), '.smoke')
    : path.join(app.getAppPath(), '.smoke')
}

async function capture(win: BrowserWindow, name: string): Promise<void> {
  try {
    const image = await win.webContents.capturePage()
    const dir = outDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, name), image.toPNG())
    console.log(`[smoke] screenshot -> ${path.join(dir, name)}`)
  } catch (err) {
    console.error(`[smoke] capture ${name} failed`, err)
  }
}

/** 在页面里按归一化坐标派发一次完整点击 */
const CLICK_SCRIPT = `(async () => {
  const cfg = await window.pet.getConfig()
  const at = { x: Math.round(innerWidth * cfg.pose.x), y: Math.round(innerHeight * cfg.pose.y) }
  const fire = (type) => {
    const e = new PointerEvent(type, { bubbles: true, button: 0 })
    Object.defineProperty(e, 'clientX', { value: at.x })
    Object.defineProperty(e, 'clientY', { value: at.y })
    window.dispatchEvent(e)
  }
  fire('pointerdown'); fire('pointerup')
  await new Promise((r) => setTimeout(r, 120))
  return { at, inputVisible: !document.getElementById('input-bar').hidden }
})()`

/** 拖动宠物：按段派发 pointermove，最后松手 */
const DRAG_SCRIPT = `(async () => {
  const cfg = await window.pet.getConfig()
  const start = { x: Math.round(innerWidth * cfg.pose.x), y: Math.round(innerHeight * cfg.pose.y) }
  const fire = (type, x, y) => {
    const e = new PointerEvent(type, { bubbles: true, button: 0 })
    Object.defineProperty(e, 'clientX', { value: x })
    Object.defineProperty(e, 'clientY', { value: y })
    window.dispatchEvent(e)
  }
  fire('pointerdown', start.x, start.y)
  for (let i = 1; i <= 6; i++) {
    fire('pointermove', start.x + i * 12, start.y + i * 8)
    await new Promise((r) => setTimeout(r, 16))
  }
  fire('pointerup', start.x + 72, start.y + 48)
})()`

const SPEAK_SCRIPT = `(() => {
  const input = document.getElementById('chat-input')
  input.value = '你好呀，冒烟测试！'
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  return 'ok'
})()`

/** 启动冒烟流程；返回后由调用方负责最终退出 */
export function runSmokeCheck(petWin: BrowserWindow, openSettings: () => BrowserWindow | null): void {
  petWin.once('ready-to-show', () => {
    void (async () => {
      try {
        await sleep(1500)

        const clicked = (await petWin.webContents.executeJavaScript(CLICK_SCRIPT)) as {
          at: { x: number; y: number }
          inputVisible: boolean
        }
        console.log(
          `[smoke] 点击宠物 @${clicked.at.x},${clicked.at.y} → 输入框${clicked.inputVisible ? '已弹出 PASS' : '未弹出 FAIL'}`
        )

        const before = store.get().pose
        await petWin.webContents.executeJavaScript(DRAG_SCRIPT)
        await sleep(800) // 等防抖落盘
        const after = store.get().pose
        const moved = Math.abs(after.x - before.x) > 0.001 || Math.abs(after.y - before.y) > 0.001
        console.log(
          `[smoke] 拖动宠物 → 位置 (${before.x.toFixed(3)},${before.y.toFixed(3)}) → ` +
            `(${after.x.toFixed(3)},${after.y.toFixed(3)}) ${moved ? 'PASS' : 'FAIL'}`
        )

        await petWin.webContents.executeJavaScript(SPEAK_SCRIPT)
        await sleep(3800)
        await capture(petWin, 'pet.png')

        console.log('[smoke] 打开设置页')
        const settings = openSettings()
        await sleep(1800)
        if (settings) await capture(settings, 'settings.png')
      } catch (err) {
        console.error('[smoke] 失败:', err)
      } finally {
        app.quit()
      }
    })()
  })
}
