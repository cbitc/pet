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

// 单实例：重复启动时聚焦已有宠物
if (!app.requestSingleInstanceLock()) {
  app.quit()
}
app.on('second-instance', () => petWin?.showInactive())

registerPetScheme()

let petWin: ReturnType<typeof createPetWindow> | null = null
let gateway: BrainGateway | null = null
let tray: PetTray | null = null

const isFromPet = (sender: Electron.WebContents): boolean =>
  !!petWin && !petWin.isDestroyed() && sender.id === petWin.webContents.id

app.whenReady().then(() => {
  store.init()
  registerPetProtocol()

  petWin = createPetWindow()
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
          await sleep(1200)
          // 走真实 UI 路径：输入框填入文本并回车，覆盖 input→controller→bridge→网关→Mock大脑→流式回包 全链路
          await petWin!.webContents.executeJavaScript(
            `(() => {
              const input = document.getElementById('chat-input')
              const bar = document.getElementById('input-bar')
              bar.hidden = false
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
