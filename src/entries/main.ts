import { app, ipcMain, dialog } from 'electron'
import fs from 'node:fs'
import { IPC } from '../contracts/ipc'
import type { DeepPartial } from '../contracts/app-config'
import { store } from '../adapters/shell/config-store'
import { registerPetProtocol, registerPetScheme } from '../adapters/shell/asset-protocol'
import { coreExists, listModels } from '../adapters/shell/asset-catalog'
import { createPetWindow } from '../adapters/shell/pet-window'
import { openSettingsWindow } from '../adapters/shell/settings-window'
import { PetTray } from '../adapters/shell/tray'
import { runSmokeCheck } from '../adapters/shell/smoke-check'
import { BrainGateway } from '../adapters/brain/brain-link'
import {
  applyDiagSwitches,
  diagAppStartup,
  diagWindow,
  DIAG,
  runMinimalProbe,
  runScenario
} from '../adapters/shell/diagnostics'

// 自检/排障专用：把数据目录指到别处，从而与正在运行的实例互不干扰
// （单实例锁与配置都存放在数据目录；正常启动不会走到这里）
const userDataOverride = process.env['PET_USER_DATA']
if (userDataOverride) {
  fs.mkdirSync(userDataOverride, { recursive: true })
  app.setPath('userData', userDataOverride)
  console.log(`[main] userData → ${userDataOverride}`)
}

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

void app.whenReady().then(() => {
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
  gateway.on('status', (s) => petWin?.webContents.send(IPC.brainStatus, s))
  gateway.on('message', (m) => petWin?.webContents.send(IPC.brainMessage, m))
  gateway.start()

  tray = new PetTray({
    onToggleInput: () => petWin?.webContents.send(IPC.toggleInput),
    onResetPose: () => petWin?.webContents.send(IPC.resetPose),
    onOpenSettings: () => openSettingsWindow()
  })

  /* ---------- IPC：渲染进程桥 ---------- */
  ipcMain.handle(IPC.getConfig, () => store.get())

  ipcMain.handle(IPC.setConfig, (_e, patch: DeepPartial<unknown>) => {
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

  ipcMain.handle(IPC.listAssets, () => ({ core: coreExists(), models: listModels() }))

  ipcMain.on(IPC.sendChat, (e, text: unknown) => {
    if (!isFromPet(e.sender) || typeof text !== 'string') return
    gateway?.sendChat(text.slice(0, 2000))
  })

  ipcMain.on(IPC.setIgnoreMouse, (e, ignore: unknown) => {
    if (!isFromPet(e.sender)) return
    petWin?.setIgnoreMouseEvents(!!ignore, { forward: true })
  })

  ipcMain.on(IPC.quit, (e) => {
    if (!isFromPet(e.sender)) return
    app.quit()
  })

  ipcMain.on(IPC.openSettings, () => openSettingsWindow())

  store.onChange((cfg) => {
    if (!petWin || petWin.isDestroyed()) return
    petWin.webContents.send(IPC.configChanged, cfg)
  })

  /* ---------- 冒烟自检（PET_SMOKE=1；见 adapters/shell/smoke-check.ts） ---------- */
  if (process.env['PET_SMOKE'] === '1') {
    runSmokeCheck(petWin, () => openSettingsWindow())
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
