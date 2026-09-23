import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { iconPath } from './asset-catalog'
import { DIAGNOSTIC_PAGES } from './diagnostic-pages'
import { overlayWindowOptions, secureWebPreferences } from './window-presets'

/**
 * 宠物主窗口：覆盖主显示器工作区的整屏透明层。
 * 模型/气泡/输入框都生活在这一个窗口里，天然避免裁剪；
 * 拖拽 = 移动舞台内模型坐标（归一化持久化），而非移动窗口。
 */
export function createPetWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    ...overlayWindowOptions(
      workArea,
      secureWebPreferences({
        preload: path.join(__dirname, '../preload/index.js'),
        webSecurity: true,
        backgroundThrottling: false,
        spellcheck: false
      })
    ),
    title: 'Live2D Pet',
    icon: iconPath()
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  // 初始全穿透，渲染进程根据命中检测动态切换
  win.setIgnoreMouseEvents(true, { forward: true })

  // 诊断模式（PET_DIAG=1）给页面注入 ?diag=1，启用渲染侧日志；
  // PET_DIAG_PAGE 控制渲染内容分支，用于白屏问题的变量隔离实验
  const diag = process.env['PET_DIAG'] === '1'
  const stage = process.env['PET_DIAG_PAGE']
  const devUrl = process.env['ELECTRON_RENDERER_URL']

  // 渲染参数注入（排障用）：PET_RENDER_QUERY=aa=0&premul=0
  const renderQuery = process.env['PET_RENDER_QUERY']

  if (stage === 'blank' || stage === 'dom') {
    void win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(DIAGNOSTIC_PAGES[stage])}`
    )
    return win
  }

  const params = new URLSearchParams()
  if (diag) params.set('diag', '1')
  if (stage) params.set('stage', stage)
  if (renderQuery) {
    for (const [k, v] of new URLSearchParams(renderQuery)) params.set(k, v)
  }
  const qs = params.toString()

  if (devUrl) {
    const url = new URL(devUrl)
    url.search = qs
    void win.loadURL(url.toString())
  } else {
    void win.loadFile(
      path.join(__dirname, '../renderer/index.html'),
      qs ? { query: Object.fromEntries(params) } : undefined
    )
  }

  win.once('ready-to-show', () => win.showInactive())

  // 分辨率/工作区变化时跟随主显示器
  const refit = (): void => {
    if (win.isDestroyed()) return
    const area = screen.getPrimaryDisplay().workArea
    win.setBounds({ x: area.x, y: area.y, width: area.width, height: area.height })
  }
  screen.on('display-metrics-changed', refit)
  screen.on('display-removed', refit)
  win.on('closed', () => {
    screen.off('display-metrics-changed', refit)
    screen.off('display-removed', refit)
  })

  return win
}
