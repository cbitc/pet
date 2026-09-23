import { BrowserWindow, screen } from 'electron'
import path from 'node:path'
import { iconPath } from './resources'

/**
 * 宠物主窗口：覆盖主显示器工作区的整屏透明层。
 * 模型/气泡/输入框都生活在这一个窗口里，天然避免裁剪；
 * 拖拽 = 移动舞台内模型坐标（归一化持久化），而非移动窗口。
 */
export function createPetWindow(): BrowserWindow {
  const workArea = screen.getPrimaryDisplay().workArea
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    title: 'Live2D Pet',
    icon: iconPath(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  })

  win.setAlwaysOnTop(true, 'screen-saver')
  // 初始全穿透，渲染进程根据命中检测动态切换
  win.setIgnoreMouseEvents(true, { forward: true })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
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
