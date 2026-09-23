import { app, BrowserWindow, desktopCapturer, screen } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DIAGNOSTIC_PAGES, type DiagnosticPage } from './diagnostic-pages'
import { overlayWindowOptions, secureWebPreferences } from './window-presets'

/**
 * 渲染诊断（PET_DIAG=1 启用）：
 *  - GPU / 合成状态、窗口与 webContents 生命周期时间线、渲染进程 console 转发
 *  - 窗口 show 后在多个时间点同时抓「屏幕实拍」（desktopCapturer，能反映原生窗口
 *    在真实桌面上的合成结果）与「页面截图」（capturePage，页面自身 alpha），
 *    以区分「页面白」还是「原生合成白」。产出在 .diag/
 *  - PET_DIAG_NOGPU=1 对照实验；PET_DIAG_SWITCH=<a;b> 临时注入 Chromium 开关做 A/B
 */

export const DIAG = process.env['PET_DIAG'] === '1'
const DIAG_NO_GPU = process.env['PET_DIAG_NOGPU'] === '1'
const DIAG_MS = Number(process.env['PET_DIAG_MS'] ?? 7000)

const START = Date.now()
const t = (): string => `+${String(Date.now() - START).padStart(5, ' ')}ms`

export function dlog(tag: string, ...args: unknown[]): void {
  if (!DIAG) return
  console.log(`[diag ${t()}] ${tag}`, ...args)
}

function outDir(): string {
  // 打包态 getAppPath() 指向 app.asar（只读），改用 exe 所在目录
  const base = app.isPackaged
    ? path.dirname(process.execPath)
    : app.getAppPath()
  const label = process.env['PET_DIAG_LABEL']
  return path.join(base, '.diag', ...(label ? [label] : []))
}

/** 必须在 app ready 之前调用 */
export function applyDiagSwitches(): void {
  // PET_SWITCH：无条件注入的 Chromium 开关（实验/排障用，不依赖 PET_DIAG）
  const plain = (process.env['PET_SWITCH'] ?? '')
    .split(/[;,]/)
    .map((v) => v.trim())
    .filter(Boolean)
  for (const s of plain) {
    app.commandLine.appendSwitch(s)
    console.log('[switches] appendSwitch', s)
  }

  // PET_NOGPU：无条件关闭硬件加速（与 PET_DIAG 解耦，供 A/B 实验使用）
  if (process.env['PET_NOGPU'] === '1') {
    app.disableHardwareAcceleration()
    console.log('[switches] disableHardwareAcceleration()')
  }

  if (!DIAG) return
  const raw = process.env['PET_DIAG_SWITCH']
  if (raw) {
    for (const s of raw.split(/[;,]/).map((v) => v.trim()).filter(Boolean)) {
      app.commandLine.appendSwitch(s)
      dlog('appendSwitch', s)
    }
  }
  const features = process.env['PET_DIAG_DISABLE_FEATURES']
  if (features) {
    app.commandLine.appendSwitch('disable-features', features)
    dlog('disable-features', features)
  }
  if (DIAG_NO_GPU) {
    app.disableHardwareAcceleration()
    dlog('disableHardwareAcceleration() 已调用')
  }
}

export function diagAppStartup(): void {
  if (!DIAG) return
  dlog(
    'env',
    JSON.stringify({
      platform: process.platform,
      os: process.getSystemVersion(),
      arch: process.arch,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    })
  )
  dlog('argv', process.argv.join(' '))
  dlog('gpuFeatureStatus', JSON.stringify(app.getGPUFeatureStatus()))
  void app
    .getGPUInfo('basic')
    .then((info) => dlog('gpuInfo(basic)', JSON.stringify(info)))
    .catch((err: unknown) => dlog('gpuInfo failed', String(err)))
}

export function diagWindow(win: BrowserWindow): void {
  if (!DIAG) return

  const snapshot = (): string =>
    JSON.stringify({
      bounds: win.getBounds(),
      bg: win.getBackgroundColor(),
      alwaysOnTop: win.isAlwaysOnTop(),
      visible: win.isVisible(),
      resizable: win.isResizable()
    })

  dlog('window created', snapshot())
  win.on('ready-to-show', () => dlog('win:ready-to-show', snapshot()))
  win.on('show', () => {
    dlog('win:show', snapshot())
    scheduleCaptures(win)
  })
  win.on('focus', () => dlog('win:focus'))
  win.on('blur', () => dlog('win:blur'))
  win.on('closed', () => dlog('win:closed'))

  const wc = win.webContents
  wc.on('dom-ready', () => dlog('wc:dom-ready'))
  wc.on('did-finish-load', () => dlog('wc:did-finish-load'))
  wc.on('did-stop-loading', () => dlog('wc:did-stop-loading'))
  wc.on('did-fail-load', (_e, code, desc, url) => dlog('wc:did-fail-load', code, desc, url))
  wc.on('render-process-gone', (_e, details) => dlog('wc:render-process-gone', JSON.stringify(details)))
  wc.on('unresponsive', () => dlog('wc:unresponsive'))
  wc.on('preload-error', (_e, p, err) => dlog('wc:preload-error', p, String(err)))

  // console-message 的签名在 Electron 各版本间有漂移，两种形态都兼容
  const loose = wc as unknown as { on: (ev: string, cb: (...a: unknown[]) => void) => void }
  loose.on('console-message', (...args: unknown[]) => {
    const first = args[0] as { message?: unknown } | undefined
    if (first && typeof first === 'object' && typeof first.message === 'string') {
      dlog('renderer-console', first.message)
    } else {
      dlog('renderer-console', String(args[2]))
    }
  })

  app.on('child-process-gone', (_e, details) => dlog('child-process-gone', JSON.stringify(details)))
  // 保险丝：无论如何 15s 内退出，避免诊断把终端挂住
  setTimeout(() => {
    dlog('watchdog quit')
    app.quit()
  }, 15000)
}

/**
 * 受控场景实验（PET_DIAG_SCENARIO=dom|webgl|blank|opaque）：
 * 用与宠物窗相同的窗口参数，仅在「内容类型」上做变量隔离，回答：
 *   白屏是由 (a) 透明窗+任意内容  (b) 透明窗+WebGL  (c) 窗口透明属性本身  触发的吗？
 * 时序：窗口 show 前先拍 2 帧背景（测噪声），show 后在 400/1200/2400ms 各拍一帧。
 */
export async function runScenario(which: string): Promise<void> {
  const display = screen.getPrimaryDisplay()
  const area = display.workArea
  const transparent = which !== 'opaque'
  const win = new BrowserWindow({
    ...overlayWindowOptions(area, secureWebPreferences()),
    transparent,
    backgroundColor: transparent ? '#00000000' : '#102040',
    alwaysOnTop: true
  })
  win.setAlwaysOnTop(true, 'screen-saver')

  const html = DIAGNOSTIC_PAGES[which as DiagnosticPage] ?? DIAGNOSTIC_PAGES.dom

  const dir = outDir()
  fs.mkdirSync(dir, { recursive: true })
  dlog(`scenario=${which} transparent=${transparent}`, JSON.stringify(win.getBounds()))

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 400))

  // 1) show 前背景基线 ×2
  await sceneShot(dir, `${which}-bg1.png`)
  await new Promise((r) => setTimeout(r, 350))
  await sceneShot(dir, `${which}-bg2.png`)

  // 2) 显示窗口
  win.showInactive()
  dlog(`scenario=${which} shown`)

  // 3) 显示后多时间点
  for (const ms of [400, 1200, 2400, 4000]) {
    await new Promise((r) => setTimeout(r, ms === 400 ? 400 : ms - (ms === 1200 ? 400 : ms === 2400 ? 1200 : 2400)))
    await sceneShot(dir, `${which}-after-${String(ms).padStart(4, '0')}ms.png`)
    // 同时记录页面自身 alpha 作为对照
    try {
      const page = await win.webContents.capturePage()
      fs.writeFileSync(path.join(dir, `${which}-page-${String(ms).padStart(4, '0')}ms.png`), page.toPNG())
    } catch {
      /* ignore */
    }
  }

  app.quit()
}

async function sceneShot(dir: string, name: string): Promise<void> {
  try {
    const display = screen.getPrimaryDisplay()
    const scale = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale)
      }
    })
    const src = sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]
    if (src && !src.thumbnail.isEmpty()) {
      fs.writeFileSync(path.join(dir, name), src.thumbnail.toPNG())
      dlog('scene shot', name)
    }
  } catch (err) {
    dlog('scene shot failed', name, String(err))
  }
}

const CAPTURE_TIMES = [0, 150, 400, 900, 1800, 3200, 5200]
let capturesStarted = false

/**
 * 最小对照探测：一个不含 Pixi/WebGL 的透明窗口 + 半透明红块。
 * 用于判定「白屏」是环境级（软件合成不支持透明窗）还是应用级（渲染内容触发）。
 */
export function runMinimalProbe(): void {
  const win = new BrowserWindow({
    ...overlayWindowOptions({ x: 120, y: 120, width: 720, height: 480 }, secureWebPreferences()),
    alwaysOnTop: true
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  dlog('minimal probe window created', JSON.stringify(win.getBounds()))
  void win.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(DIAGNOSTIC_PAGES.minimal)}`
  )
  win.on('show', () => {
    dlog('minimal probe shown')
    scheduleCaptures(win)
  })
  win.showInactive()
}

function scheduleCaptures(win: BrowserWindow): void {
  if (capturesStarted) return
  capturesStarted = true
  for (const ms of CAPTURE_TIMES) {
    setTimeout(() => void captureAt(win, ms), ms)
  }
  setTimeout(() => {
    dlog('diag finished → quit')
    app.quit()
  }, DIAG_MS)
}

async function captureAt(win: BrowserWindow, ms: number): Promise<void> {
  const name = String(ms).padStart(4, '0')
  const prefix = process.env['PET_DIAG_MINIMAL'] === '1' ? 'min' : ''
  const dir = outDir()
  fs.mkdirSync(dir, { recursive: true })

  // 1) 屏幕实拍：包含原生窗口合成的最终结果
  try {
    const display = screen.getPrimaryDisplay()
    const scale = display.scaleFactor || 1
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: Math.round(display.size.width * scale),
        height: Math.round(display.size.height * scale)
      }
    })
    const src = sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]
    if (src && !src.thumbnail.isEmpty()) {
      fs.writeFileSync(path.join(dir, `${prefix}screen-${name}ms.png`), src.thumbnail.toPNG())
      const sz = src.thumbnail.getSize()
      dlog(`shot ${prefix}screen-${name}ms`, `${sz.width}x${sz.height}`)
    } else {
      dlog(`shot ${prefix}screen-${name}ms`, 'empty thumbnail')
    }
  } catch (err) {
    dlog(`shot ${prefix}screen-${name}ms failed`, String(err))
  }

  // 2) 页面截图：对照页面自身 alpha 是否透明
  try {
    const img = await win.webContents.capturePage()
    fs.writeFileSync(path.join(dir, `${prefix}page-${name}ms.png`), img.toPNG())
  } catch (err) {
    dlog(`shot ${prefix}page-${name}ms failed`, String(err))
  }
}
