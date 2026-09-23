import { BrowserWindow } from 'electron'
import path from 'node:path'
import { iconPath } from './resources'

let settingsWin: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow | null {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.show()
    settingsWin.focus()
    return settingsWin
  }
  settingsWin = new BrowserWindow({
    width: 480,
    height: 620,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    title: '桌宠设置',
    icon: iconPath(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  settingsWin.setMenuBarVisibility(false)

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void settingsWin.loadURL(`${devUrl}/settings.html`)
  } else {
    void settingsWin.loadFile(path.join(__dirname, '../renderer/settings.html'))
  }
  settingsWin.once('ready-to-show', () => settingsWin?.show())
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  return settingsWin
}
