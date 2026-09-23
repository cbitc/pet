import { app, ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DeepPartial } from '../shared/config'
import { store } from './store'
import { registerPetProtocol, registerPetScheme } from './protocol'
import { coreExists, listModels } from './resources'
import { createPetWindow } from './pet-window'
import { openSettingsWindow } from './settings-window'
import { PetTray } from './tray'
import { BrainGateway } from './brain-gateway'
import {
  applyDiagSwitches,
  diagAppStartup,
  diagWindow,
  DIAG,
  runMinimalProbe,
  runScenario
} from './diagnostics'

// 单实例：重复启动时聚焦已有宠物
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', () => petWin?.showInactive())

applyDiagSwitches()
registerPetScheme()

let petWin: ReturnType<typeof createPetWindow> | null = null
let gateway: BrainGateway | null = null
let tray: PetTray | null = null

const isFromPet = (sender: Electron.WebContents): boolean =>
  !!petWin && !petWin.isDestroyed() && sender.id === petWin.webContents.id

app.whenReady().then(() => {
  diagAppStartup()
  store.init()
  registerPetProtocol()

  // 最小对照实验：只开一个无 Pixi 的透明窗，验证环境是否支持透明合成
  if (DIAG && process.env['PET_DIAG_MINIMAL'] === '1') {
    runMinimalProbe()
    return
  }

  // 受控场景实验：隔离「内容类型」变量，定位白屏触发条件
  const scenario = process.env['PET_DIAG_SCENARIO']
  if (DIAG && scenario) {
    void runScenario(scenario)
    return
  }

  petWin = createPetWindow()
  diagWindow(petWin)
  petWin.webContents.on('render-process-gone', (_e, details) => {
    console.error('[main] render-process-gone:', JSON.stringify(details))
  })

  gateway = new BrainGateway(() => store.get())
  gateway.on('status', (s) => petWin?.webContents.send('brain:status', s))
  gateway.on('message', (m) => petWin?.webContents.send('brain:message', m))
  gateway.start()

  tray = new PetTray({
    onToggleInput: () => petWin?.webContents.send('ui:toggle-input'),
    onResetPose: () => petWin?.webContents.send('ui:reset-pose'),
    onOpenSettings: () => openSettingsWindow()
  })

  /* ---------- IPC：渲染进程桥 ---------- */
  ipcMain.handle('config:get', () => store.get())

  ipcMain.handle('config:set', (_e, patch: DeepPartial<unknown>) => {
    const prev = store.get()
    const next = store.set(patch)
    if (next.brain.mode !== prev.brain.mode || next.brain.url !== prev.brain.url) {
      gateway?.restart()
    }
    if (next.openAtLogin !== prev.openAtLogin) {
      app.setLoginItemSettings({ openAtLogin: next.openAtLogin, path: process.execPath })
    }
    return next
  })

  ipcMain.handle('models:list', () => ({ core: coreExists(), models: listModels() }))

  ipcMain.on('brain:send', (e, text: unknown) => {
    if (!isFromPet(e.sender) || typeof text !== 'string') return
    gateway?.sendChat(text.slice(0, 2000))
  })

  ipcMain.on('window:set-ignore-mouse', (e, ignore: unknown) => {
    if (!isFromPet(e.sender)) return
    petWin?.setIgnoreMouseEvents(!!ignore, { forward: true })
  })

  ipcMain.on('app:quit', (e) => {
    if (!isFromPet(e.sender)) return
    app.quit()
  })

  ipcMain.on('app:open-settings', () => openSettingsWindow())

  store.onChange((cfg) => {
    if (!petWin || petWin.isDestroyed()) return
    petWin.webContents.send('config:changed', cfg)
  })

  /* ---------- 冒烟模式：自动发起一轮对话 + 打开设置页，分别截图后退出 ---------- */
  if (process.env['PET_SMOKE'] === '1') {
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    const capture = async (win: Electron.BrowserWindow, name: string): Promise<void> => {
      try {
        const img = await win.webContents.capturePage()
        // 打包态 getAppPath() 指向 app.asar（只读），改用 exe 所在目录
        const outDir = app.isPackaged
          ? path.join(path.dirname(process.execPath), '.smoke')
          : path.join(app.getAppPath(), '.smoke')
        fs.mkdirSync(outDir, { recursive: true })
        fs.writeFileSync(path.join(outDir, name), img.toPNG())
        console.log(`[smoke] screenshot -> ${path.join(outDir, name)}`)
      } catch (err) {
        console.error(`[smoke] capture ${name} failed`, err)
      }
    }
    petWin.once('ready-to-show', () => {
      void (async () => {
        try {
          await sleep(1500)

          // 1) 点击宠物：应当被识别为点击（而非拖动）→ 输入框弹出
          const clickResult = (await petWin!.webContents.executeJavaScript(
            `(async () => {
              const cfg = await window.pet.getConfig()
              const at = {
                x: Math.round(innerWidth * cfg.pose.x),
                y: Math.round(innerHeight * cfg.pose.y)
              }
              const down = new PointerEvent('pointerdown', { ...at, bubbles: true, button: 0 })
              Object.defineProperty(down, 'clientX', { value: at.x })
              Object.defineProperty(down, 'clientY', { value: at.y })
              window.dispatchEvent(down)
              window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
              await new Promise((r) => setTimeout(r, 120))
              return { at, inputVisible: !document.getElementById('input-bar').hidden }
            })()`
          )) as { at: { x: number; y: number }; inputVisible: boolean }
          console.log(
            `[smoke] 点击宠物 @${clickResult.at.x},${clickResult.at.y} → 输入框${clickResult.inputVisible ? '已弹出 PASS' : '未弹出 FAIL'}`
          )

          // 2) 拖动宠物：应当被识别为拖动 → 位置改变并在防抖后落盘
          const before = store.get().pose
          await petWin!.webContents.executeJavaScript(
            `(async () => {
              const cfg = await window.pet.getConfig()
              const start = {
                x: Math.round(innerWidth * cfg.pose.x),
                y: Math.round(innerHeight * cfg.pose.y)
              }
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
          )
          await sleep(800) // 等防抖落盘
          const after = store.get().pose
          const moved =
            Math.abs(after.x - before.x) > 0.001 || Math.abs(after.y - before.y) > 0.001
          console.log(
            `[smoke] 拖动宠物 → 位置 (${before.x.toFixed(3)},${before.y.toFixed(3)}) → ` +
              `(${after.x.toFixed(3)},${after.y.toFixed(3)}) ${moved ? 'PASS' : 'FAIL'}`
          )

          // 3) 在（已弹出的）输入框里说一句话，走完 输入→运行时→IPC→网关→Mock大脑→流式回包 全链路
          await petWin!.webContents.executeJavaScript(
            `(() => {
              const input = document.getElementById('chat-input')
              input.value = '你好呀，冒烟测试！'
              input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
              return 'ok'
            })()`
          )
          await sleep(3800)
          await capture(petWin!, 'pet.png')

          console.log('[smoke] 打开设置页')
          const settings = openSettingsWindow()
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
})

app.on('window-all-closed', () => {
  app.quit()
})

app.on('before-quit', () => {
  gateway?.dispose()
  tray?.destroy()
})

// 拦截渲染进程未捕获异常，避免静默失败
process.on('uncaughtException', (err) => {
  console.error('[main] uncaughtException:', err)
  dialog.showErrorBox('Live2D Pet - 主进程异常', String(err?.stack ?? err))
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] unhandledRejection:', reason)
})
